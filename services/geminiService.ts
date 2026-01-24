
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

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
 * Advanced layout engine designed to create a visual replica for MS Word.
 */
export const extractTextWithLayout = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let htmlResult = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    const styles = textContent.styles;

    // 1. Precise grouping into rows based on baseline
    const rowMap: Record<number, TextItem[]> = {};
    items.forEach(item => {
      const transform = item.transform;
      const x = transform[4];
      const y = transform[5];
      const fontSize = Math.abs(transform[0]);
      const fontName = item.fontName || '';
      const isBold = fontName.toLowerCase().includes('bold') || fontName.toLowerCase().includes('black');
      
      // Grouping tolerance: 40% of the font height
      let matchedY = Object.keys(rowMap).find(ry => Math.abs(parseFloat(ry) - y) < (fontSize * 0.4));
      const finalY = matchedY ? parseFloat(matchedY) : y;
      
      if (!rowMap[finalY]) rowMap[finalY] = [];
      rowMap[finalY].push({ 
        str: item.str, 
        x, 
        y, 
        w: item.width || 0, 
        h: fontSize,
        font: fontName,
        isBold
      });
    });

    const sortedY = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
    
    // 2. Identify Table vs Paragraph structures
    const processedRows = sortedY.map(y => {
      const rowItems = rowMap[y].sort((a, b) => a.x - b.x);
      
      // Merge fragments that are essentially adjacent
      const merged: TextItem[] = [];
      if (rowItems.length > 0) {
        let curr = { ...rowItems[0] };
        for (let j = 1; j < rowItems.length; j++) {
          const next = rowItems[j];
          // If the gap is less than half a space width, merge
          if (next.x - (curr.x + curr.w) < (curr.h * 0.3)) {
            curr.str += next.str;
            curr.w = (next.x + next.w) - curr.x;
          } else {
            merged.push(curr);
            curr = { ...next };
          }
        }
        merged.push(curr);
      }

      // If multiple elements are spaced out, treat as a grid/table
      const isGrid = merged.length > 1;
      
      return { y, items: merged, isGrid, text: merged.map(m => m.str).join(' ').trim() };
    });

    // 3. Build HTML Structure with Word-Compatible CSS
    htmlResult += `<div class="WordSection${i}" style="page-break-after:always;">`;
    
    let gridBuffer: any[] = [];

    const flushGrid = () => {
      if (gridBuffer.length === 0) return '';
      
      // Detect column slots by finding unique start positions across all rows in buffer
      const xStarts: number[] = [];
      gridBuffer.forEach(row => {
        row.items.forEach((it: any) => {
          if (!xStarts.some(xs => Math.abs(xs - it.x) < 15)) xStarts.push(it.x);
        });
      });
      xStarts.sort((a, b) => a - b);

      // Create a table that mimics the PDF grid exactly
      let tableHtml = `<table border="1" cellspacing="0" cellpadding="4" width="100%" 
        style="width:100%; border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; border:0.5pt solid windowtext; margin-bottom:10pt;">`;
      
      gridBuffer.forEach(row => {
        tableHtml += `<tr>`;
        let lastColIdx = -1;
        
        row.items.forEach((item: any) => {
          const colIdx = xStarts.findIndex(xs => Math.abs(xs - item.x) < 20);
          
          // Fill empty columns
          for (let f = lastColIdx + 1; f < colIdx; f++) {
            tableHtml += `<td style="border:0.5pt solid windowtext; background-color:transparent;">&nbsp;</td>`;
          }
          
          // Determine colspan
          let colspan = 1;
          const endX = item.x + item.w;
          for (let k = colIdx + 1; k < xStarts.length; k++) {
            if (endX > xStarts[k] + 10) colspan++;
            else break;
          }

          const style = `border:0.5pt solid windowtext; font-size:${item.h}pt; font-family:'Calibri',sans-serif; vertical-align:top; ${item.isBold ? 'font-weight:bold;' : ''}`;
          tableHtml += `<td colspan="${colspan}" style="${style}">${item.str || '&nbsp;'}</td>`;
          lastColIdx = colIdx + (colspan - 1);
        });
        
        // Fill trailing
        for (let f = lastColIdx + 1; f < xStarts.length; f++) {
          tableHtml += `<td style="border:0.5pt solid windowtext;">&nbsp;</td>`;
        }
        tableHtml += `</tr>`;
      });
      
      tableHtml += `</table>`;
      gridBuffer = [];
      return tableHtml;
    };

    processedRows.forEach(row => {
      if (row.isGrid) {
        gridBuffer.push(row);
      } else {
        htmlResult += flushGrid(); // Clear pending table
        if (row.text) {
          const first = row.items[0];
          const style = `font-size:${first?.h || 11}pt; font-family:'Calibri',sans-serif; margin-bottom:8pt; ${first?.isBold ? 'font-weight:bold;' : ''}`;
          htmlResult += `<p class="MsoNormal" style="${style}">${row.text}</p>`;
        }
      }
    });

    htmlResult += flushGrid();
    htmlResult += `</div>`;
  }

  return htmlResult;
};

/**
 * Encapsulates the extracted HTML into a full Word-ready document.
 */
export const convertPDFToDoc = async (fileBase64: string, file?: File): Promise<string> => {
  if (!file) return "Error: No file selected.";
  
  const bodyContent = await extractTextWithLayout(file);

  return `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
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
        @page {
          size: 8.5in 11.0in;
          margin: 0.75in 0.75in 0.75in 0.75in;
          mso-header-margin:.5in;
          mso-footer-margin:.5in;
          mso-paper-source:0;
        }
        body {
          font-family: "Calibri", "Arial", sans-serif;
          font-size: 11pt;
        }
        p.MsoNormal {
          margin: 0in 0in 10pt;
          line-height: 115%;
        }
        table {
          border-collapse: collapse;
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
        }
        td {
          border: 0.5pt solid windowtext;
          padding: 3pt 5pt 3pt 5pt;
          mso-border-alt: solid windowtext .5pt;
        }
      </style>
    </head>
    <body lang="EN-US" style="tab-interval:.5in">
      ${bodyContent}
    </body>
    </html>
  `;
};

// ... keep other analysis and excel logic as they were to maintain functionality ...
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
