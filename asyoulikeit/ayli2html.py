from docx import Document
from lxml import etree, html
import re
import html as html_escape_module

def load_docx_with_comments(path):
    # Load DOCX document
    doc = Document(path)

    # Find comments relationship
    comments_rel = None
    for rel_id, rel in doc.part._rels.items():
        if 'comments.xml' in rel.target_ref:
            comments_rel = rel
            break
    
    if not comments_rel:
        print("No comments found in document")
        return doc, {}

    # Parse XML structure to extract comments
    comments_part = doc.part.related_parts[comments_rel.rId]
    comments_tree = etree.XML(comments_part.blob)

    # Map from comment ID to text
    comments = {}
    for comment in comments_tree.findall(".//w:comment", namespaces=comments_tree.nsmap):
        comment_id = comment.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
        comment_text = ''.join(comment.itertext()).strip()
        comments[comment_id] = comment_text

    return doc, comments

def extract_runs_with_comments(paragraph, comments):
    # Convert each run into HTML, insert comment where applicable
    html_parts = []
    for run in paragraph.runs:
        run_xml = run._element
        comment_range_start = run_xml.find('.//w:commentRangeStart', namespaces=run_xml.nsmap)
        comment_reference = run_xml.find('.//w:commentReference', namespaces=run_xml.nsmap)
        text = run.text or ""

        if comment_range_start is not None:
            comment_id = comment_range_start.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
            comment_html = f'<span class="commented">{html_escape_module.escape(text)}<span class="comment">[{comments.get(comment_id, "??")}]</span></span>'
            html_parts.append(comment_html)
        # Here's where the sound comments get added
        elif comment_reference is not None:
            comment_id = comment_reference.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
            comment_text = comments.get(comment_id, "??")
            filename = None
            
            if "crowd cheer" in comment_text.lower():
                filename = "./effects/crowd-cheer-canon.mp3"
            elif "crowd boo" in comment_text.lower():
                filename = "./effects/crowd-boo-canon.mp3"
            elif "aww" in comment_text.lower():
                filename = "./effects/crowd-aww.mp3"
            elif "circus" in comment_text.lower():
                filename = "./effects/circus-canon.mp3"
            elif "oof" in comment_text.lower():
                filename = "./effects/gasp_SJHmiqB.mp3"
                html_parts.append(f'<button class="sound_button" data-sound="{filename}" onclick="toggleSound(this)">[gasp]</button>')
                filename = "./effects/gottahurt.mp3"
            elif "kill" in comment_text.lower():
                filename = "./effects/they'r tryin' to kill u!!.mp3"
            elif "bell" in comment_text.lower():
                filename = "./effects/wwe-bell.mp3"
            elif "evil" in comment_text.lower():
                filename = "./effects/joker-laughing.mp3"
            elif "picnic" in comment_text.lower():
                filename = "./effects/morningmood.mp3"
            elif "voiceover of someone" in comment_text.lower():
                filename = "./effects/sohadyouneed.mp3"
            elif "casablanca" in comment_text.lower():
                filename = "./effects/Casablanca - As Time Goes By.mp3"
            elif "snake" in comment_text.lower():
                filename = "./effects/rattlesnake_sound.mp3"
                html_parts.append(f'<button class="sound_button" data-sound="{filename}" onclick="toggleSound(this)">rattlesnake</button>')
                filename = "./effects/im-a-snake-mp3cut.mp3"
            elif "lion" in comment_text.lower():
                filename = "./effects/lion-roar-sound-effect.mp3"
            elif "sexy" in comment_text.lower():
                filename = "./effects/You Sexy Thing.mp3"
            elif "wedding" in comment_text.lower():
                filename = "./effects/Mendelssohn-wedding-march.mp3"
            elif "conch" in comment_text.lower():
                filename = "./effects/conch-middle-00-94462.mp3"
            elif "narrator" in comment_text.lower():
                filename = "./effects/AntonioVivaldi_Spring.mp3"
            elif "horn" in comment_text.lower():
                filename = "./effects/fanfare-1-276819.mp3"
            elif "cough" in comment_text.lower():
                filename = "./effects/man-death-scream-186763.mp3"
            elif "sword out" in comment_text.lower():
                filename = "./effects/sword-sound-260274.mp3"
            elif "sheath" in comment_text.lower():
                filename = "./effects/sword-re-sheathed-99334.mp3"
            elif "bach" in comment_text.lower():
                filename = "./effects/Orchestral Suite No. 3 in D major, BWV 1068 - II. Air.mp3"
            elif "fear" in comment_text.lower():
                filename = "./effects/dontfearthereaper.mp3"
            elif "bald" in comment_text.lower():
                filename = "./effects/nightonbaldmountain.mp3"


            if filename:
                html_parts.append(f'<button class="sound_button" data-sound="{filename}" onclick="toggleSound(this)">[{comment_text}]</button>')
            else:
                html_parts.append(f'<span class="sound_button">[{comment_text}]</span>')
        else:
            html_parts.append(html_escape_module.escape(text))
    return ''.join(html_parts)

def get_character_color(name, color_map):
    # Use a fixed palette or randomize
    palette = [
        "#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
        "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe"
    ]
    if name not in color_map:
        color_map[name] = palette[len(color_map) % len(palette)]
    return color_map[name]


def generate_html(doc, comments):
    html_output = ['''<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>As You Like It - Annotated</title>
    <link rel="stylesheet" href="style.css" />
    <script src="soundbutton.js"></script>
</head>
<body>
    <div class="document-container">''']

    header_open = False
    content_open = False

    for para in doc.paragraphs:
        style = para.style.name 
        para_text = para.text.strip()

        if not para_text:
            continue

        if style == 'Title' or style == 'Heading 1':
            # Close any open content section
            if content_open:
                html_output.append('</div>')
                content_open = False
            
            # Open header section if not already open
            if not header_open:
                html_output.append('<div class="header">')
                header_open = True
            
            html_output.append(f'<h1>{html_escape_module.escape(para_text)}</h1>')

        elif style == 'Heading 2':
            # Close header section if open
            if header_open:
                html_output.append('</div>')
                header_open = False
            
            # Close any existing content section and open a new one
            if content_open:
                html_output.append('</div>')
            
            html_output.append('<div class="content">')
            content_open = True
            html_output.append(f'<h2>{html_escape_module.escape(para_text)}</h2>')

        else:
            # Regular content - ensure we're in a content section
            if header_open:
                html_output.append('</div>')
                header_open = False
            
            if not content_open:
                html_output.append('<div class="content">')
                content_open = True
            
            line = extract_runs_with_comments(para, comments)
            if line.strip():
                html_output.append(f'<div class="paragraph">{line}</div>')

    # Close any remaining open sections
    if header_open:
        html_output.append('</div>')
    if content_open:
        html_output.append('</div>')

    html_output.extend(['</div>', '<script src="bars.js"></script></body></html>'])
    return '\n'.join(html_output)

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python shakespeare_to_html.py input.docx output.html")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    doc, comments = load_docx_with_comments(input_path)
    html_data = generate_html(doc, comments)
    html_data = html_data.replace("ROSALIND,", "ROSALIND")
    html_data = html_data.replace("PHOEBE,", "PHOEBE")
    html_data = html_data.replace("CELIA,", "CELIA")

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_data)

    print(f"HTML file saved to {output_path}")