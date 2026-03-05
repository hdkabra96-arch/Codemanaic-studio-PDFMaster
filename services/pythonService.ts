
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
  
  // High-Fidelity Python Script using Tab Stops for Layout Preservation
  const script = `
import json
import io
import base64
import re
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_BREAK
from docx.oxml.shared import OxmlElement, qn

def add_hyperlink(paragraph, url, text, color=RGBColor(0, 0, 255), underline=True):
    part = paragraph.part
    r_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('r:id'), r_id)
    new_run = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')
    if color:
        c = OxmlElement('w:color')
        c.set(qn('w:val'), str(color))
        rPr.append(c)
    if underline:
        u = OxmlElement('w:u')
        u.set(qn('w:val'), 'single')
        rPr.append(u)
    new_run.append(rPr)
    new_run.text = text
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)
    return hyperlink

def clean_font_name(font_name):
    if not font_name: return 'Calibri'
    name = font_name.lower()
    if 'times' in name: return 'Times New Roman'
    if 'arial' in name: return 'Arial'
    if 'courier' in name: return 'Courier New'
    if 'calibri' in name: return 'Calibri'
    if 'helvetica' in name: return 'Arial'
    if 'verdana' in name: return 'Verdana'
    if 'tahoma' in name: return 'Tahoma'
    if 'comic' in name: return 'Comic Sans MS'
    if 'trebuchet' in name: return 'Trebuchet MS'
    if 'georgia' in name: return 'Georgia'
    return 'Calibri'

def create_docx(json_str):
    try:
        data = json.loads(json_str)
        doc = Document()
        
        # Set narrow margins (0.5 inch) to maximize space
        section = doc.sections[0]
        section.top_margin = Inches(0.5)
        section.bottom_margin = Inches(0.5)
        section.left_margin = Inches(0.5)
        section.right_margin = Inches(0.5)
        
        # Set Page Size from first page data if available
        if data and len(data) > 0:
            first_page = data[0]
            if 'width' in first_page and 'height' in first_page:
                # PDF dimensions are in points (72 dpi)
                # python-docx Pt() takes points
                section.page_width = Pt(first_page['width'])
                section.page_height = Pt(first_page['height'])
        
        page_width = section.page_width.inches - section.left_margin.inches - section.right_margin.inches
        # Approx width in points (72 pts/inch)
        page_width_pts = page_width * 72

        if not data:
            doc.add_paragraph("Error: No content extracted.")

        for page_idx, page in enumerate(data):
            # Combine all items (blocks -> lines -> spans) and images into a single sorted list
            items = []
            
            # 1. Process Text Blocks
            blocks = page.get('blocks', [])
            for block in blocks:
                lines = block.get('lines', [])
                for line in lines:
                    # Flatten line to a single item with y-coordinate
                    # We use the y of the first span as the line's y
                    if not line['spans']: continue
                    
                    # Calculate average Y for the line to be robust
                    avg_y = sum(s['y'] for s in line['spans']) / len(line['spans'])
                    
                    # Calculate max font size in line for line height estimation
                    max_size = max((s.get('size', 11) for s in line['spans']), default=11)
                    
                    items.append({
                        'type': 'line',
                        'y': avg_y,
                        'spans': line['spans'],
                        'block_type': block.get('type', 'paragraph'),
                        'max_size': max_size
                    })

            # 2. Process Images
            images = page.get('images', [])
            for img in images:
                items.append({
                    'type': 'image',
                    'y': img.get('y', 0),
                    'data': img.get('data'),
                    'width': img.get('width'),
                    'height': img.get('height')
                })

            # 3. Sort by Y (Top to Bottom)
            items.sort(key=lambda x: x['y'])

            last_y = 0
            
            for item in items:
                # Calculate spacing from previous item
                space_before = 0
                if last_y > 0:
                    diff = item['y'] - last_y
                    
                    # Estimate line height of PREVIOUS item to see if we need extra space
                    # But we only have current item info easily.
                    # Let's assume standard line height is approx 1.2 * font_size
                    
                    current_line_height = 12 # Default
                    if item.get('type') == 'line':
                        current_line_height = item.get('max_size', 11) * 1.2
                    
                    # If diff is significantly larger than line height, add space
                    if diff > current_line_height + 2:
                        space_before = diff - current_line_height
                
                if item['type'] == 'image':
                    try:
                        img_data = base64.b64decode(item['data'])
                        img_stream = io.BytesIO(img_data)
                        
                        width_pt = item.get('width', 100)
                        width_in = width_pt / 72.0
                        
                        # Constrain to page width
                        if width_in > page_width: width_in = page_width
                        
                        # Add paragraph for image
                        p = doc.add_paragraph()
                        p.paragraph_format.space_before = Pt(max(0, space_before))
                        p.paragraph_format.space_after = Pt(0)
                        run = p.add_run()
                        run.add_picture(img_stream, width=Inches(width_in))
                        
                        # Center images by default
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        
                        last_y = item['y'] + (item.get('height', 0) if item.get('height') else 100)
                    except Exception as e:
                        pass

                elif item['type'] == 'line':
                    spans = item['spans']
                    if not spans: continue
                    
                    # Sort spans by X
                    spans.sort(key=lambda s: s['x'])
                    
                    p = doc.add_paragraph()
                    pf = p.paragraph_format
                    
                    # Set space before
                    # Cap it at 50pt to avoid massive gaps from parsing errors
                    pf.space_before = Pt(min(50, max(0, space_before)))
                    pf.space_after = Pt(0) 
                    
                    # Handle Indentation (Left Margin)
                    first_span = spans[0]
                    start_x = first_span['x']
                    
                    line_width = spans[-1]['x'] + spans[-1]['width'] - start_x
                    center_x = start_x + line_width / 2
                    page_center = page_width_pts / 2
                    
                    # Heuristic for centering:
                    # If the center of the text line is close to the center of the page
                    is_centered = abs(center_x - page_center) < 20
                    
                    if is_centered:
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    else:
                        pf.left_indent = Pt(max(0, start_x))
                    
                    # Reconstruct line using Tabs
                    current_x = start_x
                    
                    for i, span in enumerate(spans):
                        text = span['text']
                        span_x = span['x']
                        
                        # If this span is far to the right of the current cursor, add a Tab
                        # Threshold: 5pt
                        if span_x > current_x + 5:
                            p.add_run('\t')
                            pf.tab_stops.add_tab_stop(Pt(span_x), WD_TAB_ALIGNMENT.LEFT)
                            current_x = span_x
                        
                        # Add Run
                        link_url = span.get('link')
                        if link_url:
                            add_hyperlink(p, link_url, text)
                        else:
                            run = p.add_run(text)
                            font = run.font
                            
                            # Font Styling
                            font.name = clean_font_name(span.get('fontName'))
                            size = span.get('size', 11)
                            if size: font.size = Pt(size)
                            if span.get('isBold'): font.bold = True
                            if span.get('isItalic'): font.italic = True
                        
                        # Update cursor
                        # Estimate width of text
                        span_width = span.get('width', len(text) * size * 0.5)
                        current_x += span_width
                    
                    last_y = item['y']

            # Page Break between pages
            if page_idx < len(data) - 1:
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
