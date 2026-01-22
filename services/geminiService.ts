
import { GoogleGenAI, Type } from "@google/genai";

// Initialize AI inside functions to ensure the latest API key is used
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

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

export const generatePDFAnalysis = async (fileBase64: string, prompt: string) => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: fileBase64 } },
            { text: prompt }
          ]
        }
      ],
      config: {
        systemInstruction: "You are an expert document analyst. Provide precise, professional, and actionable insights from the provided PDF. Use Markdown for formatting.",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const convertPDFToDoc = async (fileBase64: string): Promise<string> => {
  const ai = getAI();
  const prompt = `Extract all text and structural elements from this PDF. Reconstruct it into a clean, well-formatted HTML document suitable for word processing. Include headings, paragraphs, lists, and tables. Return ONLY the HTML code.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: fileBase64 } }, { text: prompt }] }],
      config: {
        systemInstruction: "You are a specialized file conversion engine. Your output must be valid, semantic HTML that preserves the original document's intent and layout as much as possible."
      }
    });
    return response.text || "";
  } catch (error) {
    throw error;
  }
};

export const convertPDFToExcel = async (fileBase64: string): Promise<any> => {
  const ai = getAI();
  const prompt = `Identify and extract all tabular data from this PDF. Organize the data into structured tables.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: fileBase64 } }, { text: prompt }] }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Descriptive name for the sheet" },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  }
                },
                required: ["rows"]
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "{\"tables\":[]}");
  } catch (error) {
    throw error;
  }
};

export const convertJPGToWordOCR = async (fileBase64: string, mimeType: string): Promise<string> => {
  const ai = getAI();
  const prompt = `Extract all text and formatting from this image. Convert it into a semantic, clean HTML document. Maintain table structures and text emphasis. Return ONLY HTML.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ inlineData: { mimeType, data: fileBase64 } }, { text: prompt }] }],
      config: {
        systemInstruction: "You are a high-precision OCR and document reconstruction engine."
      }
    });
    return response.text || "";
  } catch (error) {
    throw error;
  }
};
