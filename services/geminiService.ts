import { GoogleGenAI } from "@google/genai";

// Helper to convert file to Base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:application/pdf;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const generatePDFAnalysis = async (fileBase64: string, prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: fileBase64
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        systemInstruction: "You are a helpful PDF assistant. Analyze the provided document accurately."
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const convertPDFToDoc = async (fileBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // We ask Gemini to convert the PDF content to semantic HTML, which Word opens gracefully as a doc.
  const prompt = `
    Convert the following PDF document into a clean, well-structured HTML document that simulates a Word document.
    - Preserve headings, paragraphs, lists, and tables.
    - Do not include <html>, <head>, or <body> tags, just the content body.
    - Use standard inline styles for bold, italics, etc.
    - Return ONLY the HTML code. No markdown code blocks.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: fileBase64
            }
          },
          {
            text: prompt
          }
        ]
      }
    });

    const htmlContent = response.text || "";
    // Wrap in a minimal word-compatible html structure
    return `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Document</title></head>
      <body>${htmlContent.replace(/```html/g, '').replace(/```/g, '')}</body>
      </html>
    `;
  } catch (error) {
    console.error("Conversion Error:", error);
    throw error;
  }
};

export const convertPDFToExcel = async (fileBase64: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Extract all tabular data from the following PDF document.
    - Return a JSON object with a key 'tables'.
    - 'tables' must be an array of objects, where each object has:
      - 'name': A string for the table name (e.g., "Table 1", "Financial Data").
      - 'rows': A 2D array of strings (array of arrays) representing the table data (including headers).
    - If there are no tables, return an empty array for 'tables'.
    - Output ONLY valid JSON. No markdown formatting, no code blocks.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: fileBase64
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const jsonText = response.text || "{}";
    // Clean up if the model adds markdown despite instructions (double safety)
    const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '');
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Conversion Error:", error);
    throw error;
  }
};

export const convertJPGToWordOCR = async (fileBase64: string, mimeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Perform high-fidelity OCR on this image. 
    1. Reconstruct the document structure exactly as seen (headings, paragraphs, lists, tables).
    2. Format the output as clean, semantic HTML that is compatible with Microsoft Word.
    3. Do not include <html>, <head>, or <body> tags in your initial response, just the inner content.
    4. Return ONLY the HTML code. No conversational text. No Markdown blocks.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64
            }
          },
          {
            text: prompt
          }
        ]
      }
    });

    const htmlContent = response.text || "";
    
    return `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>OCR Document</title></head>
      <body>${htmlContent.replace(/```html/g, '').replace(/```/g, '')}</body>
      </html>
    `;
  } catch (error) {
    console.error("OCR Conversion Error:", error);
    throw error;
  }
};

// Generic converter for formats Gemini understands but we want PDF output (via HTML)
// Useful for complex Excel/PPT conversions if we use the AI to render a print view
export const convertOfficeToHtml = async (fileBase64: string, mimeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // For spreadsheets or presentations, asking for a printable HTML representation is a good strategy
  const prompt = `
    Convert the content of this document into a high-quality, printable HTML document.
    - If it's a spreadsheet, format it as clean HTML tables with headers.
    - If it's a presentation, format slides as distinct sections/divs with borders and page breaks.
    - Ensure styling is professional (fonts, spacing).
    - Return ONLY the HTML body content. No markdown blocks.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64
            }
          },
          {
            text: prompt
          }
        ]
      }
    });

    return response.text?.replace(/```html/g, '').replace(/```/g, '') || "";
  } catch (error) {
    console.error("Office Conversion Error:", error);
    throw error;
  }
};

export const cleanWatermark = async (fileBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Reconstruct the text content of this PDF, removing any watermarks or overlay text that obscures the main content.
    - Return the clean text content formatted as HTML.
    - Ignore diagonal text or transparent overlays commonly used as watermarks.
    - Return ONLY HTML.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: fileBase64
            }
          },
          {
            text: prompt
          }
        ]
      }
    });

    return response.text?.replace(/```html/g, '').replace(/```/g, '') || "";
  } catch (error) {
     throw error;
  }
};