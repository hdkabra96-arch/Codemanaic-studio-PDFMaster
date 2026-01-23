
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Set worker for pdf.js using a reliable CDN that matches the package version
const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

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
    // Improved extraction: checks for large vertical gaps to insert newlines
    let lastY = -1;
    const pageText = textContent.items.map((item: any) => {
      let str = item.str;
      // Simple heuristic: if Y position changes significantly, add newline
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 10) {
        str = '\n' + str;
      }
      lastY = item.transform[5];
      return str;
    }).join(' ');
    fullText += pageText + '\n\n';
  }

  return fullText;
};

/**
 * Local implementation of PDF Analysis (Smart Search & Summarization)
 */
export const generatePDFAnalysis = async (fileBase64: string, prompt: string, file?: File) => {
  let text = '';
  if (file) {
    text = await extractTextFromPDF(file);
  } else {
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
    const lines = text.split('\n').filter(l => l.trim().length > 15);
    const summary = lines.slice(0, 8).join(' ') + '...';
    return `### Local Document Insights\n\nDetected approximately ${text.split(/\s+/).length} words.\n\n**Brief Summary:** ${summary}\n\n*Processed securely in-browser.*`;
  }

  const sentences = text.split(/[.!?]+/);
  const relevantSentences = sentences.filter(s => s.toLowerCase().includes(query)).slice(0, 5);

  if (relevantSentences.length > 0) {
    return `### Found matches for "${prompt}":\n\n${relevantSentences.map(s => `- ...${s.trim()}...`).join('\n\n')}`;
  }

  return `I scanned the document locally but couldn't find a direct match for "${prompt}". Try searching for keywords or ask for a "summary".`;
};

export const convertPDFToDoc = async (fileBase64: string, file?: File): Promise<string> => {
  let text = file ? await extractTextFromPDF(file) : "Local conversion failed: File missing.";
  return `<html><body style="font-family: sans-serif; white-space: pre-wrap;">${text}</body></html>`;
};

export const convertPDFToExcel = async (fileBase64: string, file?: File): Promise<any> => {
  let text = file ? await extractTextFromPDF(file) : "";
  const lines = text.split('\n');
  const tableRows = lines
    .map(line => line.split(/\s{2,}/).filter(c => c.trim().length > 0))
    .filter(row => row.length > 1);

  return {
    tables: [{ name: "Extracted Data", rows: tableRows }]
  };
};

export const convertJPGToWordOCR = async (fileBase64: string, mimeType: string): Promise<string> => {
  try {
    const result = await Tesseract.recognize(
      `data:${mimeType};base64,${fileBase64}`,
      'eng'
    );

    // Reconstruct paragraphs
    // Tesseract's paragraphs often contain line breaks within sentences. 
    // We join them with spaces, but preserve actual paragraphs.
    const paragraphs = (result.data.paragraphs || []).map(p => {
      const cleanText = p.text.replace(/[\r\n]+/g, ' ').trim();
      if (!cleanText) return '';
      return `<p class="MsoNormal">${cleanText}</p>`;
    }).join('\n');

    // Fallback if paragraphs are empty but text exists
    const content = paragraphs || `<p class="MsoNormal">${result.data.text.replace(/[\r\n]+/g, ' ')}</p>`;

    // MS Word-specific HTML structure
    return `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>OCR Result</title>
        <!--[if gte mso 9]>
        <xml>
        <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          /* Basic Word styles */
          p.MsoNormal, li.MsoNormal, div.MsoNormal {
            margin: 0in 0in 8pt;
            font-size: 11pt;
            font-family: "Calibri", sans-serif;
            line-height: 115%;
          }
          @page Section1 {
            size: 8.5in 11in;
            margin: 1in;
            mso-header-margin: 0.5in;
            mso-footer-margin: 0.5in;
            mso-paper-source: 0;
          }
          div.Section1 {
            page: Section1;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          ${content}
        </div>
      </body>
      </html>
    `;
  } catch (error) {
    throw new Error("Local OCR failed. Please ensure the image is high contrast.");
  }
};

export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
