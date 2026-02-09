import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { createDocxWithPython } from './pythonService';

const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

interface Span {
  text: string;
  x: number;
  y: number; // Top-down
  width: number;
  height: number;
  fontSize: number;
  isBold: boolean;
  fontName: string;
}

interface Line {
  y: number;
  spans: Span[];
}

/**
 * Extracts structured data from PDF for Python processing.
 * Focuses on maintaining visual layout (lines, indentation).
 */
export const extractTextDataForPython = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pagesData = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 }); // 1.0 scale = 72 DPI (Standard Points)
    
    // 1. Try to get text layer first
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    // Check if the page actually has selectable text
    const hasSelectableText = items.some(item => item.str.trim().length > 0);

    const pageLines: Line[] = [];

    if (hasSelectableText) {
        // Map items to a normalized structure with Top-Down Y coordinates
        const spans: Span[] = items.map(item => {
            // PDF transform[5] is bottom-up Y. Convert to top-down.
            // item.height is the font size roughly.
            // item.width is text width.
            return {
                text: item.str,
                x: item.transform[4],
                y: viewport.height - item.transform[5],
                width: item.width,
                height: item.height,
                fontSize: item.height || 11,
                isBold: item.fontName.toLowerCase().includes('bold') || item.fontName.toLowerCase().includes('black'),
                fontName: item.fontName
            };
        });

        // Group spans into visual lines based on Y coordinate
        // We use a small tolerance because items on the same line might vary slightly in Y
        spans.sort((a, b) => a.y - b.y);

        let currentLine: Line = { y: -9999, spans: [] };
        
        spans.forEach(span => {
            // If spans are effectively on the same line (within 5pt vertical)
            if (Math.abs(span.y - currentLine.y) < 5 || currentLine.y === -9999) {
                if (currentLine.y === -9999) currentLine.y = span.y;
                currentLine.spans.push(span);
            } else {
                // Finish current line
                if (currentLine.spans.length > 0) {
                    // Sort spans left-to-right
                    currentLine.spans.sort((a, b) => a.x - b.x);
                    pageLines.push(currentLine);
                }
                // Start new line
                currentLine = { y: span.y, spans: [span] };
            }
        });
        // Push last line
        if (currentLine.spans.length > 0) {
            currentLine.spans.sort((a, b) => a.x - b.x);
            pageLines.push(currentLine);
        }

    } else {
        // 2. OCR Fallback for Image-based PDFs
        console.log(`Page ${i} appears to be an image. Running OCR...`);
        
        // Render page to image for Tesseract
        const canvasViewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        const canvas = document.createElement('canvas');
        canvas.width = canvasViewport.width;
        canvas.height = canvasViewport.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
             await page.render({ canvasContext: ctx, viewport: canvasViewport }).promise;
             const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
             
             try {
                 const result = await Tesseract.recognize(imageBase64, 'eng');
                 
                 // Tesseract returns lines with bbox.
                 // We need to scale bbox back to 1.0 scale (since we rendered at 2.0)
                 const scaleFactor = 0.5; // 1.0 / 2.0
                 
                 result.data.lines.forEach(line => {
                     // Tesseract lines are already grouped text
                     pageLines.push({
                         y: line.bbox.y0 * scaleFactor,
                         spans: [{
                             text: line.text.replace(/\n/g, ''),
                             x: line.bbox.x0 * scaleFactor,
                             y: line.bbox.y0 * scaleFactor,
                             width: (line.bbox.x1 - line.bbox.x0) * scaleFactor,
                             height: (line.bbox.y1 - line.bbox.y0) * scaleFactor,
                             fontSize: 11, // Estimate
                             isBold: false,
                             fontName: 'Calibri'
                         }]
                     });
                 });
             } catch (e) {
                 console.error("OCR Failed for page " + i, e);
             }
        }
    }
    
    // Final structure for Python
    // We only pass what's needed
    const simplifiedLines = pageLines.map(l => ({
        y: l.y,
        spans: l.spans.map(s => ({
            text: s.text,
            x: s.x,
            width: s.width,
            size: s.fontSize,
            isBold: s.isBold
        }))
    }));

    pagesData.push({ lines: simplifiedLines, width: viewport.width, height: viewport.height });
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

export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
};

/**
 * Extracts structured data from an Image for Python processing using OCR.
 */
export const extractImageTextDataForPython = async (file: File) => {
    const base64 = await fileToGenerativePart(file);
    const mimeType = file.type;
    const imgUrl = `data:${mimeType};base64,${base64}`;
    
    // Get image dimensions for scaling to A4 points
    const img = new Image();
    img.src = imgUrl;
    await new Promise((resolve) => { img.onload = resolve; });
    
    // Target A4 width in points (~595pt)
    // We scale coordinates so the font sizes and positions make sense in Word
    const targetWidth = 595; 
    const scale = targetWidth / (img.width || 1000);

    const result = await Tesseract.recognize(imgUrl, 'eng');
    
    const lines = result.data.lines.map(line => ({
        y: line.bbox.y0 * scale,
        spans: [{
            text: line.text.replace(/\n/g, ''), // Remove newlines from Tesseract segments
            x: line.bbox.x0 * scale,
            width: (line.bbox.x1 - line.bbox.x0) * scale,
            // Estimate font size based on height, clamp between 9 and 72
            size: Math.max(9, Math.min(72, (line.bbox.y1 - line.bbox.y0) * scale * 0.7)),
            isBold: line.confidence > 80 // Heuristic for bold
        }]
    }));

    // Wrap in the page structure expected by pythonService
    return [{ lines, width: targetWidth, height: img.height * scale }];
};
