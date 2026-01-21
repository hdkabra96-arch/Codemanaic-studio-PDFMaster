import { 
  Merge, Split, Minimize2, FileText, Image, Table, MonitorPlay, 
  RefreshCw, Lock, Unlock, BrainCircuit, FileType, ScanText,
  FileCode, Scissors, Diff, Hammer, FilePlus, Eraser, Hash, Crop
} from 'lucide-react';
import { ToolConfig, ToolCategory } from './types';

export const TOOLS: ToolConfig[] = [
  // Organize
  {
    id: 'merge',
    name: 'Merge PDF',
    description: 'Combine multiple PDFs into one unified document.',
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
    description: 'Separate one page or a whole set for easy conversion.',
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
    description: 'Rotate your PDFs the way you need them.',
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
    description: 'Trim margins or crop PDF pages.',
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
    description: 'Convert your PDF to editable Word documents.',
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
    description: 'Pull data straight from PDFs into Excel spreadsheets.',
    icon: Table,
    path: '/pdf-to-excel',
    category: ToolCategory.CONVERT_FROM,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-green-500'
  },
  {
    id: 'pdf-to-ppt',
    name: 'PDF to PowerPoint',
    description: 'Turn your PDF documents into PPT slides.',
    icon: MonitorPlay,
    path: '/pdf-to-ppt',
    category: ToolCategory.CONVERT_FROM,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-orange-600'
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    description: 'Convert each PDF page into a high-quality JPG image.',
    icon: Image,
    path: '/pdf-to-jpg',
    category: ToolCategory.CONVERT_FROM,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-pink-600'
  },
  {
    id: 'pdf-to-ocr',
    name: 'PDF to OCR Text',
    description: 'Extract text from scanned PDFs using advanced AI OCR.',
    icon: ScanText,
    path: '/pdf-to-ocr',
    category: ToolCategory.CONVERT_FROM,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-slate-800'
  },

  // Convert To PDF
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    description: 'Make DOCX files into easy to read PDF.',
    icon: FileType,
    path: '/word-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: false,
    acceptsTypes: '.docx',
    color: 'bg-blue-700'
  },
  {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    description: 'Convert images to PDF documents.',
    icon: FilePlus,
    path: '/jpg-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: true,
    acceptsTypes: '.jpg,.jpeg,.png',
    color: 'bg-rose-500'
  },
  {
    id: 'excel-to-pdf',
    name: 'Excel to PDF',
    description: 'Convert spreadsheets to PDF documents.',
    icon: Table,
    path: '/excel-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: false,
    acceptsTypes: '.xlsx,.xls',
    color: 'bg-green-600'
  },
  {
    id: 'ppt-to-pdf',
    name: 'PowerPoint to PDF',
    description: 'Convert presentations to PDF documents.',
    icon: MonitorPlay,
    path: '/ppt-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: false,
    acceptsTypes: '.pptx,.ppt',
    color: 'bg-orange-500'
  },
  {
    id: 'html-to-pdf',
    name: 'HTML to PDF',
    description: 'Convert HTML code or files to PDF.',
    icon: FileCode,
    path: '/html-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: false,
    acceptsTypes: '.html,.htm',
    color: 'bg-cyan-600'
  },
  {
    id: 'ocr-to-pdf',
    name: 'OCR to PDF',
    description: 'Convert scanned images into searchable PDF documents.',
    icon: ScanText,
    path: '/ocr-to-pdf',
    category: ToolCategory.CONVERT_TO,
    acceptsMultiple: false,
    acceptsTypes: '.jpg,.jpeg,.png',
    color: 'bg-indigo-500'
  },

  // Edit & Optimize
  {
    id: 'compress',
    name: 'Compress PDF',
    description: 'Reduce file size while optimizing quality.',
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
    description: 'Stamp text or images over your PDF pages.',
    icon: FilePlus,
    path: '/add-watermark',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-red-500'
  },
  {
    id: 'remove-watermark',
    name: 'Remove Watermark',
    description: 'Clean unwanted watermarks from your documents.',
    icon: Eraser,
    path: '/remove-watermark',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-slate-500'
  },
  {
    id: 'page-numbers',
    name: 'Add Page Numbers',
    description: 'Number your PDF pages with ease.',
    icon: Hash,
    path: '/page-numbers',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-blue-500'
  },
  {
    id: 'compare',
    name: 'Compare PDF',
    description: 'Compare two PDFs to see the differences.',
    icon: Diff,
    path: '/compare',
    category: ToolCategory.EDIT,
    acceptsMultiple: true, // Needs 2 files
    acceptsTypes: '.pdf',
    color: 'bg-violet-600'
  },
  {
    id: 'repair',
    name: 'Repair PDF',
    description: 'Recover data from corrupted or damaged PDF files.',
    icon: Hammer,
    path: '/repair',
    category: ToolCategory.EDIT,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-amber-600'
  },

  // Security
  {
    id: 'unlock',
    name: 'Unlock PDF',
    description: 'Remove PDF password security.',
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
    description: 'Encrypt your PDF file with a password.',
    icon: Lock,
    path: '/protect',
    category: ToolCategory.SECURITY,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-slate-700'
  },

  // AI
  {
    id: 'chat-pdf',
    name: 'Chat with PDF',
    description: 'Use AI to summarize, analyze, and ask questions.',
    icon: BrainCircuit,
    path: '/chat-pdf',
    category: ToolCategory.AI,
    acceptsMultiple: false,
    acceptsTypes: '.pdf',
    color: 'bg-indigo-600'
  },
  {
    id: 'jpg-to-word',
    name: 'JPG to Word OCR',
    description: 'Extract text from images and convert to Word.',
    icon: ScanText,
    path: '/jpg-to-word',
    category: ToolCategory.AI,
    acceptsMultiple: false,
    acceptsTypes: '.jpg,.jpeg,.png',
    color: 'bg-rose-600'
  },
];