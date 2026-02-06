import { PDFDocument, degrees, rgb, StandardFonts, PDFName, PDFDict, PDFStream, PDFRef, PDFArray, PDFNumber, decodePDFRawStream } from 'pdf-lib';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pako from 'pako';
import { PDFEdits } from '../types';

const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

// Helper for hex to RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
};

export const mergePDFs = async (files: File[]): Promise<Blob> => {
  const mergedPdf = await PDFDocument.create();
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  const pdfBytes = await mergedPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const splitPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const zip = new JSZip();
  const folder = zip.folder("split_pages");
  const numberOfPages = pdf.getPageCount();

  for (let i = 0; i < numberOfPages; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdf, [i]);
    newPdf.addPage(copiedPage);
    const pdfBytes = await newPdf.save();
    const pageNum = (i + 1).toString().padStart(3, '0');
    folder?.file(`page_${pageNum}.pdf`, pdfBytes);
  }
  return await zip.generateAsync({ type: "blob" });
};

export const rotatePDF = async (file: File, rotationAngle: number): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdf.getPages();
  pages.forEach(page => {
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + rotationAngle));
  });
  const pdfBytes = await pdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

const extractLegacyDocText = (arrayBuffer: ArrayBuffer): string => {
  const dataView = new DataView(arrayBuffer);
  const fileSize = dataView.byteLength;
  const uint8 = new Uint8Array(arrayBuffer);
  
  let paragraphs: string[] = [];
  let currentRun = "";
  
  const isReadable = (code: number) => {
    return (code >= 32 && code <= 126) || 
           (code >= 160 && code <= 255) || 
           [9, 10, 13].includes(code) || 
           (code >= 0x2000 && code <= 0x206F); 
  };

  for (let i = 0; i < fileSize - 1; i += 2) {
    const charCode = dataView.getUint16(i, true);
    if (isReadable(charCode) || charCode === 0) {
      if (charCode !== 0) {
        currentRun += String.fromCharCode(charCode);
      }
    } else {
      if (currentRun.length > 4) { 
        if (!/[^\w\s.,?!'"-]/.test(currentRun) || currentRun.includes(' ')) {
           paragraphs.push(currentRun.trim());
        }
      }
      currentRun = "";
    }
  }

  if (paragraphs.length < 5) {
     let ansiRun = "";
     for (let i = 0; i < fileSize; i++) {
        const charCode = uint8[i];
        if (isReadable(charCode)) {
           ansiRun += String.fromCharCode(charCode);
        } else {
           if (ansiRun.length > 4) {
             ansiRun.split(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/).forEach(segment => {
                if (segment.length > 4) paragraphs.push(segment.trim());
             });
           }
           ansiRun = "";
        }
     }
  }

  const uniqueParas = [...new Set(paragraphs)]
    .filter(p => p.length > 5)
    .filter(p => !p.match(/^[0-9\W]+$/)); 

  if (uniqueParas.length === 0) {
    return `<p style="color:#e11d48; text-align:center; padding: 20px;">
      <em>We detected a legacy .doc file, but were unable to extract readable text.</em>
    </p>`;
  }

  return uniqueParas.map(p => `<p class="MsoNormal">${p}</p>`).join("\n");
};

/**
 * Intelligent Stream Cleaner
 * Removes watermarks by analyzing content stream operators.
 */
const cleanContentStream = (stream: string): string => {
  let clean = stream;

  // 1. Remove Marked Content Artifacts (BDC ... EMC)
  clean = clean.replace(/\/Artifact\s*BMC[\s\S]*?EMC/g, '');
  clean = clean.replace(/\/Artifact\s*BDC[\s\S]*?EMC/g, '');
  clean = clean.replace(/\/Watermark\s*BMC[\s\S]*?EMC/g, '');
  clean = clean.replace(/\/Watermark\s*BDC[\s\S]*?EMC/g, '');
  // Loose match for artifacts with property lists
  clean = clean.replace(/\/Artifact\s*<<[\s\S]*?>>\s*BDC[\s\S]*?EMC/g, '');

  // 2. Remove Rotated Text Blocks (BT ... Tm ... ET)
  // Text Matrix: a b c d e f Tm
  clean = clean.replace(/BT[\s\S]*?ET/g, (block) => {
    // Look for Tm operator
    const tmRegex = /(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+Tm/g;
    let match;
    while ((match = tmRegex.exec(block)) !== null) {
       const b = parseFloat(match[2]);
       const c = parseFloat(match[3]);
       // Check for rotation (b or c != 0)
       if (Math.abs(b) > 0.05 || Math.abs(c) > 0.05) {
         return ''; // Delete rotated block
       }
    }
    return block;
  });

  // 3. Remove Rotated Graphics State Groups (q ... cm ... BT ... ET ... Q)
  // Pattern: q [matrix] cm [text block] Q
  // This removes text blocks that are wrapped in a rotated coordinate system
  clean = clean.replace(/q\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+cm\s+[\s\S]*?BT[\s\S]*?ET[\s\S]*?Q/g, (match, a, b, c, d, e, f) => {
      const bVal = parseFloat(b);
      const cVal = parseFloat(c);
      if (Math.abs(bVal) > 0.05 || Math.abs(cVal) > 0.05) {
          return ''; // Delete rotated group
      }
      return match;
  });

  // 4. Remove Rotated XObjects/Images (q ... cm ... Do ... Q)
  clean = clean.replace(/q\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+cm\s+[\s\S]*?\/[a-zA-Z0-9_]+\s+Do\s+Q/g, (match, a, b, c, d, e, f) => {
      const bVal = parseFloat(b);
      const cVal = parseFloat(c);
      if (Math.abs(bVal) > 0.05 || Math.abs(cVal) > 0.05) {
          return ''; // Delete rotated image placement
      }
      return match;
  });

  // 5. Targeted Removal: Known Watermark Strings
  // Based on the user's issue description, we can try to remove specific text patterns if they appear in text show operators (Tj/TJ)
  // This is a "nuclear" option for stubborn text watermarks.
  // We remove the entire line containing the string.
  const badStrings = ['Hardik', 'Kabra']; // Split parts to be safe
  badStrings.forEach(s => {
      const re = new RegExp(`\\([^\\)]*${s}[^\\)]*\\)\\s*Tj`, 'gi');
      clean = clean.replace(re, '');
      // Handle TJ arrays: [(...Hardik...)] TJ
      const reTJ = new RegExp(`\\[[^\\]]*${s}[^\\]]*\\]\\s*TJ`, 'gi');
      clean = clean.replace(reTJ, '');
  });

  return clean;
};

export const removeWatermarks = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const pages = pdfDoc.getPages();
  const pageCount = pages.length;

  // 1. GLOBAL CLEANUP
  const catalog = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Root) as PDFDict;
  if (catalog) {
    catalog.delete(PDFName.of('OCProperties')); // Removes Layers
    catalog.delete(PDFName.of('Perms')); 
    catalog.delete(PDFName.of('AcroForm')); 
  }

  // 2. IDENTIFY SHARED XOBJECTS
  const xObjectUsage = new Map<string, number>();
  pages.forEach(page => {
    const resources = page.node.get(PDFName.of('Resources'));
    if (resources instanceof PDFDict) {
      const xObjects = resources.get(PDFName.of('XObject'));
      if (xObjects instanceof PDFDict) {
        xObjects.keys().forEach(key => {
          const ref = xObjects.get(key);
          if (ref instanceof PDFRef) xObjectUsage.set(ref.toString(), (xObjectUsage.get(ref.toString()) || 0) + 1);
        });
      }
    }
  });

  const sharedThreshold = pageCount > 2 ? Math.ceil(pageCount * 0.8) : 999;
  const idsToRemove = new Set<string>();
  xObjectUsage.forEach((count, id) => { if (count >= sharedThreshold) idsToRemove.add(id); });

  for (const page of pages) {
    // 3. PAGE LEVEL CLEANUP
    page.node.delete(PDFName.of('Annots'));
    page.node.delete(PDFName.of('PieceInfo'));
    page.node.delete(PDFName.of('StructParents'));
    
    // Clean Resources
    const resources = page.node.get(PDFName.of('Resources'));
    if (resources instanceof PDFDict) {
      resources.delete(PDFName.of('Properties')); 
      const xObjects = resources.get(PDFName.of('XObject'));
      if (xObjects instanceof PDFDict) {
        xObjects.keys().forEach(key => {
          const ref = xObjects.get(key);
          if (ref instanceof PDFRef) {
             if (idsToRemove.has(ref.toString())) {
               xObjects.delete(key);
             } else {
               const obj = pdfDoc.context.lookup(ref);
               if (obj instanceof PDFDict && obj.get(PDFName.of('Subtype')) === PDFName.of('Form')) {
                 xObjects.delete(key);
               }
             }
           }
        });
      }
    }

    // 4. CONTENT STREAM CLEANING
    const contents = page.node.Contents();
    let contentStreams: PDFStream[] = [];
    
    if (contents instanceof PDFStream) {
      contentStreams.push(contents);
    } else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const ref = contents.get(i);
        const stream = pdfDoc.context.lookup(ref);
        if (stream instanceof PDFStream) contentStreams.push(stream);
      }
    } else if (contents instanceof PDFRef) {
      const stream = pdfDoc.context.lookup(contents);
      if (stream instanceof PDFStream) contentStreams.push(stream);
      else if (stream instanceof PDFArray) {
         for (let i = 0; i < stream.size(); i++) {
            const r = stream.get(i);
            const s = pdfDoc.context.lookup(r);
            if (s instanceof PDFStream) contentStreams.push(s);
         }
      }
    }

    for (const stream of contentStreams) {
      try {
        let rawData = stream.getContents();
        
        // Decompress if needed (FlateDecode)
        const filter = stream.dict.get(PDFName.of('Filter'));
        if (filter === PDFName.of('FlateDecode') || (Array.isArray(filter) && filter.includes(PDFName.of('FlateDecode')))) {
           try {
             rawData = pako.inflate(rawData);
           } catch (e) {
             console.warn("Decompression failed, skipping stream", e);
             continue;
           }
        }
        
        const contentStr = new TextDecoder().decode(rawData);
        const cleanedStr = cleanContentStream(contentStr);

        if (contentStr.length !== cleanedStr.length) {
          const newData = pako.deflate(new TextEncoder().encode(cleanedStr));
          (stream as any).contents = newData;
          stream.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
          stream.dict.set(PDFName.of('Length'), PDFNumber.of(newData.length));
        }
      } catch (err) {
        console.error("Error processing stream content", err);
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const convertWordToPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  let htmlContent = '';

  const headerArr = new Uint8Array(arrayBuffer.slice(0, 4));
  const header = Array.from(headerArr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const isLegacyDoc = header === 'D0CF11E0' || file.name.toLowerCase().endsWith('.doc');

  if (isLegacyDoc) {
    console.log("Legacy format detected.");
    htmlContent = extractLegacyDocText(arrayBuffer);
    const banner = `
      <div style="font-size: 9pt; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; text-align: center;">
        Converted from Legacy Word Format (.doc). Layout reconstruction is approximate.
      </div>
    `;
    htmlContent = banner + htmlContent;

  } else {
    try {
      const convertToHtml = (mammoth as any).convertToHtml || mammoth.convertToHtml;
      const result = await convertToHtml({ 
        arrayBuffer,
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Title'] => h1.doc-main-title:fresh",
          "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
          "table => table.doc-table"
        ]
      });
      htmlContent = result.value;
      if (!htmlContent.trim()) throw new Error("Empty XML");
    } catch (err) {
      console.warn("Mammoth failed, attempting binary fallback.");
      htmlContent = extractLegacyDocText(arrayBuffer);
    }
  }

  const container = document.createElement('div');
  container.innerHTML = `
    <div style="font-family: 'Calibri', 'Arial', sans-serif; color: #000; line-height: 1.6; font-size: 11pt; background: white;">
      <style>
        h1 { color: #2F5496; font-size: 20pt; margin: 24pt 0 12pt; font-weight: bold; }
        h2 { color: #2F5496; font-size: 16pt; margin: 18pt 0 8pt; font-weight: bold; }
        p { margin-bottom: 10pt; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #cbd5e1; }
        td, th { border: 1px solid #cbd5e1; padding: 8px 12px; vertical-align: top; }
        img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
      </style>
      ${htmlContent}
    </div>
  `;

  // @ts-ignore
  if (typeof window.html2pdf !== 'function') throw new Error("PDF Engine not ready.");
  
  const opt = {
    margin: [15, 15, 15, 15],
    filename: file.name.replace(/\.(docx?|doc)$/i, '.pdf'),
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // @ts-ignore
  return await window.html2pdf().set(opt).from(container).output('blob');
};

export const imagesToPDF = async (files: File[]): Promise<Blob> => {
  const pdfDoc = await PDFDocument.create();
  for (const file of files) {
    const imageBytes = await file.arrayBuffer();
    let image = file.type.includes('png') ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const pdfToImages = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument(arrayBuffer).promise;
  const zip = new JSZip();
  const folder = zip.folder("pdf_images");

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const context = canvas.getContext('2d');
    if (context) {
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      folder?.file(`page_${i.toString().padStart(3, '0')}.jpg`, canvas.toDataURL('image/jpeg').split(',')[1], { base64: true });
    }
  }
  return await zip.generateAsync({ type: "blob" });
};

export const addWatermark = async (file: File, text: string): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  pdfDoc.getPages().forEach(page => {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 4,
      y: height / 2,
      size: 50,
      font,
      color: rgb(0.8, 0.8, 0.8),
      opacity: 0.4,
      rotate: degrees(45),
    });
  });
  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
};

