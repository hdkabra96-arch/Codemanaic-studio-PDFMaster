
import React, { useState, useEffect, useRef } from 'react';
import { UploadedFile, PDFEdits, PDFEditObject } from '../types';
import { saveAnnotatedPDF } from '../services/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  Type, Square, ChevronLeft, ChevronRight, 
  Trash2, Save, Undo, Redo, Minus, Plus, Loader2, 
  PenTool, Highlighter, Image as ImageIcon, MousePointer2
} from 'lucide-react';

const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

interface PDFEditorProps {
  file: UploadedFile;
  onClose: () => void;
}

export const PDFEditor: React.FC<PDFEditorProps> = ({ file, onClose }) => {
  const [pdf, setPdf] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [edits, setEdits] = useState<PDFEdits>({});
  const [history, setHistory] = useState<PDFEdits[]>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [selectedTool, setSelectedTool] = useState<'move' | 'text' | 'rectangle' | 'draw' | 'highlighter'>('move');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentBgColor, setCurrentBgColor] = useState('#ffffff');
  const [currentFontSize, setCurrentFontSize] = useState(16);
  const [currentFont, setCurrentFont] = useState<'Helvetica' | 'Times-Roman' | 'Courier'>('Helvetica');
  const [lineWidth, setLineWidth] = useState(2);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); 
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewportDim, setViewportDim] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let active = true;
    const loadPdf = async () => {
      try {
        setLoading(true);
        const arrayBuffer = await file.file.arrayBuffer();
        const loadedPdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        if (active) {
          setPdf(loadedPdf);
          setLoading(false);
        }
      } catch (e) {
        setLoading(false);
      }
    };
    loadPdf();
    return () => { active = false; };
  }, [file]);

  useEffect(() => {
    let renderTask: any = null;
    const render = async () => {
      if (!pdf) return;
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        setViewportDim({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
             const outputScale = window.devicePixelRatio || 1;
             canvas.width = Math.floor(viewport.width * outputScale);
             canvas.height = Math.floor(viewport.height * outputScale);
             canvas.style.width = Math.floor(viewport.width) + "px";
             canvas.style.height = Math.floor(viewport.height) + "px";
             const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
             renderTask = page.render({ canvasContext: ctx, transform: transform, viewport: viewport });
             await renderTask.promise;
          }
        }
      } catch (err: any) {}
    };
    render();
    return () => { if (renderTask) renderTask.cancel(); };
  }, [pdf, pageNum, scale]);

  const addToHistory = (newEdits: PDFEdits) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newEdits)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setEdits(newEdits);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setEdits(JSON.parse(JSON.stringify(history[prevIndex])));
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setEdits(JSON.parse(JSON.stringify(history[nextIndex])));
      setSelectedId(null);
    }
  };

  const getPdfCoordinates = (e: React.MouseEvent) => {
    if (!contentRef.current) return { x: 0, y: 0 };
    const rect = contentRef.current.getBoundingClientRect();
    return { 
      x: (e.clientX - rect.left) / scale, 
      y: (e.clientY - rect.top) / scale 
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedTool === 'move') {
      if (e.target === contentRef.current || e.target === canvasRef.current) {
        setSelectedId(null);
      }
      return;
    }

    const { x, y } = getPdfCoordinates(e);
    const newId = Date.now().toString();
    const currentEdits = [...(edits[pageNum - 1] || [])];

    if (selectedTool === 'text') {
      const newEdit: PDFEditObject = {
        id: newId, type: 'text', x, y, text: 'New Text',
        fontSize: currentFontSize, fontFamily: currentFont, color: currentColor
      };
      addToHistory({ ...edits, [pageNum - 1]: [...currentEdits, newEdit] });
      setSelectedId(newId);
      setSelectedTool('move'); 
    } else if (selectedTool === 'rectangle' || selectedTool === 'highlighter') {
      const isHighlight = selectedTool === 'highlighter';
      const newEdit: PDFEditObject = {
        id: newId, type: 'rectangle', x, y, width: 100, height: 40,
        backgroundColor: isHighlight ? '#ffff00' : currentBgColor,
        opacity: isHighlight ? 0.4 : 1
      };
      addToHistory({ ...edits, [pageNum - 1]: [...currentEdits, newEdit] });
      setSelectedId(newId);
      setSelectedTool('move');
    } else if (selectedTool === 'draw') {
      setIsDrawing(true);
      const newEdit: PDFEditObject = {
        id: newId, type: 'drawing', x, y, 
        color: currentColor, lineWidth: lineWidth, path: [{x, y}]
      };
      setEdits({ ...edits, [pageNum - 1]: [...currentEdits, newEdit] });
      setSelectedId(newId);
    }
  };

  const handleElementMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    if (selectedTool === 'move') {
      setIsDragging(true);
      const { x, y } = getPdfCoordinates(e);
      const edit = edits[pageNum - 1]?.find(ed => ed.id === id);
      if (edit) {
        setDragOffset({ x: x - edit.x, y: y - edit.y });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getPdfCoordinates(e);

    if (isDragging && selectedId && selectedTool === 'move') {
      const pageEdits = [...(edits[pageNum - 1] || [])];
      const editIndex = pageEdits.findIndex(ed => ed.id === selectedId);
      if (editIndex !== -1) {
        pageEdits[editIndex] = {
           ...pageEdits[editIndex],
           x: x - dragOffset.x,
           y: y - dragOffset.y
        };
        setEdits({ ...edits, [pageNum - 1]: pageEdits });
      }
      return;
    }

    if (isDrawing && selectedTool === 'draw' && selectedId) {
      const pageEdits = [...(edits[pageNum - 1] || [])];
      const editIndex = pageEdits.findIndex(ed => ed.id === selectedId);
      if (editIndex !== -1) {
        const edit = { ...pageEdits[editIndex] };
        if (edit.path) {
          edit.path = [...edit.path, { x, y }];
          pageEdits[editIndex] = edit;
          setEdits({ ...edits, [pageNum - 1]: pageEdits });
        }
      }
    }
  };

  const handleMouseUp = () => {
    if (isDragging || isDrawing) {
      setIsDragging(false);
      setIsDrawing(false);
      addToHistory(edits);
    }
  };

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const blob = await saveAnnotatedPDF(file.file, edits);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${file.file.name}`;
      a.click();
    } catch (e) {
      alert("Error saving PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-[850px] bg-slate-100 rounded-[2rem] overflow-hidden border border-slate-200 shadow-2xl relative">
      <div className="h-20 bg-white border-b flex items-center justify-between px-6 z-20 shadow-sm gap-4">
        <div className="flex items-center gap-2">
           <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 mr-2"><ChevronLeft size={20}/></button>
           <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
             <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 hover:bg-white rounded-lg disabled:opacity-30"><Undo size={18}/></button>
             <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-white rounded-lg disabled:opacity-30"><Redo size={18}/></button>
           </div>
           <div className="w-px h-8 bg-slate-200 mx-2"/>
           <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
             <button onClick={() => setSelectedTool('move')} className={`p-2 rounded-lg ${selectedTool === 'move' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600'}`}><MousePointer2 size={18} /></button>
             <button onClick={() => setSelectedTool('draw')} className={`p-2 rounded-lg ${selectedTool === 'draw' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600'}`}><PenTool size={18} /></button>
             <button onClick={() => setSelectedTool('text')} className={`p-2 rounded-lg ${selectedTool === 'text' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600'}`}><Type size={18} /></button>
             <button onClick={() => setSelectedTool('rectangle')} className={`p-2 rounded-lg ${selectedTool === 'rectangle' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600'}`}><Square size={18} /></button>
           </div>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 shadow-inner">
             <div className="flex items-center gap-2 relative cursor-pointer">
                <div className="w-6 h-6 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: selectedTool === 'rectangle' ? currentBgColor : currentColor }}></div>
                <input type="color" value={selectedTool === 'rectangle' ? currentBgColor : currentColor} onChange={e => {
                    const val = e.target.value;
                    if (selectedTool === 'rectangle') { setCurrentBgColor(val); if (selectedId) {
                      const ped = [...(edits[pageNum-1]||[])];
                      const idx = ped.findIndex(x=>x.id===selectedId);
                      if(idx!==-1) { ped[idx].backgroundColor = val; addToHistory({...edits, [pageNum-1]: ped}); }
                    }} else { setCurrentColor(val); if (selectedId) {
                      const ped = [...(edits[pageNum-1]||[])];
                      const idx = ped.findIndex(x=>x.id===selectedId);
                      if(idx!==-1) { ped[idx].color = val; addToHistory({...edits, [pageNum-1]: ped}); }
                    }}
                  }} className="absolute inset-0 opacity-0 cursor-pointer" />
             </div>
             {selectedId && (
               <button onClick={() => {
                 const ped = (edits[pageNum-1]||[]).filter(x=>x.id!==selectedId);
                 addToHistory({...edits, [pageNum-1]: ped});
                 setSelectedId(null);
               }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg flex items-center gap-1">
                 <Trash2 size={16} /> <span className="text-xs font-bold">Delete</span>
               </button>
             )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-1.5 hover:bg-white rounded-md"><Minus size={14} /></button>
            <span className="text-xs font-bold w-12 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="p-1.5 hover:bg-white rounded-md"><Plus size={14} /></button>
          </div>
          <button onClick={handleSave} disabled={isProcessing} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2">
             {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Save size={16} />}
             <span>Save</span>
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-200/50 custom-scrollbar">
         {loading ? (
           <div className="h-full flex items-center justify-center"><Loader2 size={40} className="animate-spin text-indigo-500" /></div>
         ) : (
           <div className="min-w-full min-h-full flex items-start justify-center p-20">
             <div 
               ref={contentRef}
               className="relative shadow-2xl bg-white flex-shrink-0" 
               style={{ width: viewportDim.width, height: viewportDim.height }}
               onMouseDown={handleMouseDown}
               onMouseMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onMouseLeave={handleMouseUp}
             >
                <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
                <svg className="absolute inset-0 pointer-events-none" style={{ width: viewportDim.width, height: viewportDim.height }}>
                   {(edits[pageNum - 1] || []).filter(e => e.type === 'drawing').map(edit => {
                     const pathStr = `M ${edit.path!.map(p => `${p.x * scale} ${p.y * scale}`).join(' L ')}`;
                     return (
                        <path key={edit.id} d={pathStr} stroke={edit.color} strokeWidth={(edit.lineWidth || 2) * scale} fill="none" strokeLinecap="round" className="pointer-events-auto cursor-move" onMouseDown={(e) => handleElementMouseDown(e, edit.id)} />
                     );
                   })}
                </svg>
                {(edits[pageNum - 1] || []).filter(e => e.type !== 'drawing').map(edit => (
                   <div key={edit.id} onMouseDown={(e) => handleElementMouseDown(e, edit.id)} className={`absolute ${selectedId === edit.id ? 'z-50' : 'z-10'}`} style={{
                       left: edit.x * scale, top: edit.y * scale,
                       width: edit.width ? edit.width * scale : 'auto',
                       height: edit.height ? edit.height * scale : 'auto',
                       border: selectedId === edit.id ? '2px dashed #6366f1' : '1px dashed transparent',
                       pointerEvents: 'auto'
                     }}>
                     {edit.type === 'text' && (
                        <input type="text" value={edit.text} autoFocus={selectedId === edit.id} onFocus={(e) => e.target.select()} onChange={(e) => {
                          const ped = [...(edits[pageNum-1]||[])];
                          const idx = ped.findIndex(x=>x.id===edit.id);
                          if(idx!==-1) { ped[idx].text = e.target.value; setEdits({...edits, [pageNum-1]: ped}); }
                        }} className="bg-transparent border-none outline-none p-1" style={{ color: edit.color, fontSize: (edit.fontSize || 16) * scale, fontFamily: edit.fontFamily, width: `${(edit.text?.length || 1) + 2}ch` }} />
                     )}
                     {edit.type === 'rectangle' && ( <div style={{ width: '100%', height: '100%', backgroundColor: edit.backgroundColor, opacity: edit.opacity }} /> )}
                   </div>
                ))}
             </div>
           </div>
         )}
      </div>

      <div className="h-16 bg-white border-t flex items-center justify-center gap-6">
         <button disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)} className="p-2 hover:bg-slate-100 rounded-full disabled:opacity-30"><ChevronLeft size={24} /></button>
         <span className="font-bold text-slate-800 text-sm">Page {pageNum} / {pdf?.numPages || 1}</span>
         <button disabled={pageNum >= (pdf?.numPages || 1)} onClick={() => setPageNum(p => p + 1)} className="p-2 hover:bg-slate-100 rounded-full disabled:opacity-30"><ChevronRight size={24} /></button>
      </div>
    </div>
  );
};
