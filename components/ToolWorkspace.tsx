
import React, { useState, useEffect, useRef } from 'react';
import { ToolConfig, UploadedFile, ChatMessage } from '../types';
import { Trash2, ArrowRight, Download, RotateCw, File as FileIcon, Loader2, Send, Sparkles, AlertCircle, RefreshCcw, CheckCircle2 } from 'lucide-react';
// Fix: Removed cleanWatermark from import as it is not exported by geminiService and not used in this component.
import { generatePDFAnalysis, fileToGenerativePart, convertPDFToDoc, convertPDFToExcel, convertJPGToWordOCR } from '../services/geminiService';
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
  
  const [rotationAngle, setRotationAngle] = useState(0);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [htmlInput, setHtmlInput] = useState('');

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
        text: `I've analyzed **${files[0].file.name}**. I can summarize it, extract key dates, or answer specific questions. What would you like to start with?`,
        timestamp: Date.now()
      }]);
    }
  }, [tool.id, files, chatMessages.length]);

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);
    setProgress(5); 

    try {
      let resultBlob: Blob | null = null;
      let resultName = 'download.pdf';

      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) return prev + Math.random() * 10;
          return prev;
        });
      }, 500);

      switch (tool.id) {
        case 'merge':
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
        case 'pdf-to-word': {
          const base64 = await fileToGenerativePart(files[0].file);
          const htmlDoc = await convertPDFToDoc(base64);
          resultBlob = new Blob([htmlDoc], { type: 'application/msword' });
          resultName = files[0].file.name.replace(/\.pdf$/i, '.doc');
          break;
        }
        case 'pdf-to-excel': {
          const base64 = await fileToGenerativePart(files[0].file);
          const jsonData = await convertPDFToExcel(base64);
          const wb = XLSX.utils.book_new();
          (jsonData.tables || []).forEach((t: any, i: number) => {
            const ws = XLSX.utils.aoa_to_sheet(t.rows);
            XLSX.utils.book_append_sheet(wb, ws, t.name || `Table ${i+1}`);
          });
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          resultBlob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          resultName = files[0].file.name.replace(/\.pdf$/i, '.xlsx');
          break;
        }
        case 'jpg-to-word': {
          const base64 = await fileToGenerativePart(files[0].file);
          const html = await convertJPGToWordOCR(base64, files[0].file.type);
          resultBlob = new Blob([html], { type: 'application/msword' });
          resultName = files[0].file.name + '.doc';
          break;
        }
        default:
          resultBlob = files[0].file;
          resultName = files[0].file.name;
      }

      clearInterval(progressInterval);
      setProgress(100);

      if (resultBlob) {
        setDownloadUrl(URL.createObjectURL(resultBlob));
        setDownloadName(resultName);
        setTimeout(() => setCompleted(true), 600);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isThinking) return;
    const msg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, msg]);
    setChatInput('');
    setIsThinking(true);
    try {
      const base64 = await fileToGenerativePart(files[0].file);
      const res = await generatePDFAnalysis(base64, msg.text);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: res || "I couldn't generate a response.", timestamp: Date.now() }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { id: 'err', role: 'model', text: "Error: " + err.message, timestamp: Date.now() }]);
    } finally {
      setIsThinking(false);
    }
  };

  if (tool.id === 'chat-pdf') {
    return (
      <div className="bg-white rounded-3xl shadow-2xl flex flex-col h-[700px] border border-slate-100 overflow-hidden animate-fade-in">
        <div className="px-6 py-4 border-b flex justify-between bg-slate-50/50 backdrop-blur-md items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">PDF AI Assistant</h4>
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Online & Thinking</p>
            </div>
          </div>
          <button onClick={onReset} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-all">
             <RefreshCcw size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
          {chatMessages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 rounded-tr-none' 
                  : 'bg-white text-slate-700 border border-slate-100 shadow-sm rounded-tl-none'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                <Loader2 size={16} className="animate-spin text-slate-400" />
              </div>
              <span className="text-xs text-slate-400 font-medium">Analyzing document content...</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>
        <div className="p-4 bg-white border-t flex gap-3">
          <input 
            value={chatInput} 
            onChange={e => setChatInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-indigo-50 focus:bg-white focus:border-indigo-300 outline-none transition-all shadow-inner" 
            placeholder="Ask anything about the PDF..." 
          />
          <button 
            onClick={handleSendMessage} 
            disabled={isThinking || !chatInput.trim()} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white w-14 h-14 rounded-2xl flex items-center justify-center transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-indigo-200 hover:-translate-y-0.5"
          >
            <Send size={22}/>
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-[2.5rem] shadow-2xl p-16 text-center animate-fade-in border border-red-50">
        <div className="mx-auto w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-8 shadow-inner shadow-red-100/50">
          <AlertCircle size={40} strokeWidth={1.5}/>
        </div>
        <h2 className="text-2xl font-bold mb-4 text-slate-800">Processing Failed</h2>
        <p className="text-slate-500 mb-10 text-base max-w-sm mx-auto leading-relaxed">{error}</p>
        <button 
          onClick={() => { setError(null); setProcessing(false); }} 
          className="bg-slate-900 text-white font-bold py-4 px-10 rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="bg-white rounded-[2.5rem] shadow-2xl p-16 text-center animate-fade-in border border-emerald-50">
        <div className="mx-auto w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-8 shadow-inner shadow-emerald-100/50">
          <CheckCircle2 size={56} strokeWidth={1.5} className="animate-bounce" />
        </div>
        <h2 className="text-4xl font-extrabold mb-4 text-slate-900 tracking-tight">Ready for Download!</h2>
        <p className="text-slate-500 mb-10 text-lg">Your {tool.name.toLowerCase()} operation was successful.</p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a 
            href={downloadUrl || '#'} 
            download={downloadName} 
            className="inline-flex items-center justify-center gap-3 bg-indigo-600 text-white font-bold py-5 px-12 rounded-2xl hover:shadow-2xl hover:shadow-indigo-200 hover:-translate-y-1 transition-all active:scale-95"
          >
            <Download size={22} /> Download Now
          </a>
          <button 
            onClick={onReset} 
            className="bg-slate-100 text-slate-600 font-bold py-5 px-10 rounded-2xl hover:bg-slate-200 transition-all active:scale-95"
          >
            Perform Another Task
          </button>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center animate-fade-in border border-slate-100">
        <div className="mx-auto w-32 h-32 mb-10 relative">
          <svg className="w-full h-full transform -rotate-90 filter drop-shadow-lg">
            <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
            <circle 
              cx="64" cy="64" r="58" 
              stroke="currentColor" strokeWidth="8" 
              fill="transparent" 
              strokeDasharray={364.4} 
              strokeDashoffset={364.4 - (364.4 * progress) / 100} 
              className="text-indigo-600 transition-all duration-500 ease-out" 
              strokeLinecap="round" 
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-display text-2xl font-black text-slate-800">{Math.round(progress)}%</div>
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">Magically Processing...</h3>
        <p className="text-slate-400 text-sm font-medium animate-pulse">Our intelligent engine is optimizing your document.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-fade-in">
      <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl text-white shadow-lg ${tool.color} ring-4 ring-white`}>
            <tool.icon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">{tool.name}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Workspace</p>
          </div>
        </div>
        <button onClick={onReset} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
          <Trash2 size={20} />
        </button>
      </div>
      
      <div className="p-10">
        <div className="space-y-4 mb-10">
          {files.map(f => (
            <div key={f.id} className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-100 shadow-sm group hover:border-indigo-200 transition-all">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                  <FileIcon size={24} />
                </div>
                <div>
                  <span className="font-bold text-slate-800 block text-base truncate max-w-[300px]">{f.file.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{(f.file.size / 1024 / 1024).toFixed(2)} MB</span>
                    <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                    <span className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">{f.file.type.split('/')[1] || 'DOC'}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => onRemoveFile(f.id)} className="p-3 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>

        {/* Dynamic Tool Controls */}
        <div className="space-y-8 mb-10">
          {tool.id === 'rotate' && (
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner">
              <p className="text-center text-[10px] font-black text-slate-400 uppercase mb-6 tracking-widest">Select Rotation Intensity</p>
              <div className="flex justify-center items-center gap-10">
                <button onClick={() => setRotationAngle(a => a - 90)} className="w-16 h-16 bg-white rounded-2xl border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 shadow-sm transition-all active:scale-90 flex items-center justify-center"><RotateCw className="-scale-x-100" size={24}/></button>
                <div className="relative">
                   <span className="text-4xl font-black text-slate-900 w-24 text-center block tabular-nums">{rotationAngle}°</span>
                   <div className="absolute -bottom-2 left-0 w-full h-1 bg-indigo-500 rounded-full"></div>
                </div>
                <button onClick={() => setRotationAngle(a => a + 90)} className="w-16 h-16 bg-white rounded-2xl border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 shadow-sm transition-all active:scale-90 flex items-center justify-center"><RotateCw size={24}/></button>
              </div>
            </div>
          )}

          {tool.id === 'add-watermark' && (
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Custom Watermark Content</label>
              <input 
                type="text" 
                value={watermarkText} 
                onChange={e => setWatermarkText(e.target.value)} 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:bg-white focus:border-indigo-400 outline-none transition-all text-slate-800 font-bold shadow-inner" 
                placeholder="e.g. PRIVATE"
              />
            </div>
          )}
        </div>

        <button 
          onClick={handleProcess} 
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-6 rounded-[1.5rem] shadow-2xl shadow-slate-900/20 hover:shadow-indigo-900/20 hover:-translate-y-1 transition-all flex items-center justify-center gap-4 text-lg group"
        >
          Begin Intelligent Processing 
          <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
        </button>
      </div>
    </div>
  );
};
