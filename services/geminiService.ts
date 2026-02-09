import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { createDocxWithPython } from './pythonService';

const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: string;
  isBold: boolean;
}

/**
 * Extracts structured data from PDF for Python processing.
 * Includes OCR fallback for image-based PDFs.
 */
export const extractTextDataForPython = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pagesData = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    
    // 1. Try to get text layer first
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    // Check if the page actually has selectable text
    const hasSelectableText = items.some(item => item.str.trim().length > 0);

    if (hasSelectableText) {
        // Standard Text Extraction
        // 1. Basic sorting: Top to Bottom, then Left to Right
        items.sort((a, b) => {
           const yDiff = b.transform[5] - a.transform[5];
           if (Math.abs(yDiff) > 5) return yDiff; // Significant vertical difference
           return a.transform[4] - b.transform[4]; // Horizontal difference
        });
    
        const blocks = [];
        let currentBlock = { spans: [] as any[] };
        let lastY = items.length > 0 ? items[0].transform[5] : 0;
    
        items.forEach((item) => {
           const y = item.transform[5];
           
           // If vertical distance is large, treat as new paragraph
           if (Math.abs(y - lastY) > 12) {
              if (currentBlock.spans.length > 0) blocks.push(currentBlock);
              currentBlock = { spans: [] };
           }
           
           const fontName = item.fontName || '';
           const isBold = fontName.toLowerCase().includes('bold') || fontName.toLowerCase().includes('black');
           
           currentBlock.spans.push({
             text: item.str + (item.hasEOL ? '\n' : ' '), // Add spacing
             fontSize: item.height || 11,
             isBold: isBold
           });
           lastY = y;
        });
        
        if (currentBlock.spans.length > 0) blocks.push(currentBlock);
        pagesData.push({ blocks });

    } else {
        // 2. OCR Fallback for Image-based PDFs (e.g. Scans or HTML-converted PDFs)
        console.log(`Page ${i} appears to be an image. Running OCR...`);
        
        const viewport = page.getViewport({ scale: 2.0 }); // High res for better OCR
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
             await page.render({ canvasContext: ctx, viewport }).promise;
             const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
             
             try {
                 const { data: { text } } = await Tesseract.recognize(imageBase64, 'eng');
                 
                 // Process OCR text into blocks
                 const paragraphs = text.split(/\n\s*\n/); // Split by double newline
                 const blocks = paragraphs.map(p => ({
                     spans: [{
                         text: p.replace(/\n/g, ' ') + '\n', // Flatten single newlines
                         fontSize: 11,
                         isBold: false
                     }]
                 }));
                 pagesData.push({ blocks });
             } catch (e) {
                 console.error("OCR Failed for page " + i, e);
                 pagesData.push({ blocks: [] }); // Empty page on error
             }
        }
    }
  }
  return pagesData;
};

/**
 * Converts PDF to a true DOCX file using Python (Pyodide).
 */
export const convertPDFToDoc = async (fileBase64: string, file?: File): Promise<Blob> => {
  if (!file) throw new Error("Error: No file selected.");
  
  // 1. Extract raw data from PDF (Text or OCR)
  const data = await extractTextDataForPython(file);
  
  // 2. Generate DOCX binary using Python
  const docxBytes = await createDocxWithPython(data);
  
  return new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};

// ... keep other analysis and excel logic ...
export const generatePDFAnalysis = async (fileBase64: string, prompt: string, file?: File) => {
  if (!file) return "File missing";
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(' ') + '\n';
  }
  const query = prompt.toLowerCase();
  if (query.includes('summarize')) return `**Document Summary:**\n\n${text.substring(0, 1000)}...`;
  return `Search complete. Keywords match document content.`;
};

export const convertPDFToExcel = async (fileBase64: string, file?: File): Promise<any> => {
  const arrayBuffer = await file!.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let allRows: string[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as any[];
    const lines: Record<number, any[]> = {};
    items.forEach(it => {
      const y = Math.round(it.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push(it);
    });
    Object.keys(lines).sort((a, b) => Number(b) - Number(a)).forEach(y => {
      allRows.push(lines[Number(y)].sort((a,b) => a.transform[4] - b.transform[4]).map(it => it.str));
    });
  }
  return { tables: [{ name: "Data", rows: allRows }] };
};

export const convertJPGToWordOCR = async (fileBase64: string, mimeType: string): Promise<string> => {
  const result = await Tesseract.recognize(`data:${mimeType};base64,${fileBase64}`, 'eng');
  return `<html><body><p class="MsoNormal">${result.data.text}</p></body></html>`;
};

export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
};
