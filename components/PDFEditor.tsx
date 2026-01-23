
import React, { useState, useEffect, useRef } from 'react';
import { UploadedFile, PDFEdits, PDFEditObject } from '../types';
import { saveAnnotatedPDF } from '../services/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  Type, Square, ChevronLeft, ChevronRight, 
  Trash2, Save, Undo, Redo, Move, Minus, Plus, Loader2, 
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
  
  // History State
  const [edits, setEdits] = useState<PDFEdits>({});
  const [history, setHistory] = useState<PDFEdits[]>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Tools
  const [selectedTool, setSelectedTool] = useState<'move' | 'text' | 'rectangle' | 'draw' | 'highlighter'>('move');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Style State
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentBgColor, setCurrentBgColor] = useState('#ffffff');
  const [currentFontSize, setCurrentFontSize] = useState(16);
  const [currentFont, setCurrentFont] = useState<'Helvetica' | 'Times-Roman' | 'Courier'>('Helvetica');
  const [lineWidth, setLineWidth] = useState(2);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); // Ref for the PDF content wrapper
  const scrollContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable area
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewportDim, setViewportDim] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPos, setInitialPos] = useState({ x: 0, y: 0 });

  // Load PDF
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
        console.error("Failed to load PDF:", e);
        setLoading(false);
      }
    };
    loadPdf();
    return () => { active = false; };
  }, [file]);

  // Render Page
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
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') console.error("Render error:", err);
      }
    };
    render();
    return () => { if (renderTask) renderTask.cancel(); };
  }, [pdf, pageNum, scale]);

  // --- History Management ---
  const addToHistory = (newEdits: PDFEdits) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newEdits);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setEdits(newEdits);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setEdits(history[prevIndex]);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setEdits(history[nextIndex]);
      setSelectedId(null);
    }
  };

  // --- Coordinate Helper ---
  // Calculates coordinates relative to the PDF content wrapper (contentRef)
  // regardless of scroll position or padding.
  const getPdfCoordinates = (e: React.MouseEvent) => {
    if (!contentRef.current) return { x: 0, y: 0 };
    const rect = contentRef.current.getBoundingClientRect();
    return { 
      x: (e.clientX - rect.left) / scale, 
      y: (e.clientY - rect.top) / scale 
    };
  };

  // --- Mouse Event Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    // If clicking directly on the wrapper/canvas (not bubbling from an element)
    // while in move mode, deselect everything.
    if (selectedTool === 'move') {
      setSelectedId(null);
      return;
    }

    const { x, y } = getPdfCoordinates(e);
    const newId = Date.now().toString();
    const currentEdits = [...(edits[pageNum - 1] || [])];

    if (selectedTool === 'text') {
      const newEdit: PDFEditObject = {
        id: newId, type: 'text', x, y, text: 'Type here',
        fontSize: currentFontSize, fontFamily: currentFont, color: currentColor
      };
      addToHistory({ ...edits, [pageNum - 1]: [...currentEdits, newEdit] });
      setSelectedId(newId);
      // Keep text tool selected but focus the input
      // or optionally switch to move. Switching to move is often better UX for placement adjustment.
      setSelectedTool('move'); 
    } else if (selectedTool === 'rectangle' || selectedTool === 'highlighter') {
      const isHighlight = selectedTool === 'highlighter';
      const newEdit: PDFEditObject = {
        id: newId, type: 'rectangle', x, y, width: 100, height: 30,
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

  // Handler for elements (Text, Rect, Image) to enable dragging
  const handleElementMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent triggering canvas click
    if (selectedTool === 'move') {
      setSelectedId(id);
      setIsDragging(true);
      
      const { x, y } = getPdfCoordinates(e);
      setDragStart({ x, y });
      
      const edit = edits[pageNum - 1]?.find(ed => ed.id === id);
      if (edit) {
        setInitialPos({ x: edit.x, y: edit.y });
      }
    } else {
        // If clicking an element with another tool, switch to move and select
        setSelectedTool('move');
        setSelectedId(id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getPdfCoordinates(e);

    // Handle Dragging Elements
    if (isDragging && selectedId && selectedTool === 'move') {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      
      // Update local state without adding to history constantly
      const pageEdits = [...(edits[pageNum - 1] || [])];
      const editIndex = pageEdits.findIndex(ed => ed.id === selectedId);
      if (editIndex !== -1) {
        pageEdits[editIndex] = {
           ...pageEdits[editIndex],
           x: initialPos.x + dx,
           y: initialPos.y + dy
        };
        setEdits({ ...edits, [pageNum - 1]: pageEdits });
      }
      return;
    }

    // Handle Drawing
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
    if (isDragging) {
      setIsDragging(false);
      // Commit final position to history
      addToHistory(edits);
    }
    if (isDrawing) {
      setIsDrawing(false);
      addToHistory(edits);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const newId = Date.now().toString();
      const currentEdits = [...(edits[pageNum - 1] || [])];
      
      // Center in viewport
      const centerX = (viewportDim.width / scale) / 2 - 50;
      const centerY = (viewportDim.height / scale) / 2 - 50;

      const newEdit: PDFEditObject = {
        id: newId, type: 'image', x: centerX, y: centerY, width: 150, height: 150,
        imageData: base64
      };
      addToHistory({ ...edits, [pageNum - 1]: [...currentEdits, newEdit] });
      setSelectedId(newId);
      setSelectedTool('move');
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateEdit = (id: string, updates: Partial<PDFEditObject>) => {
    const pageEdits = [...(edits[pageNum - 1] || [])];
    const newPageEdits = pageEdits.map(e => e.id === id ? { ...e, ...updates } : e);
    addToHistory({ ...edits, [pageNum - 1]: newPageEdits });
  };

  const deleteEdit = () => {
    if (!selectedId) return;
    const pageEdits = edits[pageNum - 1] || [];
    addToHistory({ ...edits, [pageNum - 1]: pageEdits.filter(e => e.id !== selectedId) });
    setSelectedId(null);
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
      console.error(e);
      alert("Failed to save PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Render Helpers ---
  const renderPath = (edit: PDFEditObject) => {
    if (!edit.path || edit.path.length < 2) return null;
    const pathString = `M ${edit.path.map(p => `${p.x * scale} ${p.y * scale}`).join(' L ')}`;
    return (
       <path 
         d={pathString} 
         stroke={edit.color} 
         strokeWidth={(edit.lineWidth || 2) * scale} 
         fill="none" 
         strokeLinecap="round" 
         strokeLinejoin="round"
       />
    );
  };

  return (
    <div className="flex flex-col h-[850px] bg-slate-100 rounded-[2rem] overflow-hidden border border-slate-200 shadow-2xl relative">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

      {/* Toolbar */}
      <div className="h-20 bg-white border-b flex items-center justify-between px-6 z-20 shadow-sm gap-4">
        {/* Navigation & Basic Tools */}
        <div className="flex items-center gap-2">
           <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 mr-2" title="Back"><ChevronLeft size={20}/></button>
           
           <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
             <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 hover:bg-white rounded-lg disabled:opacity-30 transition-all text-slate-700" title="Undo"><Undo size={18}/></button>
             <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-white rounded-lg disabled:opacity-30 transition-all text-slate-700" title="Redo"><Redo size={18}/></button>
           </div>
           
           <div className="w-px h-8 bg-slate-200 mx-2"/>

           <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
             <button 
               onClick={() => setSelectedTool('move')} 
               className={`p-2 rounded-lg transition-all ${selectedTool === 'move' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
               title="Select / Move"
             >
               <MousePointer2 size={18} />
             </button>
             <button 
               onClick={() => setSelectedTool('draw')} 
               className={`p-2 rounded-lg transition-all ${selectedTool === 'draw' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
               title="Freehand Draw"
             >
               <PenTool size={18} />
             </button>
             <button 
               onClick={() => setSelectedTool('text')} 
               className={`p-2 rounded-lg transition-all ${selectedTool === 'text' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
               title="Text"
             >
               <Type size={18} />
             </button>
             <button 
               onClick={() => setSelectedTool('highlighter')} 
               className={`p-2 rounded-lg transition-all ${selectedTool === 'highlighter' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
               title="Highlighter"
             >
               <Highlighter size={18} />
             </button>
             <button 
               onClick={() => setSelectedTool('rectangle')} 
               className={`p-2 rounded-lg transition-all ${selectedTool === 'rectangle' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
               title="Rectangle"
             >
               <Square size={18} />
             </button>
             <button 
               onClick={() => fileInputRef.current?.click()} 
               className="p-2 rounded-lg transition-all text-slate-600 hover:text-slate-900 hover:bg-white"
               title="Insert Image"
             >
               <ImageIcon size={18} />
             </button>
           </div>
        </div>

        {/* Dynamic Properties */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 shadow-inner">
             <div className="flex items-center gap-2 relative group cursor-pointer" title="Color">
                <div className="w-6 h-6 rounded-full border border-slate-300 shadow-sm ring-2 ring-white" style={{ backgroundColor: selectedTool === 'rectangle' ? currentBgColor : currentColor }}></div>
                <input 
                  type="color" 
                  value={selectedTool === 'rectangle' ? currentBgColor : currentColor} 
                  onChange={e => {
                    const val = e.target.value;
                    if (selectedTool === 'rectangle') {
                        setCurrentBgColor(val);
                        if (selectedId) updateEdit(selectedId, { backgroundColor: val });
                    } else {
                        setCurrentColor(val);
                        if (selectedId) updateEdit(selectedId, { color: val });
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
             </div>

             {/* Text Properties */}
             {(selectedTool === 'text' || (selectedId && edits[pageNum-1]?.find(e=>e.id===selectedId)?.type === 'text')) && (
               <>
                 <div className="w-px h-5 bg-slate-300"></div>
                 <div className="flex items-center gap-1">
                   <button onClick={() => {
                      const s = Math.max(8, currentFontSize - 2);
                      setCurrentFontSize(s);
                      if (selectedId) updateEdit(selectedId, { fontSize: s });
                   }} className="p-1 hover:bg-slate-200 rounded text-slate-600"><Minus size={14}/></button>
                   <span className="text-xs font-bold w-6 text-center text-slate-700">{currentFontSize}</span>
                   <button onClick={() => {
                      const s = Math.min(72, currentFontSize + 2);
                      setCurrentFontSize(s);
                      if (selectedId) updateEdit(selectedId, { fontSize: s });
                   }} className="p-1 hover:bg-slate-200 rounded text-slate-600"><Plus size={14}/></button>
                 </div>
                 <select 
                   value={currentFont}
                   onChange={(e) => {
                     const f = e.target.value as any;
                     setCurrentFont(f);
                     if (selectedId) updateEdit(selectedId, { fontFamily: f });
                   }}
                   className="text-xs border-none bg-transparent font-bold text-slate-700 focus:ring-0 cursor-pointer p-0"
                 >
                   <option value="Helvetica">Helvetica</option>
                   <option value="Times-Roman">Times</option>
                   <option value="Courier">Courier</option>
                 </select>
               </>
             )}

             {/* Drawing Properties */}
             {(selectedTool === 'draw' || (selectedId && edits[pageNum-1]?.find(e=>e.id===selectedId)?.type === 'drawing')) && (
               <>
                  <div className="w-px h-5 bg-slate-300"></div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Thickness</span>
                    <input 
                      type="range" min="1" max="10" step="1" 
                      value={lineWidth}
                      onChange={(e) => {
                        const w = parseInt(e.target.value);
                        setLineWidth(w);
                        if (selectedId) updateEdit(selectedId, { lineWidth: w });
                      }}
                      className="w-20 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
               </>
             )}

             {selectedId && (
               <>
                  <div className="w-px h-5 bg-slate-300"></div>
                  <button onClick={deleteEdit} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-1" title="Delete">
                    <Trash2 size={16} /> <span className="text-xs font-bold">Remove</span>
                  </button>
               </>
             )}
          </div>
        </div>

        {/* Save & Zoom */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-1.5 hover:bg-white rounded-md text-slate-600"><Minus size={14} /></button>
            <span className="text-xs font-bold w-12 text-center text-slate-700">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="p-1.5 hover:bg-white rounded-md text-slate-600"><Plus size={14} /></button>
          </div>
          <button 
            onClick={handleSave} 
            disabled={isProcessing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100"
          >
             {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Save size={16} />}
             <span>Save PDF</span>
          </button>
        </div>
      </div>

      {/* Editor Scroll Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-slate-200/50 relative custom-scrollbar"
      >
         {loading ? (
           <div className="h-full flex flex-col items-center justify-center text-slate-400">
             <Loader2 size={40} className="animate-spin mb-4 text-indigo-500" />
             <p className="font-medium">Loading Document...</p>
           </div>
         ) : (
           /* Centering Wrapper: Ensures min-content size is honored for scrolling */
           <div className="min-w-full min-h-full flex items-start justify-center p-12">
             <div 
               ref={contentRef}
               className="relative shadow-2xl transition-all duration-200 ease-out bg-white" 
               style={{ width: viewportDim.width, height: viewportDim.height }}
               onMouseDown={handleMouseDown}
               onMouseMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onMouseLeave={handleMouseUp}
             >
                <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
                
                {/* SVG Layer for Drawings */}
                <svg className="absolute inset-0 pointer-events-none" style={{ width: viewportDim.width, height: viewportDim.height }}>
                   {(edits[pageNum - 1] || []).filter(e => e.type === 'drawing').map(edit => (
                      <g 
                        key={edit.id} 
                        onClick={(e) => handleElementMouseDown(e, edit.id)} 
                        className="pointer-events-auto cursor-pointer"
                      >
                        {renderPath(edit)}
                        {selectedId === edit.id && (
                          <path d={`M ${edit.path!.map(p => `${p.x * scale} ${p.y * scale}`).join(' L ')}`} stroke="#6366f1" strokeWidth="1" strokeDasharray="4 2" fill="none" />
                        )}
                      </g>
                   ))}
                </svg>

                {/* DOM Layer for Elements */}
                {(edits[pageNum - 1] || []).filter(e => e.type !== 'drawing').map(edit => (
                   <div
                     key={edit.id}
                     onMouseDown={(e) => handleElementMouseDown(e, edit.id)}
                     className={`absolute group ${selectedTool === 'move' ? 'cursor-move' : ''}`}
                     style={{
                       left: edit.x * scale,
                       top: edit.y * scale,
                       width: edit.width ? edit.width * scale : 'auto',
                       height: edit.height ? edit.height * scale : 'auto',
                       border: selectedId === edit.id ? '2px dashed #6366f1' : '1px dashed transparent',
                       zIndex: selectedId === edit.id ? 10 : 1,
                       // Enable pointer events so we can click/drag them
                       pointerEvents: 'auto' 
                     }}
                   >
                     {edit.type === 'text' && (
                        <input 
                          type="text" 
                          value={edit.text} 
                          onChange={(e) => updateEdit(edit.id, { text: e.target.value })}
                          className="bg-transparent border-none outline-none w-full h-full p-1 m-0"
                          style={{ 
                            color: edit.color, 
                            fontSize: (edit.fontSize || 16) * scale, 
                            fontFamily: edit.fontFamily,
                            width: `${(edit.text?.length || 1) + 2}ch`,
                            minWidth: '50px',
                            cursor: selectedTool === 'move' ? 'move' : 'text'
                          }}
                          autoFocus={selectedId === edit.id} // Focus when created/selected
                        />
                     )}
                     {edit.type === 'rectangle' && (
                        <div style={{
                          width: '100%', height: '100%',
                          backgroundColor: edit.backgroundColor, opacity: edit.opacity,
                          borderRadius: edit.opacity && edit.opacity < 1 ? '4px' : '0'
                        }} />
                     )}
                     {edit.type === 'image' && edit.imageData && (
                        <img src={edit.imageData} className="w-full h-full object-contain pointer-events-none" alt="" />
                     )}
                     
                     {/* Selection Handles (Visual only for now) */}
                     {selectedId === edit.id && selectedTool === 'move' && (
                       <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-indigo-600 rounded-full cursor-nwse-resize border-2 border-white shadow-sm" />
                     )}
                   </div>
                ))}
             </div>
           </div>
         )}
      </div>

      {/* Footer Navigation */}
      <div className="h-16 bg-white border-t flex items-center justify-center gap-6 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)] z-20">
         <button 
           disabled={pageNum <= 1} 
           onClick={() => setPageNum(p => p - 1)}
           className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-700"
         >
           <ChevronLeft size={24} />
         </button>
         <div className="flex flex-col items-center">
            <span className="font-black text-slate-800 text-sm">Page {pageNum}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">of {pdf?.numPages || '--'}</span>
         </div>
         <button 
           disabled={pageNum >= (pdf?.numPages || 1)} 
           onClick={() => setPageNum(p => p + 1)}
           className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-700"
         >
           <ChevronRight size={24} />
         </button>
      </div>
    </div>
  );
};
