"""
Maps folio names to metadata (language, hand, quire, illustration type).

Extracts mapping from the IVTFF transcription file since the XML files
don't contain this metadata.
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class FolioMetadata:
    """Metadata for a folio extracted from transcription file."""
    folio: str
    quire: str = ""
    page_in_quire: str = ""
    illustration: str = ""
    language: str = ""
    hand: str = ""
    bifolio: str = ""


# Regex patterns (same as in common/parser.py)
PAGE_HEADER_PATTERN = re.compile(r'^<(f\d+[rv]\d*)>\s*(?:<!\s*(.+?)\s*>)?')
METADATA_PATTERN = re.compile(r'\$([A-Z])=([A-Za-z0-9]+)')
CURRIER_COMMENT_PATTERN = re.compile(
    r"#\s*Currier'?s?\s+[Ll]anguage\s+([AB]),?\s*hand\s+(\d+)",
    re.IGNORECASE
)


def extract_folio_metadata(transcription_path: Path) -> dict[str, FolioMetadata]:
    """
    Extract folio metadata mapping from transcription file.
    
    Args:
        transcription_path: Path to IVTFF transcription file
        
    Returns:
        Dict mapping folio name -> FolioMetadata
    """
    metadata_map = {}
    current_folio: Optional[FolioMetadata] = None
    
    with open(transcription_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            
            if not line:
                continue
            
            # Check for Currier language/hand comment
            if line.startswith('#') and current_folio:
                currier_match = CURRIER_COMMENT_PATTERN.match(line)
                if currier_match:
                    current_folio.language = currier_match.group(1).upper()
                    current_folio.hand = currier_match.group(2)
                continue
            
            # Check for page header
            page_match = PAGE_HEADER_PATTERN.match(line)
            if page_match:
                folio_name = page_match.group(1)
                metadata_str = page_match.group(2) or ""
                
                # Parse metadata from header
                metadata = {}
                for match in METADATA_PATTERN.finditer(metadata_str):
                    key, value = match.groups()
                    metadata[key] = value
                
                current_folio = FolioMetadata(
                    folio=folio_name,
                    quire=metadata.get('Q', ''),
                    page_in_quire=metadata.get('P', ''),
                    illustration=metadata.get('I', ''),
                    language=metadata.get('L', ''),
                    hand=metadata.get('H', ''),
                    bifolio=metadata.get('B', ''),
                )
                metadata_map[folio_name] = current_folio
    
    return metadata_map


class FolioMapper:
    """
    Maps folio names from XML files to their metadata.
    
    Handles slight naming variations between XML files and transcription.
    """
    
    def __init__(self, transcription_path: Path):
        """
        Initialize mapper from transcription file.
        
        Args:
            transcription_path: Path to IVTFF transcription file
        """
        self.metadata = extract_folio_metadata(transcription_path)
        self._build_lookup()
    
    def _build_lookup(self):
        """Build normalized lookup for folio names."""
        self._normalized = {}
        for folio_name, meta in self.metadata.items():
            # Store original
            self._normalized[folio_name] = meta
            # Store without leading 'f'
            if folio_name.startswith('f'):
                self._normalized[folio_name[1:]] = meta
    
    def get_metadata(self, folio_name: str) -> Optional[FolioMetadata]:
        """
        Get metadata for a folio name.
        
        Args:
            folio_name: Folio name from XML file (e.g., "f1r")
            
        Returns:
            FolioMetadata if found, None otherwise
        """
        # Try exact match first
        if folio_name in self._normalized:
            return self._normalized[folio_name]
        
        # Try adding 'f' prefix
        if not folio_name.startswith('f'):
            prefixed = 'f' + folio_name
            if prefixed in self._normalized:
                return self._normalized[prefixed]
        
        return None
    
    def get_all_folios(self) -> list[str]:
        """Get list of all folio names."""
        return list(self.metadata.keys())
    
    def get_folios_by_filter(self, filter_func) -> list[str]:
        """Get folios matching a filter function."""
        return [
            name for name, meta in self.metadata.items()
            if filter_func(meta)
        ]


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python folio_mapper.py <transcription_file>")
        sys.exit(1)
    
    mapper = FolioMapper(Path(sys.argv[1]))
    
    print(f"Loaded metadata for {len(mapper.metadata)} folios")
    
    # Show some examples
    for folio in ['f1r', 'f1v', 'f75r', 'f116r']:
        meta = mapper.get_metadata(folio)
        if meta:
            print(f"  {folio}: lang={meta.language}, hand={meta.hand}, "
                  f"quire={meta.quire}, illust={meta.illustration}")
        else:
            print(f"  {folio}: NOT FOUND")
