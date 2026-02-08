import { PDFDocument, degrees, rgb, StandardFonts, PDFName, PDFDict, PDFStream, PDFRef, PDFArray, PDFNumber } from 'pdf-lib';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pako from 'pako';
import { renderAsync } from 'docx-preview';
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

/**
 * Intelligent Stream Cleaner
 * Removes watermarks by analyzing content stream operators.
 */
const cleanContentStream = (stream: string): string => {
  let clean = stream;
  clean = clean.replace(/\/Artifact\s*BMC[\s\S]*?EMC/g, '');
  clean = clean.replace(/\/Artifact\s*BDC[\s\S]*?EMC/g, '');
  clean = clean.replace(/\/Watermark\s*BMC[\s\S]*?EMC/g, '');
  clean = clean.replace(/\/Watermark\s*BDC[\s\S]*?EMC/g, '');
  clean = clean.replace(/\/Artifact\s*<<[\s\S]*?>>\s*BDC[\s\S]*?EMC/g, '');
  
  clean = clean.replace(/BT[\s\S]*?ET/g, (block) => {
    const tmRegex = /(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+(-?[\d\.]+)\s+Tm/g;
    let match;
    while ((match = tmRegex.exec(block)) !== null) {
       const b = parseFloat(match[2]);
       const c = parseFloat(match[3]);
       if (Math.abs(b) > 0.05 || Math.abs(c) > 0.05) {
         return ''; 
       }
    }
    return block;
  });

  return clean;
};

export const removeWatermarks = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const pages = pdfDoc.getPages();
  
  const catalog = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Root) as PDFDict;
  if (catalog) {
    catalog.delete(PDFName.of('OCProperties'));
    catalog.delete(PDFName.of('Perms')); 
    catalog.delete(PDFName.of('AcroForm')); 
  }

  for (const page of pages) {
    page.node.delete(PDFName.of('Annots'));
    page.node.delete(PDFName.of('PieceInfo'));
    page.node.delete(PDFName.of('StructParents'));
    
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
        const filter = stream.dict.get(PDFName.of('Filter'));
        if (filter === PDFName.of('FlateDecode') || (Array.isArray(filter) && filter.includes(PDFName.of('FlateDecode')))) {
           try {
             rawData = pako.inflate(rawData);
           } catch (e) {
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
        console.error(err);
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

// ============================================================================
// WORD TO PDF (Robust Implementation)
// ============================================================================
export const convertWordToPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Create a wrapper that is rendered but hidden from view
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '0';
  wrapper.style.left = '-10000px'; // Off-screen
  wrapper.style.width = '210mm'; // Standard A4 width
  wrapper.style.backgroundColor = '#ffffff';
  wrapper.style.zIndex = '-9999';
  document.body.appendChild(wrapper);

  try {
    let success = false;
    
    // Attempt 1: docx-preview (High Fidelity)
    try {
      await renderAsync(arrayBuffer, wrapper, null, {
        className: 'docx-content',
        inWrapper: false,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        debug: false,
        experimental: false
      });
      
      // Wait for rendering
      await new Promise(r => setTimeout(r, 1000));
      
      // Basic check if content rendered
      if (wrapper.innerText.length > 0 || wrapper.querySelectorAll('svg, img').length > 0) {
        success = true;
      }
    } catch (e) {
      console.warn("docx-preview failed, falling back...");
    }

    // Attempt 2: Mammoth (Fallback if docx-preview fails or renders empty)
    if (!success) {
      wrapper.innerHTML = ''; // Clear
      const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
      wrapper.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 40px; color: #000; line-height: 1.6;">
          ${result.value}
        </div>
      `;
    }

    // Force styles to ensure visibility for the PDF engine
    const style = document.createElement('style');
    style.innerHTML = `
      .docx-content { background: white !important; color: black !important; }
      * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    `;
    wrapper.appendChild(style);

    // @ts-ignore
    if (typeof window.html2pdf === 'undefined') {
      throw new Error("PDF Engine not loaded");
    }

    // @ts-ignore
    const worker = window.html2pdf();
    const pdfBlob = await worker.set({
      margin: [10, 10, 10, 10], // mm
      filename: file.name.replace(/\.[^/.]+$/, "") + ".pdf",
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true 
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(wrapper).output('blob');

    return pdfBlob;

  } finally {
    if (document.body.contains(wrapper)) {
      document.body.removeChild(wrapper);
    }
  }
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

export const addPageNumbers = async (file: File, colorHex: string = '#000000'): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const color = hexToRgb(colorHex);
  
  pages.forEach((page, idx) => {
    page.drawText(`Page ${idx + 1} of ${pages.length}`, {
      x: page.getWidth() / 2 - 30,
      y: 20,
      size: 10,
      font,
      color: rgb(color.r, color.g, color.b),
    });
  });
  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
};

export const addHeaderFooter = async (
  file: File, 
  headerText: string, 
  footerText: string, 
  colorHex: string = '#000000',
  headerAlign: 'left' | 'center' | 'right' = 'center',
  footerAlign: 'left' | 'center' | 'right' = 'center'
): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const color = hexToRgb(colorHex);
  const margin = 30;

  pages.forEach(page => {
    const { width, height } = page.getSize();
    const fontSize = 10;
    
    if (headerText) {
      const headerWidth = font.widthOfTextAtSize(headerText, fontSize);
      let headerX = (width - headerWidth) / 2;
      
      if (headerAlign === 'left') headerX = margin;
      else if (headerAlign === 'right') headerX = width - headerWidth - margin;
      
      page.drawText(headerText, {
        x: headerX,
        y: height - 20,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
      });
    }

    if (footerText) {
      const footerWidth = font.widthOfTextAtSize(footerText, fontSize);
      let footerX = (width - footerWidth) / 2;
      
      if (footerAlign === 'left') footerX = margin;
      else if (footerAlign === 'right') footerX = width - footerWidth - margin;

      page.drawText(footerText, {
        x: footerX,
        y: 20,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
      });
    }
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
          y: height - edit.y - (edit.fontSize || 12),
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
