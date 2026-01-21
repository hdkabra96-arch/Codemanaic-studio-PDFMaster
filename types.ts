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