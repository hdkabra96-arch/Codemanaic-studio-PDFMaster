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

// ============================================================================
// WORD TO PDF (REBUILT FOR MAXIMUM STABILITY)
// ============================================================================
export const convertWordToPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  
  /**
   * THE "VISIBLE GHOST" TECHNIQUE
   * html2canvas (the PDF engine) often returns blank if elements are 'fixed' or 'display:none'.
   * We place it in the normal flow but hide it using height:0/overflow:hidden.
   * This forces the browser to 'paint' the content, making it visible to the capture engine.
   */
  const ghost = document.createElement('div');
  ghost.id = 'word-to-pdf-ghost-container';
  Object.assign(ghost.style, {
    position: 'absolute',
    bottom: '0',
    left: '0',
    width: '210mm', // Standard A4 width
    height: '1px',
    overflow: 'hidden',
    visibility: 'visible',
    opacity: '0',
    pointerEvents: 'none',
    backgroundColor: '#ffffff'
  });
  
  // High-quality rendering container inside the ghost
  const content = document.createElement('div');
  Object.assign(content.style, {
    padding: '20mm',
    backgroundColor: '#ffffff',
    color: '#000000',
    minHeight: '297mm',
    width: '100%'
  });
  ghost.appendChild(content);
  document.body.appendChild(ghost);

  try {
    // 1. Convert Word Content to HTML using Mammoth (Stable HTML extraction)
    // This is the JS equivalent of the Python 'docx' library approach.
    const options = {
      styleMap: [
        "p[style-name='Header'] => h1:fresh",
        "p[style-name='Footer'] => p:fresh",
        "table => table.table:fresh"
      ]
    };
    
    const result = await mammoth.convertToHtml({ arrayBuffer }, options);
    content.innerHTML = `
      <style>
        .word-render { font-family: 'Segoe UI', Calibri, Arial, sans-serif; line-height: 1.5; color: #000; }
        .word-render p { margin-bottom: 1em; }
        .word-render table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
        .word-render td, .word-render th { border: 1px solid #ccc; padding: 8px; }
        .word-render img { max-width: 100%; height: auto; }
        .word-render h1, .word-render h2 { margin-top: 1.5em; margin-bottom: 0.5em; color: #111; }
      </style>
      <div class="word-render">
        ${result.value}
      </div>
    `;

    // 2. Wait for images to load (if any)
    const images = content.getElementsByTagName('img');
    const imagePromises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    });
    await Promise.all(imagePromises);
    await new Promise(r => setTimeout(r, 500)); // Final layout settling

    // 3. Capture and Generate PDF
    // @ts-ignore
    if (typeof window.html2pdf === 'undefined') {
      throw new Error("PDF Library not loaded. Please ensure you are connected to the internet.");
    }

    const opt = {
      margin: 0,
      filename: file.name.replace(/\.[^/.]+$/, "") + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // @ts-ignore
    const pdfBlob = await window.html2pdf().set(opt).from(content).output('blob');
    
    // Safety Check: If the blob is extremely small, something went wrong
    if (pdfBlob.size < 1000) {
      throw new Error("Conversion generated a blank file. The document might be protected or incompatible.");
    }

    return pdfBlob;

  } catch (err: any) {
    console.error("Word to PDF Error:", err);
    throw err;
  } finally {
    // Cleanup
    if (document.body.contains(ghost)) {
      document.body.removeChild(ghost);
    }
  }
};

// ============================================================================
// OTHER UTILS (RESTORED)
// ============================================================================

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

export const removeWatermarks = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    page.node.delete(PDFName.of('Annots'));
  }
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
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
