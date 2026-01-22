
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Set worker for pdf.js - using ESM version
const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;

/**
 * Extracts raw text from a PDF for local analysis.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
};

/**
 * Local implementation of PDF Analysis (Smart Search & Summarization)
 */
export const generatePDFAnalysis = async (fileBase64: string, prompt: string, file?: File) => {
  // If file is not provided, we extract from base64 (less efficient but necessary for compatibility)
  let text = '';
  if (file) {
    text = await extractTextFromPDF(file);
  } else {
    // Basic base64 to File conversion
    const byteString = atob(fileBase64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'application/pdf' });
    const tempFile = new File([blob], "temp.pdf", { type: 'application/pdf' });
    text = await extractTextFromPDF(tempFile);
  }

  const query = prompt.toLowerCase();
  
  if (query.includes('summarize') || query.includes('summary')) {
    const lines = text.split('\n').filter(l => l.trim().length > 10);
    const summary = lines.slice(0, 10).join(' ') + '...';
    return `### Local Document Summary\n\nThis document contains approximately ${text.split(' ').length} words across multiple sections. \n\n**Overview:** ${summary}\n\n*Note: This analysis was performed locally in your browser for privacy.*`;
  }

  // Basic Keyword Matching
  const sentences = text.split(/[.!?]+/);
  const relevantSentences = sentences.filter(s => s.toLowerCase().includes(query)).slice(0, 5);

  if (relevantSentences.length > 0) {
    return `### Local Search Results\n\nFound ${relevantSentences.length} matches for "${prompt}":\n\n${relevantSentences.map(s => `- ...${s.trim()}...`).join('\n\n')}`;
  }

  return `I analyzed the document locally but couldn't find a direct match for your query. Try asking for a "summary" or using specific keywords found in the text.`;
};

/**
 * Local PDF to Doc conversion via Text Extraction
 */
export const convertPDFToDoc = async (fileBase64: string, file?: File): Promise<string> => {
  let text = '';
  if (file) {
    text = await extractTextFromPDF(file);
  } else {
    return "Error: Local conversion requires a File object.";
  }
  
  return `<html><body><pre style="white-space: pre-wrap; font-family: sans-serif;">${text}</pre></body></html>`;
};

/**
 * Local PDF to Excel detection (Basic heuristic)
 */
export const convertPDFToExcel = async (fileBase64: string, file?: File): Promise<any> => {
  let text = '';
  if (file) {
    text = await extractTextFromPDF(file);
  } else {
    return { tables: [] };
  }

  // Very basic heuristic: lines with multiple spaces or tabs often indicate tabular data
  const lines = text.split('\n');
  const tableRows = lines.map(line => line.split(/\s{2,}/).filter(c => c.trim().length > 0)).filter(row => row.length > 1);

  return {
    tables: [
      {
        name: "Extracted Data",
        rows: tableRows
      }
    ]
  };
};

/**
 * Local OCR using Tesseract.js
 */
export const convertJPGToWordOCR = async (fileBase64: string, mimeType: string): Promise<string> => {
  try {
    const result = await Tesseract.recognize(
      `data:${mimeType};base64,${fileBase64}`,
      'eng',
      { logger: m => console.log(m) }
    );
    
    const text = result.data.text;
    return `<html><body><pre style="white-space: pre-wrap; font-family: sans-serif;">${text}</pre></body></html>`;
  } catch (error) {
    console.error("Local OCR Error:", error);
    throw new Error("Failed to perform local OCR. Please ensure the image is clear.");
  }
};

// Compatibility export
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
