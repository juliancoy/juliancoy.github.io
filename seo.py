import os
import xml.etree.ElementTree as ET
from datetime import datetime
from xml.dom import minidom

ignored = [".git", "compai.key", "compai.crt"]

def create_manifest(directory, parent_element):
    """
    Recursively creates XML elements for each item in the given directory.
    Adds lastmod, changefreq, and priority elements where applicable.
    """
    for item in os.listdir(directory):
        item_path = os.path.join(directory, item)
        
        if item in ignored:
            continue
        if os.path.isdir(item_path):
            # Create a 'directory' element for directories
            dir_element = ET.SubElement(parent_element, 'directory', name=item)
            create_manifest(item_path, dir_element)
        else:
            # Create a 'file' element for files
            file_element = ET.SubElement(parent_element, 'file', name=item)
            # Add lastmod, changefreq, and priority elements
            lastmod = os.path.getmtime(item_path)
            lastmod_date = datetime.utcfromtimestamp(lastmod).strftime('%Y-%m-%d')
            ET.SubElement(file_element, 'lastmod').text = lastmod_date
            ET.SubElement(file_element, 'changefreq').text = 'monthly'  # Adjust based on your content
            ET.SubElement(file_element, 'priority').text = '0.5'  # Adjust based on your content

def generate_sitemanifest(root_dir):
    """
    Generates a sitemanifest.xml file for the given root directory with pretty formatting.
    Includes SEO optimizations like lastmod, changefreq, and priority.
    """
    root_element = ET.Element('sitemanifest')
    create_manifest(root_dir, root_element)
    
    # Generate the XML tree
    tree = ET.ElementTree(root_element)
    
    # Use minidom to pretty print the XML
    xml_str = ET.tostring(root_element, 'utf-8')
    pretty_xml_as_string = minidom.parseString(xml_str).toprettyxml(indent="    ")

    # Write the pretty-printed XML to a file
    with open(os.path.join(root_dir, 'sitemanifest.xml'), 'w', encoding='utf-8') as f:
        f.write(pretty_xml_as_string)

if __name__ == "__main__":
    # Specify the root directory for which you want to create the sitemanifest.xml
    root_directory = '.'  # Replace with your directory path
    generate_sitemanifest(root_directory)

    print("sitemanifest.xml has been generated with SEO optimizations and pretty formatting.")
