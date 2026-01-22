import React, { useState, useEffect, useRef } from 'react';
import { ToolConfig, UploadedFile, ChatMessage } from '../types';
import { Trash2, ArrowRight, Download, RotateCw, File as FileIcon, Loader2, Send, Sparkles, Bot, User, Crop, Type, Hash, Code, AlertCircle } from 'lucide-react';
import { generatePDFAnalysis, fileToGenerativePart, convertPDFToDoc, convertPDFToExcel, convertJPGToWordOCR, convertOfficeToHtml, cleanWatermark } from '../services/geminiService';
import { mergePDFs, splitPDF, rotatePDF, convertWordToPDF, imagesToPDF, pdfToImages, addWatermark, addPageNumbers, cropPDF, repairPDF } from '../services/pdfUtils';
import * as XLSX from 'xlsx';

interface ToolWorkspaceProps {
  tool: ToolConfig;
  files: UploadedFile[];
  onRemoveFile: (id: string) => void;
  onReset: () => void;
}

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ tool, files, onRemoveFile, onReset }) => {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('document.pdf');
  
  // Tool Specific UI States
  const [rotationAngle, setRotationAngle] = useState(0);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [htmlInput, setHtmlInput] = useState('');

  // AI Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isThinking]);

  useEffect(() => {
    if (tool.id === 'chat-pdf' && chatMessages.length === 0) {
      setChatMessages([{
        id: 'init',
        role: 'model',
        text: `Hi there! I've analyzed **${files[0].file.name}**. I'm ready to summarize it, answer questions, or extract specific data for you.`,
        timestamp: Date.now()
      }]);
    }
  }, [tool.id, files, chatMessages.length]);

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);
    setProgress(10); 

    try {
      let resultBlob: Blob | null = null;
      let resultName = 'download.pdf';

      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 90));
      }, 300);

      switch (tool.id) {
        case 'merge':
          if (files.length < 2) {
            throw new Error("Please select at least 2 PDF files to merge.");
          }
          resultBlob = await mergePDFs(files.map(f => f.file));
          resultName = 'merged_document.pdf';
          break;

        case 'split':
          resultBlob = await splitPDF(files[0].file);
          resultName = 'split_pages.zip';
          break;

        case 'rotate':
          resultBlob = await rotatePDF(files[0].file, rotationAngle);
          resultName = `rotated_${files[0].file.name}`;
          break;

        case 'crop':
          resultBlob = await cropPDF(files[0].file);
          resultName = `cropped_${files[0].file.name}`;
          break;
        
        case 'repair':
          resultBlob = await repairPDF(files[0].file);
          resultName = `repaired_${files[0].file.name}`;
          break;

        case 'add-watermark':
          resultBlob = await addWatermark(files[0].file, watermarkText);
          resultName = `watermarked_${files[0].file.name}`;
          break;
        
        case 'page-numbers':
          resultBlob = await addPageNumbers(files[0].file);
          resultName = `numbered_${files[0].file.name}`;
          break;

        case 'jpg-to-pdf':
          resultBlob = await imagesToPDF(files.map(f => f.file));
          resultName = 'images_combined.pdf';
          break;

        case 'pdf-to-jpg':
          resultBlob = await pdfToImages(files[0].file);
          resultName = 'pdf_images.zip';
          break;

        case 'word-to-pdf':
            resultBlob = await convertWordToPDF(files[0].file);
            resultName = files[0].file.name.replace(/\.docx?$/i, '.pdf');
            break;

        case 'html-to-pdf': {
          // If file is provided, read it, else use text input
          let content = htmlInput;
          if (files.length > 0) {
            content = await files[0].file.text();
          }
          if (!content) throw new Error("No HTML content found.");
          
          const element = document.createElement('div');
          element.innerHTML = content;
          // @ts-ignore
          resultBlob = await window.html2pdf().set({ margin: 10, filename: 'webpage.pdf' }).from(element).output('blob');
          resultName = 'webpage.pdf';
          break;
        }

        // --- AI Powered or Complex Conversions ---

        case 'pdf-to-word': {
          const base64 = await fileToGenerativePart(files[0].file);
          const htmlDoc = await convertPDFToDoc(base64);
          resultBlob = new Blob([htmlDoc], { type: 'application/msword' });
          resultName = files[0].file.name.replace(/\.pdf$/i, '.doc');
          break;
        }

        case 'jpg-to-word':
        case 'ocr-to-pdf': {
          // Both use the same OCR logic initially, but output might differ. 
          // For OCR-to-PDF, we generate a DOC and let user save as PDF (via print) or return HTML that html2pdf converts.
          // Let's return a DOC for jpg-to-word, and a PDF for ocr-to-pdf.
          const base64 = await fileToGenerativePart(files[0].file);
          const htmlContent = await convertJPGToWordOCR(base64, files[0].file.type);
          
          if (tool.id === 'ocr-to-pdf') {
             const element = document.createElement('div');
             element.innerHTML = htmlContent;
             // @ts-ignore
             resultBlob = await window.html2pdf().from(element).output('blob');
             resultName = files[0].file.name + '.pdf';
          } else {
             resultBlob = new Blob([htmlContent], { type: 'application/msword' });
             resultName = files[0].file.name + '.doc';
          }
          break;
        }
        
        case 'pdf-to-ocr': {
           // Extract text
           const base64 = await fileToGenerativePart(files[0].file);
           const cleanHtml = await cleanWatermark(base64); // Reuse clean function to get text
           resultBlob = new Blob([cleanHtml], { type: 'text/html' });
           resultName = 'extracted_text.html';
           break;
        }

        case 'pdf-to-excel': {
          const base64 = await fileToGenerativePart(files[0].file);
          const jsonData = await convertPDFToExcel(base64);
          
          const wb = XLSX.utils.book_new();
          if (jsonData.tables?.length > 0) {
            jsonData.tables.forEach((table: any, index: number) => {
               const ws = XLSX.utils.aoa_to_sheet(table.rows);
               XLSX.utils.book_append_sheet(wb, ws, `Sheet ${index + 1}`);
            });
          } else {
             const ws = XLSX.utils.aoa_to_sheet([['No tabular data found']]);
             XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");
          }
          const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          resultBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          resultName = files[0].file.name.replace(/\.pdf$/i, '.xlsx');
          break;
        }

        case 'excel-to-pdf':
        case 'ppt-to-pdf': {
           const base64 = await fileToGenerativePart(files[0].file);
           // Use AI to render a print view of the office file
           const htmlView = await convertOfficeToHtml(base64, files[0].file.type);
           
           const element = document.createElement('div');
           element.innerHTML = `
             <style>table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; }</style>
             <div style="font-family: sans-serif; padding: 20px;">${htmlView}</div>
           `;
           // @ts-ignore
           resultBlob = await window.html2pdf().set({ margin: 10, html2canvas: { scale: 2 } }).from(element).output('blob');
           resultName = files[0].file.name + '.pdf';
           break;
        }

        case 'remove-watermark': {
           const base64 = await fileToGenerativePart(files[0].file);
           const cleanHtml = await cleanWatermark(base64);
           // Convert back to PDF
           const element = document.createElement('div');
           element.innerHTML = cleanHtml;
           // @ts-ignore
           resultBlob = await window.html2pdf().from(element).output('blob');
           resultName = 'clean_' + files[0].file.name;
           break;
        }

        case 'compare':
           // Mock comparison result for now as simple text diff is hard to visualize cleanly in PDF
           alert("Comparison feature will generate a report.");
           // Logic to extract text from both and diff could go here
           resultBlob = files[0].file; // Return original for now
           break;

        default:
          console.warn(`Tool ${tool.id} logic not fully implemented, returning original.`);
          resultBlob = files[0].file;
          resultName = files[0].file.name;
          break;
      }

      clearInterval(progressInterval);
      setProgress(100);

      if (resultBlob) {
        const url = URL.createObjectURL(resultBlob);
        setDownloadUrl(url);
        setDownloadName(resultName);
        setTimeout(() => setCompleted(true), 500); 
      }

    } catch (error) {
      console.error("Processing failed", error);
      setError((error as Error).message);
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isThinking) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: chatInput,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsThinking(true);

    try {
      const base64 = await fileToGenerativePart(files[0].file);
      const response = await generatePDFAnalysis(base64, userMsg.text);

      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response || "I couldn't generate a response.",
        timestamp: Date.now()
      }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { id: 'err', role: 'model', text: "Error: " + (error as Error).message, timestamp: Date.now() }]);
    } finally {
      setIsThinking(false);
    }
  };

  // --- Render Functions ---

  if (tool.id === 'chat-pdf') {
     return (
      <div className="bg-white rounded-3xl shadow-xl flex flex-col h-[700px]">
        <div className="p-4 border-b flex justify-between bg-slate-50">
           <span className="font-bold flex items-center gap-2"><Sparkles size={18} className="text-indigo-600"/> AI Assistant</span>
           <button onClick={onReset} className="text-sm text-slate-500 hover:text-slate-800">Change File</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
           {chatMessages.map(msg => (
             <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                   {msg.text}
                </div>
             </div>
           ))}
           {isThinking && <div className="text-sm text-slate-400 animate-pulse flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Thinking...</div>}
           <div ref={chatBottomRef} />
        </div>
        <div className="p-4 border-t flex gap-2">
           <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-1 border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" placeholder="Ask questions about your PDF..." />
           <button onClick={handleSendMessage} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-xl transition-colors"><Send size={20}/></button>
        </div>
      </div>
     );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl shadow-xl p-12 text-center animate-fade-in border border-red-100">
        <div className="mx-auto w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle size={40}/>
        </div>
        <h2 className="text-2xl font-bold mb-4 text-slate-800">Something went wrong</h2>
        <p className="text-slate-600 mb-8 max-w-lg mx-auto">{error}</p>
        
        {error.includes("API Key") && (
          <div className="bg-slate-50 p-6 rounded-xl text-left text-sm text-slate-700 mb-8 border border-slate-200 max-w-lg mx-auto">
            <p className="font-bold mb-3 flex items-center gap-2"><Code size={16}/> Setup Required</p>
            <ul className="list-decimal list-inside space-y-2 text-slate-600">
              <li>Create a <code className="bg-white border border-slate-300 px-1.5 py-0.5 rounded font-mono text-xs">.env</code> file in your project root.</li>
              <li>Add your API key: <code className="bg-white border border-slate-300 px-1.5 py-0.5 rounded font-mono text-xs">API_KEY=AIzaSy...</code></li>
              <li>Restart the development server.</li>
            </ul>
          </div>
        )}

        <button 
          onClick={() => { setError(null); onReset(); }} 
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-8 rounded-xl transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="bg-white rounded-3xl shadow-xl p-12 text-center animate-fade-in">
        <div className="mx-auto w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6"><Download size={40}/></div>
        <h2 className="text-3xl font-bold mb-4 text-slate-800">Ready!</h2>
        <p className="text-slate-500 mb-8">Your file has been processed successfully.</p>
        <a href={downloadUrl || '#'} download={downloadName} className="inline-flex items-center gap-2 bg-slate-900 text-white font-bold py-4 px-8 rounded-xl hover:shadow-xl hover:-translate-y-0.5 transition-all">
          <Download size={20} /> Download File
        </a>
        <button onClick={onReset} className="block mt-6 mx-auto text-slate-500 hover:text-slate-800 font-medium transition-colors">Process another file</button>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="bg-white rounded-3xl shadow-xl p-16 text-center animate-fade-in">
        <div className="mx-auto w-24 h-24 mb-8 relative">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * progress) / 100} className="text-brand-500 transition-all duration-300" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-bold text-xl text-slate-700">{progress}%</div>
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Processing your file...</h3>
        <p className="text-slate-500">This might take a few seconds.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-white animate-fade-in">
      <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white">
        <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <div className="bg-brand-50 text-brand-600 p-2.5 rounded-xl shadow-sm"><tool.icon size={24} /></div>
          {tool.name}
        </h3>
        <button onClick={onReset} className="text-slate-400 hover:text-brand-600 font-medium transition-colors">Reset</button>
      </div>
      
      <div className="p-8">
        {tool.id !== 'html-to-pdf' && (
          <div className="space-y-4 mb-10">
            {files.map(file => (
              <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 group hover:border-brand-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-brand-500 shadow-sm">
                    <FileIcon size={20} />
                  </div>
                  <div>
                    <span className="font-medium text-slate-700 block">{file.file.name}</span>
                    <span className="text-xs text-slate-400">{(file.file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
                <button onClick={() => onRemoveFile(file.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={20} /></button>
              </div>
            ))}
             {tool.acceptsMultiple && (
                <div className="text-center">
                  <button className="text-sm text-brand-600 font-bold hover:underline">+ Add another file</button>
                </div>
             )}
          </div>
        )}

        {/* Dynamic Inputs based on Tool */}
        {tool.id === 'rotate' && (
          <div className="mb-8 text-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <p className="mb-4 text-slate-500 font-medium uppercase tracking-wider text-xs">Rotation Angle</p>
            <div className="flex justify-center items-center gap-6">
              <button onClick={() => setRotationAngle(prev => prev - 90)} className="w-16 h-16 bg-white border border-slate-200 rounded-xl hover:border-brand-500 hover:text-brand-600 flex flex-col items-center justify-center shadow-sm transition-all"><RotateCw className="-scale-x-100 mb-1" size={20}/><span className="text-[10px] font-bold">-90°</span></button>
              <div className="text-2xl font-bold w-20 text-center text-slate-800">{rotationAngle}°</div>
              <button onClick={() => setRotationAngle(prev => prev + 90)} className="w-16 h-16 bg-white border border-slate-200 rounded-xl hover:border-brand-500 hover:text-brand-600 flex flex-col items-center justify-center shadow-sm transition-all"><RotateCw className="mb-1" size={20}/><span className="text-[10px] font-bold">+90°</span></button>
            </div>
          </div>
        )}

        {tool.id === 'add-watermark' && (
          <div className="mb-8">
            <label className="block text-sm font-bold text-slate-700 mb-2">Watermark Text</label>
            <div className="flex items-center border border-slate-200 rounded-xl px-4 py-3 focus-within:ring-2 ring-brand-100 bg-slate-50 focus-within:bg-white transition-all">
               <Type className="text-slate-400 mr-2" />
               <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} className="flex-1 outline-none bg-transparent" placeholder="e.g. CONFIDENTIAL" />
            </div>
          </div>
        )}

        {tool.id === 'html-to-pdf' && (
          <div className="mb-8">
             <div className="mb-4 p-4 bg-blue-50 text-blue-700 rounded-xl text-sm border border-blue-100">
                Upload an HTML file above OR paste code below.
             </div>
             <textarea 
               value={htmlInput} 
               onChange={e => setHtmlInput(e.target.value)}
               placeholder="<html><body><h1>Hello World</h1></body></html>"
               className="w-full h-40 p-4 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 ring-brand-100 resize-none bg-slate-50 focus:bg-white transition-all"
             />
          </div>
        )}

        {tool.id === 'crop' && (
          <div className="mb-8 p-4 bg-teal-50 text-teal-800 rounded-xl text-sm flex items-center gap-3 border border-teal-100">
             <div className="bg-teal-100 p-2 rounded-lg"><Crop size={18} /></div>
             <span className="font-medium">This will automatically crop 1 inch from all margins.</span>
          </div>
        )}

        {tool.id === 'page-numbers' && (
          <div className="mb-8 p-4 bg-blue-50 text-blue-800 rounded-xl text-sm flex items-center gap-3 border border-blue-100">
             <div className="bg-blue-100 p-2 rounded-lg"><Hash size={18} /></div>
             <span className="font-medium">Page numbers will be added to the bottom center of each page.</span>
          </div>
        )}

        <button 
          onClick={handleProcess}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg py-5 rounded-2xl shadow-xl shadow-slate-900/10 hover:shadow-2xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 group"
        >
          <span>{tool.id.includes('to') ? 'Convert' : tool.name.split(' ')[0]} Now</span> 
          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};