from docx import Document
from lxml import etree
import sys

def debug_docx_structure(path):
    print(f"Debugging DOCX file: {path}")
    print("=" * 50)
    
    # Load the document
    doc = Document(path)
    
    # 1. Check available relationships
    print("Available relationships:")
    for rel_id, rel in doc.part._rels.items():
        print(f"  {rel_id}: {rel.target_ref} ({rel.reltype})")
    print()
    
    # 2. Check if there are any comment-like relationships
    comment_relations = [rel_id for rel_id in doc.part._rels.keys() if 'comment' in rel_id.lower()]
    print(f"Comment-related relationships: {comment_relations}")
    print()
    
    # 3. Look for other annotation types
    annotation_relations = []
    for rel_id, rel in doc.part._rels.items():
        if any(keyword in rel.reltype.lower() for keyword in ['comment', 'annotation', 'revision', 'track']):
            annotation_relations.append((rel_id, rel.reltype, rel.target_ref))
    
    print("Annotation-related relationships:")
    for rel_id, rel_type, target in annotation_relations:
        print(f"  {rel_id}: {target} ({rel_type})")
    print()
    
    # 4. Check the main document XML for annotation elements
    print("Checking main document XML for annotation elements...")
    try:
        doc_xml = doc.part.blob
        if isinstance(doc_xml, bytes):
            root = etree.XML(doc_xml)
        else:
            root = etree.XML(doc_xml.encode('utf-8'))
    except Exception as e:
        print(f"Error parsing main document XML: {e}")
        return doc
    
    # Look for various annotation elements
    annotation_elements = [
        'commentRangeStart', 'commentRangeEnd', 'commentReference',
        'ins', 'del', 'moveFrom', 'moveTo',  # track changes
        'annotation', 'annotationRef'  # general annotations
    ]
    
    found_elements = {}
    for element_name in annotation_elements:
        elements = root.findall(f".//w:{element_name}", namespaces=root.nsmap)
        if elements:
            found_elements[element_name] = len(elements)
    
    if found_elements:
        print("Found annotation elements in document:")
        for element, count in found_elements.items():
            print(f"  w:{element}: {count} occurrences")
    else:
        print("No standard annotation elements found in main document.")
    print()
    
    # 5. Check if there are any parts we haven't explored
    print("All package parts:")
    for part in doc.part.package.parts:
        print(f"  {part}")
    print()
    
    # 6. Let's also check for tracked changes or revisions
    print("Checking for tracked changes...")
    tracked_changes = root.findall(".//w:ins | .//w:del", namespaces=root.nsmap)
    if tracked_changes:
        print(f"Found {len(tracked_changes)} tracked changes")
        for i, change in enumerate(tracked_changes[:3]):  # Show first 3
            print(f"  Change {i+1}: {change.tag} - {change.text or 'No text'}")
    else:
        print("No tracked changes found")
    print()
    
    # 7. Sample paragraph analysis
    print("Sample paragraph analysis (first 3 paragraphs):")
    for i, para in enumerate(doc.paragraphs[:3]):
        if para.text.strip():  # Only non-empty paragraphs
            print(f"Paragraph {i+1}: '{para.text[:100]}...' (style: {para.style.name})")
            
            # Check each run for special elements
            for j, run in enumerate(para.runs):
                run_xml = run._element
                special_elements = []
                
                # Check for various elements in this run
                for element_name in annotation_elements:
                    if run_xml.find(f'.//w:{element_name}', namespaces=run_xml.nsmap) is not None:
                        special_elements.append(element_name)
                
                if special_elements:
                    print(f"  Run {j+1} contains: {', '.join(special_elements)}")
    
    return doc

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python debug_docx.py input.docx")
        sys.exit(1)
    
    debug_docx_structure(sys.argv[1])