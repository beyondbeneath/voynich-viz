"""
Parser for Voynichese XML files containing word positions.

Each XML file represents a single folio and contains:
- Folio metadata (name, dimensions, word count)
- Word entries with index, x, y, width, height, and text content

Supports reading from:
- Individual XML files
- Directories containing XML files
- Zip archives containing XML files

Example:
<folio name="f1r" wordCount="210" width="1090" height="1500">
  <word index="0" x="97" y="128" width="106" height="96">fachys</word>
  ...
</folio>
"""

import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Iterator, Union


@dataclass
class WordPosition:
    """A word with its physical position on the page."""
    index: int
    x: int
    y: int
    width: int
    height: int
    text: str
    
    @property
    def x_center(self) -> float:
        """X coordinate of word center."""
        return self.x + self.width / 2
    
    @property
    def y_center(self) -> float:
        """Y coordinate of word center."""
        return self.y + self.height / 2
    
    @property
    def x_end(self) -> int:
        """X coordinate of word end."""
        return self.x + self.width


@dataclass
class PhysicalFolio:
    """A folio with physical word positions."""
    name: str
    width: int
    height: int
    word_count: int
    words: list[WordPosition] = field(default_factory=list)
    
    @property
    def folio_name(self) -> str:
        """Standardized folio name (same as name)."""
        return self.name


def _parse_xml_root(root: ET.Element) -> PhysicalFolio:
    """
    Parse XML root element into a PhysicalFolio.
    
    Args:
        root: XML root element (folio)
        
    Returns:
        PhysicalFolio object with all word positions
    """
    folio = PhysicalFolio(
        name=root.get('name', ''),
        width=int(root.get('width', 0)),
        height=int(root.get('height', 0)),
        word_count=int(root.get('wordCount', 0)),
    )
    
    for word_elem in root.findall('word'):
        word = WordPosition(
            index=int(word_elem.get('index', 0)),
            x=int(word_elem.get('x', 0)),
            y=int(word_elem.get('y', 0)),
            width=int(word_elem.get('width', 0)),
            height=int(word_elem.get('height', 0)),
            text=word_elem.text or '',
        )
        folio.words.append(word)
    
    return folio


def parse_xml_file(filepath: Path) -> PhysicalFolio:
    """
    Parse a single Voynichese XML file.
    
    Args:
        filepath: Path to the XML file
        
    Returns:
        PhysicalFolio object with all word positions
    """
    tree = ET.parse(filepath)
    return _parse_xml_root(tree.getroot())


def parse_xml_bytes(xml_bytes: bytes, source_name: str = 'unknown') -> PhysicalFolio:
    """
    Parse Voynichese XML from bytes.
    
    Args:
        xml_bytes: XML content as bytes
        source_name: Name to use in error messages
        
    Returns:
        PhysicalFolio object with all word positions
    """
    root = ET.fromstring(xml_bytes)
    return _parse_xml_root(root)


def parse_xml_zip(zippath: Path) -> list[PhysicalFolio]:
    """
    Parse all XML files from a zip archive.
    
    Args:
        zippath: Path to the zip file containing XML files
        
    Returns:
        List of PhysicalFolio objects, sorted by folio name
    """
    folios = []
    
    with zipfile.ZipFile(zippath, 'r') as zf:
        xml_files = sorted([
            name for name in zf.namelist() 
            if name.endswith('.xml') and not name.startswith('__MACOSX')
        ])
        
        for xml_name in xml_files:
            try:
                xml_bytes = zf.read(xml_name)
                folio = parse_xml_bytes(xml_bytes, xml_name)
                if folio.words:
                    folios.append(folio)
            except ET.ParseError as e:
                print(f"Warning: Failed to parse {xml_name} from zip: {e}")
            except Exception as e:
                print(f"Warning: Error reading {xml_name} from zip: {e}")
    
    return folios


def parse_xml_directory(dirpath: Path) -> list[PhysicalFolio]:
    """
    Parse all XML files in a directory.
    
    Args:
        dirpath: Path to directory containing XML files
        
    Returns:
        List of PhysicalFolio objects, sorted by folio name
    """
    folios = []
    
    for xml_file in sorted(dirpath.glob('*.xml')):
        try:
            folio = parse_xml_file(xml_file)
            if folio.words:
                folios.append(folio)
        except ET.ParseError as e:
            print(f"Warning: Failed to parse {xml_file}: {e}")
    
    return folios


def parse_xml_source(source: Path) -> list[PhysicalFolio]:
    """
    Parse XML files from either a zip archive or directory.
    
    Automatically detects whether source is a zip file or directory.
    
    Args:
        source: Path to either a .zip file or a directory containing .xml files
        
    Returns:
        List of PhysicalFolio objects, sorted by folio name
        
    Raises:
        ValueError: If source doesn't exist or isn't a valid type
    """
    if not source.exists():
        raise ValueError(f"Source path does not exist: {source}")
    
    if source.is_file() and source.suffix.lower() == '.zip':
        return parse_xml_zip(source)
    elif source.is_dir():
        return parse_xml_directory(source)
    else:
        raise ValueError(
            f"Source must be a .zip file or directory, got: {source}"
        )


def iter_character_positions(
    folio: PhysicalFolio,
    char_width_mode: str = 'interpolate',
) -> Iterator[tuple[str, float, float]]:
    """
    Iterate over individual character positions within a folio.
    
    For each word, characters are positioned by interpolating across
    the word's bounding box (assuming fixed-width characters within word).
    
    Args:
        folio: PhysicalFolio to process
        char_width_mode: How to compute character positions within words
            - 'interpolate': Spread characters evenly across word width
            - 'start': All characters at word start x
            
    Yields:
        Tuples of (character, x_position, y_position)
    """
    for word in folio.words:
        text = word.text
        if not text:
            continue
            
        num_chars = len(text)
        
        if char_width_mode == 'interpolate' and num_chars > 1:
            char_width = word.width / num_chars
            for i, char in enumerate(text):
                x = word.x + (i + 0.5) * char_width
                y = word.y_center
                yield (char, x, y)
        else:
            for i, char in enumerate(text):
                x = word.x + (i * word.width / max(num_chars, 1))
                y = word.y_center
                yield (char, x, y)


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python xml_parser.py <xml_source>")
        print("  xml_source: Path to a .zip file, directory, or single .xml file")
        sys.exit(1)
    
    path = Path(sys.argv[1])
    
    if path.is_dir() or (path.is_file() and path.suffix.lower() == '.zip'):
        folios = parse_xml_source(path)
        print(f"Parsed {len(folios)} folios from {path}")
        for folio in folios[:3]:
            print(f"  {folio.name}: {len(folio.words)} words, {folio.width}x{folio.height}")
    elif path.is_file() and path.suffix.lower() == '.xml':
        folio = parse_xml_file(path)
        print(f"Folio: {folio.name}")
        print(f"  Dimensions: {folio.width}x{folio.height}")
        print(f"  Words: {len(folio.words)}")
        for word in folio.words[:5]:
            print(f"    {word.index}: '{word.text}' at ({word.x}, {word.y})")
    else:
        print(f"Error: Unknown file type: {path}")
        sys.exit(1)
