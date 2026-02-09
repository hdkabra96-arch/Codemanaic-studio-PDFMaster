import React, { useState, useEffect, useRef } from 'react';
import { ToolConfig, UploadedFile, ChatMessage } from '../types';
import { Trash2, ArrowRight, Download, RotateCw, File as FileIcon, Loader2, Send, Sparkles, AlertCircle, RefreshCcw, CheckCircle2, ShieldCheck, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { generatePDFAnalysis, fileToGenerativePart, convertPDFToDoc, convertPDFToExcel, convertJPGToWordOCR } from '../services/geminiService';
import { mergePDFs, splitPDF, rotatePDF, convertWordToPDF, imagesToPDF, pdfToImages, addWatermark, addPageNumbers, cropPDF, repairPDF, removeWatermarks, addHeaderFooter } from '../services/pdfUtils';
import * as XLSX from 'xlsx';
import { PDFEditor } from './PDFEditor';

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
  const [pageNumberColor, setPageNumberColor] = useState('#000000');
  
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [headerFooterColor, setHeaderFooterColor] = useState('#000000');
  const [headerAlign, setHeaderAlign] = useState<'left' | 'center' | 'right'>('center');
  const [footerAlign, setFooterAlign] = useState<'left' | 'center' | 'right'>('center');

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
        text: `Hello! I've indexed **${files[0].file.name}** locally on your device. I can help you find keywords, provide a summary, or locate specific sections. Since I run 100% in your browser, your data never leaves this computer.`,
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
        setProgress(prev => {
          if (prev < 92) return prev + Math.random() * 5;
          return prev;
        });
      }, 400);

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
        case 'remove-watermark':
          resultBlob = await removeWatermarks(files[0].file);
          resultName = `clean_${files[0].file.name}`;
          break;
        case 'page-numbers':
          resultBlob = await addPageNumbers(files[0].file, pageNumberColor);
          resultName = `numbered_${files[0].file.name}`;
          break;
        case 'header-footer':
          resultBlob = await addHeaderFooter(files[0].file, headerText, footerText, headerFooterColor, headerAlign, footerAlign);
          resultName = `header_footer_${files[0].file.name}`;
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
          resultName = files[0].file.name.replace(/\.(docx?|doc)$/i, '.pdf');
          break;
        case 'pdf-to-word': {
          // This now returns a true DOCX Blob generated by Python
          resultBlob = await convertPDFToDoc('', files[0].file);
          resultName = files[0].file.name.replace(/\.pdf$/i, '.docx');
          break;
        }
        case 'pdf-to-excel': {
          const jsonData = await convertPDFToExcel('', files[0].file);
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
          resultName = files[0].file.name.replace(/\.[^/.]+$/, "") + '.doc';
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
      console.error(err);
      setError(err.message || "An unexpected error occurred during processing.");
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
      // Pass the file directly for local extraction
      const res = await generatePDFAnalysis('', msg.text, files[0].file);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: res || "I couldn't find relevant information in the document.", timestamp: Date.now() }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { id: 'err', role: 'model', text: "Local Error: " + err.message, timestamp: Date.now() }]);
    } finally {
      setIsThinking(false);
    }
  };

  if (tool.id === 'edit-pdf') {
    return <PDFEditor file={files[0]} onClose={onReset} />;
  }

  if (tool.id === 'chat-pdf') {
    return (
      <div className="bg-white rounded-[2rem] shadow-2xl flex flex-col h-[750px] border border-slate-100 overflow-hidden animate-fade-in ring-1 ring-slate-200/50">
        <div className="px-8 py-5 border-b flex justify-between bg-slate-50 items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h4 className="font-display font-black text-slate-900 text-lg">Private Assistant</h4>
              <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">100% Offline Analysis</p>
            </div>
          </div>
          <button onClick={onReset} className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all">
             <RefreshCcw size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-50/20">
          {chatMessages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div className={`max-w-[85%] p-5 rounded-[1.5rem] text-sm leading-relaxed shadow-sm ${
                m.role === 'user' 
                  ? 'bg-slate-900 text-white rounded-tr-none font-medium' 
                  : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none border-l-4 border-l-brand-500'
              }`}>
                <div className="prose prose-sm max-w-none">
                  {m.text.split('\n').map((line, i) => <p key={i} className="mb-2 last:mb-0">{line}</p>)}
                </div>
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-brand-500" />
              </div>
              <span className="text-sm text-brand-500 font-bold tracking-tight">Scanning local document index...</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>
        <div className="p-6 bg-white border-t flex gap-4">
          <input 
            value={chatInput} 
            onChange={e => setChatInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
            className="flex-1 bg-slate-100 border-none rounded-2xl px-6 py-5 text-sm focus:ring-4 focus:ring-brand-100 focus:bg-white outline-none transition-all font-medium placeholder:text-slate-400" 
            placeholder="Ask for a 'summary' or search keywords..." 
          />
          <button 
            onClick={handleSendMessage} 
            disabled={isThinking || !chatInput.trim()} 
            className="bg-brand-600 hover:bg-brand-700 text-white w-16 h-16 rounded-2xl flex items-center justify-center transition-all disabled:opacity-50 shadow-xl shadow-brand-200 active:scale-95"
          >
            <Send size={24}/>
          </button>
        </div>
      </div>
    );
  }

  // Same for other tools, but process locally
  if (error) {
    return (
      <div className="bg-white rounded-[3rem] shadow-2xl p-20 text-center animate-fade-in border border-red-100">
        <div className="mx-auto w-24 h-24 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center mb-10 shadow-xl shadow-red-100">
          <AlertCircle size={48} strokeWidth={1.5}/>
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Wait, something happened.</h2>
        <p className="text-slate-500 mb-12 text-lg max-w-md mx-auto leading-relaxed">{error}</p>
        <button 
          onClick={() => { setError(null); setProcessing(false); setProgress(0); }} 
          className="bg-slate-900 text-white font-black py-5 px-12 rounded-2xl hover:bg-slate-800 transition-all shadow-2xl shadow-slate-900/30"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="bg-white rounded-[3rem] shadow-2xl p-20 text-center animate-fade-in border border-emerald-100">
        <div className="mx-auto w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-10 shadow-xl shadow-emerald-100">
          <CheckCircle2 size={56} strokeWidth={1.5} />
        </div>
        <h2 className="text-4xl font-black mb-4 text-slate-900 tracking-tight">Success!</h2>
        <p className="text-slate-500 mb-12 text-xl font-medium">Your document has been processed locally and securely.</p>
        
        <div className="flex flex-col sm:flex-row gap-6 justify-center">
          <a 
            href={downloadUrl || '#'} 
            download={downloadName} 
            className="inline-flex items-center justify-center gap-4 bg-brand-600 text-white font-black py-6 px-16 rounded-2xl hover:bg-brand-700 shadow-2xl shadow-brand-200 transition-all active:scale-95 text-lg"
          >
            <Download size={24} /> Download File
          </a>
          <button 
            onClick={onReset} 
            className="bg-slate-100 text-slate-600 font-bold py-6 px-12 rounded-2xl hover:bg-slate-200 transition-all"
          >
            Start New Task
          </button>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="bg-white rounded-[3rem] shadow-2xl p-20 text-center animate-fade-in border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
          <div className="h-full bg-brand-600 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        
        <div className="mx-auto w-32 h-32 mb-10 relative">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
            <circle 
              cx="64" cy="64" r="60" 
              stroke="currentColor" strokeWidth="8" 
              fill="transparent" 
              strokeDasharray={377} 
              strokeDashoffset={377 - (377 * progress) / 100} 
              className="text-brand-600 transition-all duration-500 ease-out" 
              strokeLinecap="round" 
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-display text-3xl font-black text-slate-900">{Math.round(progress)}%</div>
        </div>
        <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Processing...</h3>
        <p className="text-slate-400 text-lg font-medium animate-pulse">Running Python {tool.id === 'pdf-to-word' ? '(python-docx)' : ''} engine locally...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 animate-fade-in ring-1 ring-slate-200/50">
      <div className="px-12 py-10 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className={`p-5 rounded-3xl text-white shadow-2xl ${tool.color} ring-8 ring-white`}>
            <tool.icon size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{tool.name}</h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{tool.category}</p>
          </div>
        </div>
        <button onClick={onReset} className="w-12 h-12 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all">
          <Trash2 size={24} />
        </button>
      </div>
      
      <div className="p-12">
        <div className="space-y-6 mb-12">
          {files.map(f => (
            <div key={f.id} className="flex items-center justify-between p-6 bg-slate-50/80 rounded-[1.5rem] border border-slate-100 group hover:border-brand-200 hover:bg-white transition-all shadow-sm">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-brand-600 shadow-sm ring-1 ring-slate-200/50 group-hover:scale-105 transition-transform">
                  <FileIcon size={28} />
                </div>
                <div>
                  <span className="font-bold text-slate-900 block text-lg truncate max-w-[400px]">{f.file.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{(f.file.size / 1024 / 1024).toFixed(2)} MB</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span className="text-[10px] text-brand-500 font-black uppercase tracking-widest">{f.file.type.split('/')[1] || 'PDF'}</span>
                  </div>
                </div>
              </div>
              {tool.acceptsMultiple && (
                <button onClick={() => onRemoveFile(f.id)} className="p-3 text-slate-300 hover:text-red-500 transition-all">
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Dynamic Tool Controls */}
        <div className="space-y-10 mb-12">
          {tool.id === 'rotate' && (
            <div className="p-10 bg-slate-50/50 rounded-[2rem] border border-slate-100">
              <p className="text-center text-[10px] font-black text-slate-400 uppercase mb-8 tracking-[0.3em]">Set Rotation Angle</p>
              <div className="flex justify-center items-center gap-12">
                <button onClick={() => setRotationAngle(a => a - 90)} className="w-16 h-16 bg-white rounded-2xl border border-slate-200 hover:border-brand-500 hover:text-brand-600 shadow-xl transition-all active:scale-90 flex items-center justify-center"><RotateCw className="-scale-x-100" size={24}/></button>
                <div className="flex flex-col items-center">
                   <span className="text-5xl font-black text-slate-900 tabular-nums">{rotationAngle}°</span>
                   <div className="w-12 h-1 bg-brand-500 rounded-full mt-2"></div>
                </div>
                <button onClick={() => setRotationAngle(a => a + 90)} className="w-16 h-16 bg-white rounded-2xl border border-slate-200 hover:border-brand-500 hover:text-brand-600 shadow-xl transition-all active:scale-90 flex items-center justify-center"><RotateCw size={24}/></button>
              </div>
            </div>
          )}

          {tool.id === 'add-watermark' && (
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Custom Watermark Text</label>
              <input 
                type="text" 
                value={watermarkText} 
                onChange={e => setWatermarkText(e.target.value)} 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-8 py-5 focus:bg-white focus:border-brand-500 outline-none transition-all text-lg font-bold text-slate-900 shadow-inner" 
                placeholder="e.g. HIGHLY CONFIDENTIAL"
              />
            </div>
          )}
          
          {tool.id === 'page-numbers' && (
             <div className="p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left">
                <h4 className="font-bold text-slate-900 mb-1 text-lg">Page Number Appearance</h4>
                <p className="text-sm text-slate-500 font-medium">Customize the color of the page numbers.</p>
              </div>
              <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div 
                  className="w-12 h-12 rounded-xl border border-slate-200 shadow-inner" 
                  style={{ backgroundColor: pageNumberColor }}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Text Color</span>
                  <input 
                    type="color" 
                    value={pageNumberColor}
                    onChange={(e) => setPageNumberColor(e.target.value)}
                    className="w-24 h-8 cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {tool.id === 'header-footer' && (
            <div className="space-y-8">
               <div className="grid md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Header</label>
                       <div className="flex bg-slate-100 p-1 rounded-lg">
                          <button onClick={() => setHeaderAlign('left')} className={`p-1.5 rounded-md ${headerAlign === 'left' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><AlignLeft size={14} /></button>
                          <button onClick={() => setHeaderAlign('center')} className={`p-1.5 rounded-md ${headerAlign === 'center' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><AlignCenter size={14} /></button>
                          <button onClick={() => setHeaderAlign('right')} className={`p-1.5 rounded-md ${headerAlign === 'right' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><AlignRight size={14} /></button>
                       </div>
                    </div>
                    <input 
                      type="text" 
                      value={headerText} 
                      onChange={e => setHeaderText(e.target.value)} 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:bg-white focus:border-cyan-500 outline-none transition-all font-bold text-slate-900 shadow-inner" 
                      placeholder="Top of page..."
                    />
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Footer</label>
                       <div className="flex bg-slate-100 p-1 rounded-lg">
                          <button onClick={() => setFooterAlign('left')} className={`p-1.5 rounded-md ${footerAlign === 'left' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><AlignLeft size={14} /></button>
                          <button onClick={() => setFooterAlign('center')} className={`p-1.5 rounded-md ${footerAlign === 'center' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><AlignCenter size={14} /></button>
                          <button onClick={() => setFooterAlign('right')} className={`p-1.5 rounded-md ${footerAlign === 'right' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><AlignRight size={14} /></button>
                       </div>
                    </div>
                    <input 
                      type="text" 
                      value={footerText} 
                      onChange={e => setFooterText(e.target.value)} 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:bg-white focus:border-cyan-500 outline-none transition-all font-bold text-slate-900 shadow-inner" 
                      placeholder="Bottom of page..."
                    />
                 </div>
               </div>

               <div className="p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1">Text Color</h4>
                    <p className="text-xs text-slate-500 font-medium">Applies to both header and footer.</p>
                  </div>
                  <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div 
                      className="w-10 h-10 rounded-xl border border-slate-200 shadow-inner" 
                      style={{ backgroundColor: headerFooterColor }}
                    />
                    <input 
                      type="color" 
                      value={headerFooterColor}
                      onChange={(e) => setHeaderFooterColor(e.target.value)}
                      className="w-20 h-8 cursor-pointer bg-transparent"
                    />
                  </div>
               </div>
            </div>
          )}
        </div>

        <button 
          onClick={handleProcess} 
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-7 rounded-[2rem] shadow-2xl shadow-slate-900/30 hover:shadow-brand-900/40 hover:-translate-y-1 transition-all flex items-center justify-center gap-6 text-xl group active:scale-[0.98]"
        >
          Process Document
          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-brand-500 transition-colors">
            <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
};
