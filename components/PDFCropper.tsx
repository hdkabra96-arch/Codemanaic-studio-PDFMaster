
import React, { useState, useEffect, useRef } from 'react';
import { UploadedFile } from '../types';
import { cropPDF } from '../services/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ChevronLeft, ChevronRight, Save, Loader2, Crop, MousePointer2, RefreshCw
} from 'lucide-react';

const pdfjs = (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

interface PDFCropperProps {
  file: UploadedFile;
  onClose: () => void;
}

export const PDFCropper: React.FC<PDFCropperProps> = ({ file, onClose }) => {
  const [pdf, setPdf] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [cropRect, setCropRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); 
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [viewportDim, setViewportDim] = useState({ width: 0, height: 0 });
  const [originalDim, setOriginalDim] = useState({ width: 0, height: 0 });

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
        const originalViewport = page.getViewport({ scale: 1.0 });
        
        setViewportDim({ width: viewport.width, height: viewport.height });
        setOriginalDim({ width: originalViewport.width, height: originalViewport.height });

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

  const getPdfCoordinates = (e: React.MouseEvent) => {
    if (!contentRef.current) return { x: 0, y: 0 };
    const rect = contentRef.current.getBoundingClientRect();
    return { 
      x: (e.clientX - rect.left) / scale, 
      y: (e.clientY - rect.top) / scale 
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getPdfCoordinates(e);
    setIsDragging(true);
    setDragStart({ x, y });
    setCropRect({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return;
    const { x, y } = getPdfCoordinates(e);
    
    const width = Math.abs(x - dragStart.x);
    const height = Math.abs(y - dragStart.y);
    const newX = Math.min(x, dragStart.x);
    const newY = Math.min(y, dragStart.y);

    setCropRect({ x: newX, y: newY, width, height });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleSave = async () => {
    if (!cropRect) return;
    setIsProcessing(true);
    try {
      // Pass the crop rect (which is in PDF coordinates already because we divide by scale)
      const blob = await cropPDF(file.file, cropRect);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cropped_${file.file.name}`;
      a.click();
    } catch (e) {
      alert("Error cropping PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetCrop = () => {
    setCropRect(null);
  };

  return (
    <div className="flex flex-col h-[850px] bg-slate-100 rounded-[2rem] overflow-hidden border border-slate-200 shadow-2xl relative">
      <div className="h-20 bg-white border-b flex items-center justify-between px-6 z-20 shadow-sm gap-4">
        <div className="flex items-center gap-2">
           <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 mr-2"><ChevronLeft size={20}/></button>
           <h3 className="font-bold text-slate-800">Crop PDF</h3>
        </div>

        <div className="flex items-center gap-4">
           {cropRect && (
             <div className="flex items-center gap-2 text-xs font-mono bg-slate-100 px-3 py-1 rounded-lg">
               <span>X: {Math.round(cropRect.x)}</span>
               <span>Y: {Math.round(cropRect.y)}</span>
               <span>W: {Math.round(cropRect.width)}</span>
               <span>H: {Math.round(cropRect.height)}</span>
             </div>
           )}
           <button onClick={handleResetCrop} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500" title="Reset Crop">
             <RefreshCw size={18} />
           </button>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={isProcessing || !cropRect} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
             {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Crop size={16} />}
             <span>Crop & Download</span>
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-200/50 custom-scrollbar relative">
         {loading ? (
           <div className="h-full flex items-center justify-center"><Loader2 size={40} className="animate-spin text-teal-500" /></div>
         ) : (
           <div className="min-w-full min-h-full flex items-start justify-center p-20">
             <div 
               ref={contentRef}
               className="relative shadow-2xl bg-white flex-shrink-0 cursor-crosshair select-none" 
               style={{ width: viewportDim.width, height: viewportDim.height }}
               onMouseDown={handleMouseDown}
               onMouseMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onMouseLeave={handleMouseUp}
             >
                <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
                
                {/* Crop Overlay */}
                {cropRect && (
                  <div className="absolute border-2 border-teal-500 pointer-events-none" style={{
                    left: cropRect.x * scale,
                    top: cropRect.y * scale,
                    width: cropRect.width * scale,
                    height: cropRect.height * scale,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
                  }}>
                    {/* Handles (visual only for now) */}
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-teal-500 rounded-full"></div>
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-teal-500 rounded-full"></div>
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-teal-500 rounded-full"></div>
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-teal-500 rounded-full"></div>
                  </div>
                )}
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
