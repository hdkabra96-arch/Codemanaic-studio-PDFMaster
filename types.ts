
import { LucideIcon } from "lucide-react";

export enum ToolCategory {
  ORGANIZE = "Organize",
  CONVERT_FROM = "Convert from PDF",
  CONVERT_TO = "Convert to PDF",
  SECURITY = "Security",
  EDIT = "Edit & Optimize",
  AI = "AI & Analysis"
}

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  path: string;
  category: ToolCategory;
  acceptsMultiple: boolean;
  acceptsTypes: string; // e.g., ".pdf" or ".doc,.docx"
  color: string;
}

export interface UploadedFile {
  id: string;
  file: File;
  previewUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface PDFEditObject {
  id: string;
  type: 'text' | 'rectangle' | 'image' | 'drawing';
  x: number; // PDF coordinates (points)
  y: number; // PDF coordinates (points), origin bottom-left for pdf-lib, but we might store top-left for UI
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: 'Helvetica' | 'Times-Roman' | 'Courier';
  color?: string; // Hex
  backgroundColor?: string; // Hex
  opacity?: number;
  
  // For images
  imageData?: string; // base64 string
  
  // For drawings
  path?: {x: number, y: number}[]; // Array of points
  lineWidth?: number;
}

export type PDFEdits = Record<number, PDFEditObject[]>; // pageIndex (0-based) -> objects
