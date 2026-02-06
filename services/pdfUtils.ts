
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
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
    const pdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  const pdfBytes = await mergedPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const splitPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
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
  const pdf = await PDFDocument.load(arrayBuffer);
  const pages = pdf.getPages();
  pages.forEach(page => {
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + rotationAngle));
  });
  const pdfBytes = await pdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

/**
 * Advanced Binary Scraper for Legacy Word (.doc / Office 97-2003)
 * 
 * Unlike .docx (which is XML), .doc files are OLE2 Binaries.
 * Text is typically stored in contiguous streams encoded as UTF-16LE or ANSI.
 * This algorithm scans the binary dump for text-like patterns.
 */
const extractLegacyDocText = (arrayBuffer: ArrayBuffer): string => {
  const dataView = new DataView(arrayBuffer);
  const fileSize = dataView.byteLength;
  
  let paragraphs: string[] = [];
  let currentRun = "";
  
  // HEURISTIC CONFIGURATION
  // We accept characters that are typical in Western documents.
  // 13 (CR) is a paragraph break.
  const isReadable = (code: number) => {
    return (code >= 32 && code <= 126) || // ASCII Printable
           (code >= 160 && code <= 255) || // Extended Latin
           (code === 8217 || code === 8216 || code === 8220 || code === 8221 || code === 8211); // Smart quotes/dashes
  };

  // PASS 1: Scan for UTF-16LE (Standard for modern .doc files)
  // In UTF-16LE, ASCII chars are stored as [char_code, 0x00]
  for (let i = 0; i < fileSize - 1; i += 2) {
    const charCode = dataView.getUint16(i, true); // Little Endian
    
    if (isReadable(charCode)) {
      currentRun += String.fromCharCode(charCode);
    } else if (charCode === 13 || charCode === 10) {
      // Carriage return found - push paragraph if it's substantial
      if (currentRun.trim().length > 3) {
        paragraphs.push(currentRun.trim());
      }
      currentRun = "";
    } else {
      // Hit binary garbage. If run was long enough, save it.
      if (currentRun.trim().length > 8) { // Require longer runs to avoid metadata noise
        paragraphs.push(currentRun.trim());
      }
      currentRun = "";
    }
  }

  // PASS 2: Fallback for older ANSI/ASCII docs if Pass 1 failed
  if (paragraphs.length < 2) {
    paragraphs = []; // Reset
    currentRun = "";
    const uint8 = new Uint8Array(arrayBuffer);
    for (let i = 0; i < fileSize; i++) {
      const charCode = uint8[i];
      if (isReadable(charCode)) {
        currentRun += String.fromCharCode(charCode);
      } else if (charCode === 13 || charCode === 10) {
        if (currentRun.trim().length > 3) paragraphs.push(currentRun.trim());
        currentRun = "";
      } else {
        if (currentRun.trim().length > 8) paragraphs.push(currentRun.trim());
        currentRun = "";
      }
    }
  }

  // Formatting: Wrap in HTML
  if (paragraphs.length === 0) {
    return `<p style="color:red; text-align:center;"><em>Unable to detect readable text. This file might be password protected or contain only images.</em></p>`;
  }

  // Join paragraphs with proper spacing
  return paragraphs
    .filter(p => !p.match(/^[\s\W]+$/)) // Remove lines that are just symbols
    .map(p => `<p class="MsoNormal">${p}</p>`)
    .join("\n");
};

/**
 * Enhanced Word to PDF converter.
 * Supports: 
 * - .docx (Office 2007+) via Mammoth (XML Parser)
 * - .doc (Office 97-2003) via Binary Stream Scraper
 */
export const convertWordToPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  let htmlContent = '';

  // 1. Detect format by Signature
  const headerArr = new Uint8Array(arrayBuffer.slice(0, 4));
  const header = Array.from(headerArr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const isLegacyDoc = header === 'D0CF11E0' || file.name.toLowerCase().endsWith('.doc');

  if (isLegacyDoc) {
    // === LEGACY .DOC PROCESSING ===
    console.log("Processing legacy .doc file using Binary Stream Scraper...");
    htmlContent = extractLegacyDocText(arrayBuffer);
    
    // Check if extraction actually got content, else fallback message
    if (!htmlContent || htmlContent.length < 50) {
       htmlContent += `<p style="margin-top:20px; font-size:10pt; color:#666; border-top:1px solid #eee; padding-top:10px;">[End of Extracted Content from Legacy Binary File]</p>`;
    }
  } else {
    // === MODERN .DOCX PROCESSING ===
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
          "r[style-name='Strong'] => strong",
          "b => strong",
          "i => em",
          "u => u",
          "table => table.doc-table"
        ]
      });
      htmlContent = result.value;
      
      if (!htmlContent || !htmlContent.trim()) {
        // Double check: if mammoth fails silently, try the binary scraper as a fallback even for docx
        // (Unlikely, but safety net)
        throw new Error("Empty result");
      }
    } catch (err: any) {
      console.warn("Mammoth failed, trying binary extraction as fallback", err);
      htmlContent = extractLegacyDocText(arrayBuffer);
    }
  }

  // 2. Stylized HTML Container for PDF Generation
  const container = document.createElement('div');
  container.innerHTML = `
    <div style="font-family: 'Calibri', 'Arial', sans-serif; color: #000; line-height: 1.6; font-size: 11pt; padding: 0; background: white;">
      <style>
        h1 { color: #2F5496; font-size: 20pt; margin-top: 24pt; margin-bottom: 12pt; font-weight: bold; }
        h2 { color: #2F5496; font-size: 16pt; margin-top: 18pt; margin-bottom: 8pt; font-weight: bold; }
        h3 { color: #1F3763; font-size: 14pt; margin-top: 14pt; margin-bottom: 6pt; font-weight: bold; }
        .doc-main-title { font-size: 26pt; text-align: center; color: #000; margin-bottom: 30pt; line-height: 1.2; }
        .doc-subtitle { font-size: 14pt; text-align: center; color: #5A5A5A; margin-bottom: 30pt; }
        p.MsoNormal { margin-bottom: 12pt; text-align: left; }
        p { margin-bottom: 10pt; }
        
        /* Table Styling */
        table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #d1d5db; }
        td, th { border: 1px solid #d1d5db; padding: 8px 12px; vertical-align: top; }
        th { background-color: #f9fafb; font-weight: 600; }
        
        /* List Styling */
        ul, ol { margin-bottom: 10pt; padding-left: 24pt; }
        li { margin-bottom: 4pt; }
        
        img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
      </style>
      ${htmlContent}
    </div>
  `;

  // 3. Convert to PDF using html2pdf
  // @ts-ignore
  if (typeof window.html2pdf !== 'function') throw new Error("PDF Generation engine (html2pdf) not loaded.");

  const opt = {
    margin: [15, 15, 15, 15], // mm
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
  const pdfDoc = await PDFDocument.load(arrayBuffer);
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
  const pdfDoc = await PDFDocument.load(arrayBuffer);
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
  const pdfDoc = await PDFDocument.load(arrayBuffer);
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
  const pdfDoc = await PDFDocument.load(arrayBuffer);
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
