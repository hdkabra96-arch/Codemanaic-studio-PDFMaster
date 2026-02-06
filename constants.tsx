
import { 
  Merge, Split, Minimize2, FileText, Image, Table, MonitorPlay, 
  RefreshCw, Lock, Unlock, BrainCircuit, FileType, ScanText,
  FileCode, Scissors, Diff, Hammer, FilePlus, Eraser, Hash, Crop, ShieldCheck, FilePenLine
} from 'lucide-react';
import { ToolConfig, ToolCategory } from './types';

export const TOOLS: ToolConfig[] = [
  // Organize
  {
    id: 'merge',
    name: 'Merge PDF',
    description: 'Combine multiple PDFs locally on your device.',
    icon: Merge,
    path: '/merge',
    category: ToolCategory.ORGANIZE,
    acceptsMultiple: true,
    acceptsTypes: '.pdf',
    color: 'bg-brand-600'
  },
  {
    id: 'split',
    name: 'Split PDF',
    description: 'Separate pages for easy management, 100% offline.',
    icon: Split,
    path: '/split',
    category: ToolCategory.ORGANIZE,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-brand-600'
  },
  {
    id: 'rotate',
    name: 'Rotate PDF',
    description: 'Adjust page orientation securely in-browser.',
    icon: RefreshCw,
    path: '/rotate',
    category: ToolCategory.ORGANIZE,
    acceptsMultiple: true,
    acceptsTypes: '.pdf',
    color: 'bg-purple-600'
  },
  {
    id: 'crop',
    name: 'Crop PDF',
    description: 'Trim margins or crop pages locally.',
    icon: Crop,
    path: '/crop',
    category: ToolCategory.ORGANIZE,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-teal-600'
  },
  
  // Convert From PDF
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    description: 'Extract text locally and convert to editable format.',
    icon: FileText,
    path: '/pdf-to-word',
    category: ToolCategory.CONVERT_FROM,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-blue-600'
  },
  {
    id: 'pdf-to-excel',
    name: 'PDF to Excel',
    description: 'Analyze tables locally and export to CSV/XLSX.',
    icon: Table,
    path: '/pdf-to-excel',
    category: ToolCategory.CONVERT_FROM,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-green-500'
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    description: 'Render PDF pages as high-quality local images.',
    icon: Image,
    path: '/pdf-to-jpg',
    category: ToolCategory.CONVERT_FROM,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-pink-600'
  },

  // Convert To PDF
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    description: 'Convert DOC/DOCX files to professional PDF locally.',
    icon: FileType,
    path: '/word-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: false,
    acceptsTypes: '.docx,.doc',
    color: 'bg-blue-700'
  },
  {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    description: 'Convert images to PDF documents securely.',
    icon: FilePlus,
    path: '/jpg-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: true,
    acceptsTypes: '.jpg,.jpeg,.png',
    color: 'bg-rose-500'
  },

  // Edit & Optimize
  {
    id: 'edit-pdf',
    name: 'Edit PDF',
    description: 'Add text, shapes, and redact content locally.',
    icon: FilePenLine,
    path: '/edit-pdf',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-indigo-600'
  },
  {
    id: 'compress',
    name: 'Compress PDF',
    description: 'Reduce file size locally without server uploads.',
    icon: Minimize2,
    path: '/compress',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-green-600'
  },
  {
    id: 'add-watermark',
    name: 'Add Watermark',
    description: 'Stamp text locally over your PDF pages.',
    icon: FilePlus,
    path: '/add-watermark',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-red-500'
  },
  {
    id: 'page-numbers',
    name: 'Add Page Numbers',
    description: 'Number your PDF pages securely in-browser.',
    icon: Hash,
    path: '/page-numbers',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-blue-500'
  },

  // Security
  {
    id: 'unlock',
    name: 'Unlock PDF',
    description: 'Remove PDF password security locally.',
    icon: Unlock,
    path: '/unlock',
    category: ToolCategory.SECURITY,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-gray-600'
  },
  {
    id: 'protect',
    name: 'Protect PDF',
    description: 'Encrypt your PDF locally with a password.',
    icon: Lock,
    path: '/protect',
    category: ToolCategory.SECURITY,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-slate-700'
  },

  // AI & Analysis (Includes OCR)
  {
    id: 'chat-pdf',
    name: 'Local PDF Index',
    description: 'Index and search your PDF locally for answers.',
    icon: BrainCircuit,
    path: '/chat-pdf',
    category: ToolCategory.AI,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-emerald-600'
  },
  {
    id: 'jpg-to-word',
    name: 'JPG to Word',
    description: 'Extract text from images into editable Word Docs.',
    icon: FileText,
    path: '/jpg-to-word',
    category: ToolCategory.AI,
    acceptsMultiple: false,
    acceptsTypes: '.jpg,.jpeg,.png',
    color: 'bg-blue-600'
  },
];
