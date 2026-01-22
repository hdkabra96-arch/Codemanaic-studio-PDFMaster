
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
        systemInstruction: "You are a professional PDF analyst. Provide deep, accurate, and helpful insights. Format your responses with clear markdown.",
        thinkingConfig: { thinkingBudget: 2000 }
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
  const prompt = `Convert this PDF content into clean, semantic HTML suitable for Microsoft Word. Preserve structure like headings, lists, and tables. Return ONLY the HTML content.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ inlineData: { mimeType: 'application/pdf', data: fileBase64 } }, { text: prompt }] }]
    });
    return response.text || "";
  } catch (error) {
    throw error;
  }
};

export const convertPDFToExcel = async (fileBase64: string): Promise<any> => {
  const ai = getAI();
  const prompt = `Extract all tables from this PDF. Return a JSON object with 'tables' containing arrays of rows.`;
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
                  name: { type: Type.STRING },
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
  const prompt = `Perform high-precision OCR. Convert this document image into clean, formatted HTML. Maintain tables and bold text. Return ONLY HTML.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ inlineData: { mimeType, data: fileBase64 } }, { text: prompt }] }]
    });
    return response.text || "";
  } catch (error) {
    throw error;
  }
};
