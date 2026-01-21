import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Fix for ESM import of pdfjs-dist: handle both default export and named exports
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Set worker for pdf.js
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

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
    
    // Pad page number with zeros
    const pageNum = (i + 1).toString().padStart(3, '0');
    folder?.file(`page_${pageNum}.pdf`, pdfBytes);
  }
  
  const content = await zip.generateAsync({ type: "blob" });
  return content;
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
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Convert DOCX to HTML
    // Handle mammoth import which might be nested in default depending on bundler
    const convertToHtml = mammoth.convertToHtml || (mammoth as any).default?.convertToHtml;
    
    if (!convertToHtml) {
        throw new Error("Mammoth library not loaded correctly");
    }

    const result = await convertToHtml({ arrayBuffer: arrayBuffer });
    const html = result.value;

    if (!html) {
      throw new Error("Could not extract content from Word document.");
    }

    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 20px; max-width: 800px; margin: 0 auto;">
        ${html}
      </div>
    `;
    
    const options = {
      margin: 10,
      filename: file.name.replace(/\.docx?$/i, '.pdf'),
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // @ts-ignore
    if (typeof window.html2pdf !== 'function') {
      throw new Error("PDF generation library not loaded.");
    }

    // @ts-ignore
    const pdfBlob = await window.html2pdf().set(options).from(element).output('blob');
    return pdfBlob;

  } catch (error) {
    console.error("Word to PDF Error:", error);
    throw error;
  }
};

// --- New Modules ---

export const imagesToPDF = async (files: File[]): Promise<Blob> => {
  const pdfDoc = await PDFDocument.create();
  
  for (const file of files) {
    const imageBytes = await file.arrayBuffer();
    let image;
    
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (file.type === 'image/png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      continue; // Skip unsupported
    }
    
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }
  
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const pdfToImages = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  // Use the resolved pdfjs instance
  const doc = await pdfjs.getDocument(arrayBuffer).promise;
  const zip = new JSZip();
  const folder = zip.folder("pdf_images");

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High quality
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      // Remove data:image/jpeg;base64, prefix
      const base64Data = imgData.split(',')[1];
      folder?.file(`page_${i.toString().padStart(3, '0')}.jpg`, base64Data, {base64: true});
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  return content;
};

export const addWatermark = async (file: File, text: string): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  pages.forEach(page => {
    const { width, height } = page.getSize();
    const fontSize = 50;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    
    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size: fontSize,
      font: font,
      color: rgb(0.7, 0.7, 0.7),
      opacity: 0.5,
      rotate: degrees(45),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const addPageNumbers = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const totalPages = pages.length;

  pages.forEach((page, idx) => {
    const { width } = page.getSize();
    const text = `Page ${idx + 1} of ${totalPages}`;
    const fontSize = 12;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    
    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: 20,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const cropPDF = async (file: File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();

  // Simple crop: remove 1 inch (72 points) from all sides
  const margin = 72;

  pages.forEach(page => {
    const { width, height } = page.getSize();
    if (width > margin * 2 && height > margin * 2) {
      page.setCropBox(margin, margin, width - margin * 2, height - margin * 2);
    }
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const repairPDF = async (file: File): Promise<Blob> => {
  // pdf-lib's load and save often fixes XREF table issues automatically
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
};
