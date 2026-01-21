import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TOOLS } from '../constants';
import { FileUpload } from '../components/FileUpload';
import { ToolWorkspace } from '../components/ToolWorkspace';
import { UploadedFile } from '../types';

export const ToolPage: React.FC = () => {
  const { toolId } = useParams();
  const navigate = useNavigate();
  const tool = TOOLS.find(t => t.path === `/${toolId}`);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Reset state when tool changes
  useEffect(() => {
    setFiles([]);
  }, [toolId]);

  if (!tool) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-slate-800">Tool not found</h2>
        <button 
          onClick={() => navigate('/')}
          className="mt-4 text-brand-600 hover:underline"
        >
          Go back home
        </button>
      </div>
    );
  }

  const handleFilesSelected = (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'pending'
    }));

    if (tool.acceptsMultiple) {
      setFiles(prev => [...prev, ...uploadedFiles]);
    } else {
      setFiles([uploadedFiles[0]]);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const handleReset = () => {
    setFiles([]);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Tool Header */}
      <div className="bg-white border-b border-slate-100 py-12 px-4 text-center">
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-4">{tool.name}</h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">{tool.description}</p>
      </div>

      {/* Workspace */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {files.length === 0 ? (
          <FileUpload tool={tool} onFilesSelected={handleFilesSelected} />
        ) : (
          <ToolWorkspace 
            tool={tool} 
            files={files} 
            onRemoveFile={handleRemoveFile} 
            onReset={handleReset}
          />
        )}
      </div>

      {/* SEO Content Placeholder */}
      <div className="max-w-4xl mx-auto px-4 pb-20 text-slate-600 prose">
        <h3 className="text-xl font-bold text-slate-800 mb-4">How to use {tool.name}?</h3>
        <p>
          Processing your PDF files has never been easier. Just drag and drop your files into the box above, 
          configure your settings, and we'll handle the rest. Our servers are secure and your privacy is guaranteed.
        </p>
      </div>
    </div>
  );
};