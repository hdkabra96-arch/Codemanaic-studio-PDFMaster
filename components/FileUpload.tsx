import React, { useCallback, useState } from 'react';
import { UploadCloud, File as FileIcon, X, Plus } from 'lucide-react';
import { ToolConfig } from '../types';

interface FileUploadProps {
  tool: ToolConfig;
  onFilesSelected: (files: File[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ tool, onFilesSelected }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [onFilesSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  }, [onFilesSelected]);

  return (
    <div 
      className={`
        relative group overflow-hidden rounded-[2rem] transition-all duration-500
        flex flex-col items-center justify-center text-center min-h-[400px]
        ${isDragging 
          ? 'bg-brand-50/50 border-2 border-brand-500 scale-[1.01]' 
          : 'bg-white border-2 border-dashed border-slate-200 hover:border-brand-300 hover:bg-slate-50/50 shadow-sm hover:shadow-lg'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Background decoration */}
      <div className={`absolute inset-0 bg-gradient-to-br from-brand-50 to-transparent opacity-0 transition-opacity duration-500 ${isDragging ? 'opacity-100' : 'group-hover:opacity-50'}`} />

      <div className="relative z-10 p-8 flex flex-col items-center w-full max-w-md">
        <div className={`
          w-24 h-24 rounded-3xl flex items-center justify-center mb-8 transition-all duration-500
          ${isDragging 
            ? 'bg-brand-500 text-white shadow-xl shadow-brand-500/30 scale-110' 
            : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-brand-500 group-hover:shadow-xl group-hover:shadow-brand-100'
          }
        `}>
          <UploadCloud size={48} strokeWidth={1.5} className={`${isDragging ? 'animate-bounce' : ''}`} />
        </div>
        
        <h3 className="font-display text-3xl font-bold text-slate-800 mb-3">
          {isDragging ? 'Drop it here!' : 'Upload your files'}
        </h3>
        
        <p className="text-slate-500 mb-10 text-lg leading-relaxed">
          Drag & drop your {tool.acceptsTypes.replace('.', '').toUpperCase()} files here <br/>
          <span className="text-sm opacity-70">or click to browse from your computer</span>
        </p>

        <label className="relative group/btn cursor-pointer">
          <input 
            type="file" 
            className="hidden" 
            multiple={tool.acceptsMultiple}
            accept={tool.acceptsTypes}
            onChange={handleFileInput}
          />
          <div className="
            relative overflow-hidden bg-slate-900 text-white 
            font-display font-bold py-4 px-10 rounded-2xl text-lg
            shadow-xl shadow-slate-900/20 transition-all duration-300
            group-hover/btn:scale-105 group-hover/btn:shadow-2xl group-hover/btn:shadow-brand-900/20
            flex items-center gap-3
          ">
            <span className="relative z-10 flex items-center gap-2">
              <Plus size={20} /> Select Files
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-brand-600 to-brand-500 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
          </div>
        </label>
      </div>
    </div>
  );
};