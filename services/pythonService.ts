
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
  
  // Robust Python Script to Generate DOCX
  const script = `
import json
import io
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

def create_docx(json_str):
    try:
        data = json.loads(json_str)
        doc = Document()
        
        # Default styling
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Calibri'
        font.size = Pt(11)
        
        # Set narrow margins for better PDF replication
        for section in doc.sections:
            section.top_margin = Inches(0.5)
            section.bottom_margin = Inches(0.5)
            section.left_margin = Inches(0.75)
            section.right_margin = Inches(0.75)

        if not data:
            doc.add_paragraph("Error: No content extracted from PDF.")

        for page in data:
            blocks = page.get('blocks', [])
            if not blocks:
                # Add a blank page if extraction failed for a specific page
                doc.add_page_break()
                continue
                
            for block in blocks:
                # Create paragraph
                p = doc.add_paragraph()
                p_format = p.paragraph_format
                p_format.space_after = Pt(6) 
                
                for span in block.get('spans', []):
                    text_content = span.get('text', '')
                    if not text_content: continue
                    
                    run = p.add_run(text_content)
                    run_font = run.font
                    
                    # Size (default to 11 if missing)
                    size = span.get('fontSize', 11)
                    if size > 0:
                        run_font.size = Pt(size)
                    
                    # Bold
                    if span.get('isBold'):
                        run_font.bold = True
                        
            # Add page break to match PDF pagination
            doc.add_page_break()

        # Save to memory
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
      // If it returned a string, it's an error message
      throw new Error("Python Generation Failed: " + proxy);
  }
  
  // Convert Python bytes to JS Uint8Array
  const result = proxy.toJs();
  proxy.destroy();
  
  return result;
};