export const addPageNumbers = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  pages.forEach((page, idx) => {
    page.drawText(`Page ${idx + 1} of ${pages.length}`, {
      x: page.getWidth() / 2 - 30,
      y: 20,
      size: 10,
      font,
    });
  });
  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
};

export const cropPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  pdfDoc.getPages().forEach(page => {
    const { width, height } = page.getSize();
    page.setCropBox(50, 50, width - 100, height - 100);
  });
  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
};

export const repairPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
};

export const saveAnnotatedPDF = async (file: File, edits: PDFEdits): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const times = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  for (const [pageIndexStr, pageEdits] of Object.entries(edits)) {
    const pageIndex = parseInt(pageIndexStr, 10);
    if (pageIndex >= pages.length) continue;
    
    const page = pages[pageIndex];
    const { height } = page.getSize();

    for (const edit of pageEdits) {
      if (edit.type === 'text' && edit.text) {
        const color = hexToRgb(edit.color || '#000000');
        let font = helvetica;
        if (edit.fontFamily === 'Times-Roman') font = times;
        if (edit.fontFamily === 'Courier') font = courier;

        page.drawText(edit.text, {
          x: edit.x,
          y: height - edit.y - (edit.fontSize || 12), // Flip Y
          size: edit.fontSize || 12,
          font: font,
          color: rgb(color.r, color.g, color.b),
        });
      } else if (edit.type === 'rectangle') {
        const color = hexToRgb(edit.backgroundColor || '#ffffff');
        page.drawRectangle({
          x: edit.x,
          y: height - edit.y - (edit.height || 0),
          width: edit.width || 100,
          height: edit.height || 50,
          color: rgb(color.r, color.g, color.b),
          opacity: edit.opacity || 1
        });
      } else if (edit.type === 'image' && edit.imageData) {
        try {
          let image;
          if (edit.imageData.startsWith('data:image/png')) {
            image = await pdfDoc.embedPng(edit.imageData);
          } else {
            image = await pdfDoc.embedJpg(edit.imageData);
          }
          page.drawImage(image, {
            x: edit.x,
            y: height - edit.y - (edit.height || 100),
            width: edit.width || 100,
            height: edit.height || 100,
            opacity: edit.opacity || 1
          });
        } catch (e) {
          console.error("Failed to embed image", e);
        }
      } else if (edit.type === 'drawing' && edit.path && edit.path.length > 1) {
        const color = hexToRgb(edit.color || '#000000');
        const path = edit.path;
        for (let i = 0; i < path.length - 1; i++) {
          const start = path[i];
          const end = path[i+1];
          page.drawLine({
            start: { x: start.x, y: height - start.y },
            end: { x: end.x, y: height - end.y },
            thickness: edit.lineWidth || 2,
            color: rgb(color.r, color.g, color.b),
            opacity: edit.opacity || 1
          });
        }
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};
