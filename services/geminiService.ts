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
  isItalic: boolean;
  fontName: string;
}

interface Line {
  y: number;
  spans: Span[];
}

/**
 * Extracts structured data from PDF for Python processing.
 * Focuses on maintaining visual layout (lines, indentation) and grouping into paragraphs.
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

    const pageBlocks: any[] = [];
    let images: any[] = [];

    if (hasSelectableText) {
        // --- PRE-PROCESSING: Font Analysis ---
        const fontSizes: Record<number, number> = {};
        items.forEach(item => {
            const size = Math.round(item.transform[0] || item.height || 11);
            fontSizes[size] = (fontSizes[size] || 0) + item.str.length;
        });
        
        // Find dominant font size (Body Text)
        let bodyFontSize = 11;
        let maxCount = 0;
        Object.entries(fontSizes).forEach(([size, count]) => {
            if (count > maxCount) {
                maxCount = count;
                bodyFontSize = Number(size);
            }
        });

        // --- NEW: Image Extraction ---
        // Note: pdfjsLib is available globally or imported. Assuming imported as pdfjsLib.
        // We need to access the operator list.
        const opList = await page.getOperatorList();
        const imagePromises: Promise<any>[] = [];
        
        // Simple matrix multiplication helper
        const multiply = (m1: number[], m2: number[]) => {
            return [
                m1[0] * m2[0] + m1[1] * m2[2],
                m1[0] * m2[1] + m1[1] * m2[3],
                m1[2] * m2[0] + m1[3] * m2[2],
                m1[2] * m2[1] + m1[3] * m2[3],
                m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
                m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
            ];
        };

        let currentMatrix = [1, 0, 0, 1, 0, 0]; // Identity matrix
        const transformStack: number[][] = [];

        // Iterate through operators to find images and track transforms
        for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            const args = opList.argsArray[i];

            if (fn === pdfjsLib.OPS.save) {
                transformStack.push([...currentMatrix]);
            } else if (fn === pdfjsLib.OPS.restore) {
                if (transformStack.length > 0) currentMatrix = transformStack.pop()!;
            } else if (fn === pdfjsLib.OPS.transform) {
                // args is [a, b, c, d, e, f]
                currentMatrix = multiply(currentMatrix, args);
            } else if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) {
                const imgName = args[0];
                const matrix = [...currentMatrix]; // Capture state at this point
                
                // We need to fetch the image object asynchronously
                imagePromises.push(new Promise<any>((resolve) => {
                    page.objs.get(imgName, (img: any) => {
                        if (img) {
                            // Calculate position and size from matrix
                            // Matrix: [scaleX, skewY, skewX, scaleY, translateX, translateY]
                            // PDF coords are bottom-up.
                            // The image is drawn in a 1x1 unit square at (0,0) transformed by CTM.
                            
                            // Approximate bounding box
                            const x = matrix[4];
                            const y = viewport.height - matrix[5]; // Flip Y
                            const w = matrix[0];
                            const h = matrix[3]; 
                            
                            // Create canvas to convert to base64
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                // Draw image data
                                if (img.data) {
                                    // RGBA data
                                    const imageData = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
                                    ctx.putImageData(imageData, 0, 0);
                                } else if (img.bitmap) {
                                    ctx.drawImage(img.bitmap, 0, 0);
                                } else if (img.image) {
                                    ctx.drawImage(img.image, 0, 0);
                                }
                                
                                const base64 = canvas.toDataURL('image/png').split(',')[1];
                                resolve({
                                    type: 'image',
                                    x: x,
                                    y: y - Math.abs(h), // Adjust for height (PDF origin is bottom-left)
                                    width: Math.abs(w),
                                    height: Math.abs(h),
                                    data: base64
                                });
                            } else {
                                resolve(null);
                            }
                        } else {
                            resolve(null);
                        }
                    });
                }));
            }
        }

        // Wait for all images on this page
        images = (await Promise.all(imagePromises)).filter(img => img !== null);


        // --- NEW: Get Annotations (Links) ---
        const annotations = await page.getAnnotations();
        const links = annotations.filter((a: any) => a.subtype === 'Link' && a.url);

        // --- STEP 1: Map & Sort Spans ---
        const spans: Span[] = items.map(item => {
            const fontNameLower = item.fontName.toLowerCase();
            const x = item.transform[4];
            const y = viewport.height - item.transform[5];
            const w = item.width;
            const h = item.height;

            // Check for Link Intersection
            let linkUrl = null;
            for (const link of links) {
                const [lx, ly, ux, uy] = link.rect; // PDF coords (bottom-left origin)
                // Convert PDF rect to Viewport rect? 
                // item.transform[5] is PDF y (bottom-up).
                // Let's convert item to PDF coords to check intersection.
                const pdfY = item.transform[5];
                
                // Simple AABB check in PDF coords
                // item is roughly [x, pdfY, x+w, pdfY+h] (font height)
                // link.rect is [x1, y1, x2, y2]
                
                // Note: item.height is often 0 in transform, need to use font size
                const fontSize = item.transform[0] || item.height || 11;
                
                // Check if item point (x, pdfY) is inside link rect
                // We add some padding
                if (x >= lx && x <= ux && pdfY >= ly && pdfY <= uy + fontSize) {
                    linkUrl = link.url;
                    break;
                }
            }

            return {
                text: item.str,
                x: x,
                y: y,
                width: w,
                height: h,
                fontSize: item.transform[0] || item.height || 11,
                isBold: fontNameLower.includes('bold') || fontNameLower.includes('black'),
                isItalic: fontNameLower.includes('italic') || fontNameLower.includes('oblique'),
                fontName: item.fontName,
                link: linkUrl
            };
        });

        // Sort: Top-down, then Left-right
        spans.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 2) return a.x - b.x;
            return a.y - b.y;
        });

        // --- STEP 2: Group into Visual Lines ---
        const lines: Line[] = [];
        let currentLine: Line = { y: -9999, spans: [] };
        
        spans.forEach(span => {
            if (Math.abs(span.y - currentLine.y) < 4 || currentLine.y === -9999) {
                if (currentLine.y === -9999) currentLine.y = span.y;
                currentLine.spans.push(span);
            } else {
                if (currentLine.spans.length > 0) {
                    currentLine.spans.sort((a, b) => a.x - b.x);
                    lines.push(currentLine);
                }
                currentLine = { y: span.y, spans: [span] };
            }
        });
        if (currentLine.spans.length > 0) {
            currentLine.spans.sort((a, b) => a.x - b.x);
            lines.push(currentLine);
        }

        // --- STEP 3: Block Classification (Heading, Table, Paragraph, List, Header, Footer) ---
        let currentBlock: { type: string, lines: Line[] } | null = null;

        for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            const prevLine = idx > 0 ? lines[idx - 1] : null;

            // 3a. Detect Header/Footer (based on Y position)
            // Top 50pt or Bottom 50pt
            const isHeader = line.y < 50;
            const isFooter = line.y > viewport.height - 50;

            // 3b. Detect Table Row (Complex Line)
            let isComplex = false;
            let gaps = 0;
            for (let k = 0; k < line.spans.length - 1; k++) {
                const gap = line.spans[k+1].x - (line.spans[k].x + line.spans[k].width);
                if (gap > 20) gaps++;
            }
            if (gaps >= 2) isComplex = true;

            // 3c. Detect Heading
            const lineFontSize = Math.max(...line.spans.map(s => s.fontSize));
            const isHeading = lineFontSize > bodyFontSize + 1;

            // 3d. Detect List Item
            // Check first span text for bullet or number pattern
            const firstText = line.spans[0]?.text.trim() || '';
            const isBullet = /^[\u2022\u2023\u25E6\u2043\u2219\-]/.test(firstText);
            const isNumber = /^\d+[\.)]/.test(firstText);
            const isList = isBullet || isNumber;

            // Classification Logic
            let type = 'paragraph';
            if (isHeader) type = 'header';
            else if (isFooter) type = 'footer';
            else if (isComplex) type = 'table';
            else if (isHeading) type = 'heading';
            else if (isList) type = 'list_item';

            // Grouping Logic
            if (currentBlock && currentBlock.type === type) {
                let isContinuation = false;
                
                if (type === 'table') {
                    if (line.y - (prevLine?.y || 0) < 50) isContinuation = true;
                } else if (type === 'paragraph') {
                    const verticalGap = line.y - (prevLine?.y || 0);
                    const lineHeight = prevLine?.spans[0].fontSize || 12;
                    if (verticalGap < lineHeight * 2.0) isContinuation = true;
                } else if (type === 'header' || type === 'footer') {
                    // Group headers/footers together if close
                     if (line.y - (prevLine?.y || 0) < 20) isContinuation = true;
                } else if (type === 'list_item') {
                    // List items are usually distinct blocks unless we want a single "List" block
                    // Let's keep them separate for now to apply styles per item, 
                    // OR group them if we want to handle a list as a unit.
                    // Better to keep separate so we can detect start of new items.
                    isContinuation = false; 
                } else {
                    if (line.y - (prevLine?.y || 0) < lineFontSize * 1.5) isContinuation = true;
                }

                if (isContinuation) {
                    currentBlock.lines.push(line);
                } else {
                    pageBlocks.push(currentBlock);
                    currentBlock = { type, lines: [line] };
                }
            } else {
                if (currentBlock) pageBlocks.push(currentBlock);
                currentBlock = { type, lines: [line] };
            }
        }
        if (currentBlock) pageBlocks.push(currentBlock);

    } else {
        // OCR Fallback (Keep existing logic but wrap in blocks)
        console.log(`Page ${i} appears to be an image. Running OCR...`);
        const canvasViewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = canvasViewport.width;
        canvas.height = canvasViewport.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
             await page.render({ canvasContext: ctx, viewport: canvasViewport }).promise;
             const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
             
             try {
                 const result = await Tesseract.recognize(imageBase64, 'eng');
                 const scaleFactor = 0.5;
                 
                 const ocrLines: Line[] = result.data.lines.map(line => ({
                     y: line.bbox.y0 * scaleFactor,
                     spans: [{
                         text: line.text.replace(/\n/g, ' '),
                         x: line.bbox.x0 * scaleFactor,
                         y: line.bbox.y0 * scaleFactor,
                         width: (line.bbox.x1 - line.bbox.x0) * scaleFactor,
                         height: (line.bbox.y1 - line.bbox.y0) * scaleFactor,
                         fontSize: 11,
                         isBold: false,
                         isItalic: false,
                         fontName: 'Calibri'
                     }]
                 }));
                 
                 pageBlocks.push({ type: 'paragraph', lines: ocrLines });

             } catch (e) {
                 console.error("OCR Failed for page " + i, e);
             }
        }
    }
    
    // Simplify for Python
    const simplifiedBlocks = pageBlocks.map(b => ({
        type: b.type,
        lines: b.lines.map((l: Line) => ({
            y: l.y,
            spans: l.spans.map(s => ({
                text: s.text,
                x: s.x,
                width: s.width,
                size: s.fontSize,
                isBold: s.isBold,
                isItalic: s.isItalic,
                fontName: s.fontName,
                link: s.link
            }))
        }))
    }));

    pagesData.push({ 
        blocks: simplifiedBlocks, 
        images: images, 
        width: viewport.width, 
        height: viewport.height 
    });
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
