
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

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

export const convertWordToPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const convertToHtml = (mammoth as any).convertToHtml || mammoth.convertToHtml;
  const result = await convertToHtml({ arrayBuffer });
  const html = result.value;

  const element = document.createElement('div');
  element.innerHTML = `<div style="padding:20px; font-family:sans-serif;">${html}</div>`;
  
  // @ts-ignore
  if (typeof window.html2pdf !== 'function') throw new Error("html2pdf library missing");

  // @ts-ignore
  return await window.html2pdf().set({
    margin: 10,
    filename: file.name.replace(/\.docx?$/i, '.pdf'),
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(element).output('blob');
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
