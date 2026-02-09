
let pyodide: any = null;

export const initPyodide = async () => {
  if (pyodide) return pyodide;

  // @ts-ignore
  if (!window.loadPyodide) {
    throw new Error("Python engine is initializing... Please wait a few seconds and try again.");
  }

  console.log("Initializing Python Environment...");
  
  // @ts-ignore
  pyodide = await window.loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/"
  });

  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  
  // Install dependencies
  await pyodide.loadPackage("lxml"); 
  
  try {
      console.log("Installing python-docx...");
      await micropip.install("python-docx");
      console.log("Python environment ready.");
  } catch (e) {
      console.error("Failed to install python-docx", e);
      throw new Error("Failed to load Python Word libraries. Please check your internet connection.");
  }
  
  return pyodide;
};

export const createDocxWithPython = async (data: any): Promise<Uint8Array> => {
  const py = await initPyodide();
  
  // Robust Python Script to Generate DOCX with formatting
  const script = `
import json
import io
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT

def create_docx(json_str):
    try:
        data = json.loads(json_str)
        doc = Document()
        
        # Default styling
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Calibri'
        font.size = Pt(11)
        
        # Set narrow margins
        for section in doc.sections:
            section.top_margin = Inches(0.5)
            section.bottom_margin = Inches(0.5)
            section.left_margin = Inches(0.5)
            section.right_margin = Inches(0.5)

        if not data:
            doc.add_paragraph("Error: No content extracted.")

        for page in data:
            lines = page.get('lines', [])
            
            # Use 'Normal' style paragraphs but override properties
            for line in lines:
                spans = line.get('spans', [])
                if not spans: continue
                
                # Create paragraph for the line
                p = doc.add_paragraph()
                pf = p.paragraph_format
                
                # 1. Base Indentation (Left align the whole line to first element)
                start_x = max(0, spans[0].get('x', 0))
                pf.left_indent = Pt(start_x)
                
                # Minimal vertical spacing to mimic layout
                pf.space_before = Pt(0)
                pf.space_after = Pt(0)
                
                current_cursor_x = start_x
                
                for i, span in enumerate(spans):
                    text = span.get('text', '')
                    span_x = span.get('x', 0)
                    span_width = span.get('width', 0)
                    
                    # If this is not the first item, check if we need a Tab
                    # We add a tab if there is a gap > 5 pts
                    if i > 0:
                        # Use width-based cursor tracking if available
                        threshold = 5 
                        
                        if span_x > current_cursor_x + threshold: 
                            p.add_run('\t')
                            # Tab stops are relative to the margin in Word, not the indent.
                            # So we set the tab stop at the absolute X position of the span.
                            pf.tab_stops.add_tab_stop(Pt(span_x), WD_TAB_ALIGNMENT.LEFT)
                            current_cursor_x = span_x

                    run = p.add_run(text)
                    r_font = run.font
                    
                    # Formatting
                    size = span.get('size', 11)
                    if size > 0: r_font.size = Pt(size)
                    if span.get('isBold'): r_font.bold = True
                    
                    # Update approximate cursor X
                    if span_width > 0:
                        current_cursor_x += span_width
                    else:
                        # Fallback calculation if width is missing
                        char_width_est = size * 0.5 
                        current_cursor_x += len(text) * char_width_est

            # Page break after processing all lines of a page
            doc.add_page_break()

        file_stream = io.BytesIO()
        doc.save(file_stream)
        file_stream.seek(0)
        return file_stream.read()
    except Exception as e:
        return f"PYTHON ERROR: {str(e)}"
  `;

  // Run the script definition
  await py.runPythonAsync(script);

  // Call the Python function with JSON data
  const jsonStr = JSON.stringify(data);
  const proxy = await py.globals.get('create_docx')(jsonStr);
  
  if (typeof proxy === 'string') {
      throw new Error("Python Generation Failed: " + proxy);
  }
  
  const result = proxy.toJs();
  proxy.destroy();
  
  return result;
};
