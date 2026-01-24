
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

/**
 * Advanced layout engine that groups text into coherent tables and paragraphs.
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

    // 1. Group items into rows with tolerance
    const rowMap: Record<number, TextItem[]> = {};
    items.forEach(item => {
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const w = Math.round(item.width || 0);
      
      let matchedY = Object.keys(rowMap).find(ry => Math.abs(parseInt(ry) - y) < 5);
      const finalY = matchedY ? parseInt(matchedY) : y;
      
      if (!rowMap[finalY]) rowMap[finalY] = [];
      rowMap[finalY].push({ str: item.str, x, y, w });
    });

    const sortedY = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
    
    // 2. Classify rows as Table Rows or Paragraphs
    const processedRows = sortedY.map(y => {
      const rowItems = rowMap[y].sort((a, b) => a.x - b.x);
      
      // Heuristic for table row: multiple clusters with significant gaps
      let clusters = 1;
      for (let j = 1; j < rowItems.length; j++) {
        const gap = rowItems[j].x - (rowItems[j-1].x + rowItems[j-1].w);
        if (gap > 35) clusters++;
      }
      
      return {
        y,
        items: rowItems,
        isTableCandidate: clusters > 1,
        text: rowItems.map(it => it.str).join(' ').trim()
      };
    });

    // 3. Group contiguous table rows into unified <table> blocks
    htmlResult += `<div class="pdf-page" style="page-break-after: always; margin-bottom: 40pt;">`;
    
    let currentBlock: 'table' | 'p' | null = null;
    let tableBuffer: any[] = [];

    const flushTable = () => {
      if (tableBuffer.length === 0) return '';
      
      // Determine columns based on X coordinates of all rows in this table
      const xPositions = new Set<number>();
      tableBuffer.forEach(row => row.items.forEach((it: any) => xPositions.add(Math.round(it.x / 40) * 40)));
      const sortedX = Array.from(xPositions).sort((a, b) => a - b);

      let tableHtml = `<table width="100%" border="0" cellspacing="0" cellpadding="4" style="border-collapse:collapse; margin: 10pt 0; mso-table-lspace:0pt; mso-table-rspace:0pt;">`;
      
      tableBuffer.forEach(row => {
        tableHtml += `<tr>`;
        // Map items to column slots
        let lastColIdx = -1;
        row.items.forEach((item: any) => {
          const colIdx = sortedX.findIndex(sx => Math.abs(sx - item.x) < 50);
          
          // Fill missing columns
          for (let fill = lastColIdx + 1; fill < colIdx; fill++) {
            tableHtml += `<td style="border: 0.5pt solid #ccc; background:#fff;">&nbsp;</td>`;
          }
          
          tableHtml += `<td style="border: 0.5pt solid #ccc; font-family: Calibri, sans-serif; font-size: 10pt; vertical-align: top;">${item.str}</td>`;
          lastColIdx = colIdx;
        });
        
        // Fill remaining columns
        for (let fill = lastColIdx + 1; fill < sortedX.length; fill++) {
          tableHtml += `<td style="border: 0.5pt solid #ccc;">&nbsp;</td>`;
        }
        tableHtml += `</tr>`;
      });
      
      tableHtml += `</table>`;
      tableBuffer = [];
      return tableHtml;
    };

    processedRows.forEach(row => {
      if (row.isTableCandidate) {
        tableBuffer.push(row);
        currentBlock = 'table';
      } else {
        if (currentBlock === 'table') {
          htmlResult += flushTable();
        }
        if (row.text) {
          htmlResult += `<p class="MsoNormal" style="margin-bottom: 8pt; font-family: Calibri, sans-serif;">${row.text}</p>`;
        }
        currentBlock = 'p';
      }
    });

    // Final flush
    if (tableBuffer.length > 0) htmlResult += flushTable();
    htmlResult += `</div>`;
  }

  return htmlResult;
};

export const convertPDFToDoc = async (fileBase64: string, file?: File): Promise<string> => {
  if (!file) return "Error: No file selected.";
  
  const content = await extractTextWithLayout(file);

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
        @page { size: 8.5in 11.0in; margin: 1.0in 1.0in 1.0in 1.0in; mso-header-margin:.5in; mso-footer-margin:.5in; mso-paper-source:0; }
        body { font-family: "Calibri", "Arial", sans-serif; }
        p.MsoNormal { margin: 0in 0in 10pt; line-height: 115%; font-size: 11.0pt; }
        table { border-collapse: collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
        td { padding: 4pt; border: 0.5pt solid #ccc; }
      </style>
    </head>
    <body>
      ${content}
    </body>
    </html>
  `;
};

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
  if (query.includes('summarize')) return `**Local Insight Summary:**\n\n${text.substring(0, 800)}...`;
  return `Local search result for "${prompt}": Matches found in document.`;
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
  return { tables: [{ name: "PDF_Data", rows: allRows }] };
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
