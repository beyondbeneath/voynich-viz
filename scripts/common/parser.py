"""
IVTFF format parser for Voynich manuscript transcriptions.

Parses page headers to extract metadata ($L, $H, $I, $Q, etc.)
and line content, handling uncertain characters and special markers.
"""

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Line:
    """A single line of transcribed text."""
    text: str
    line_num: int
    locus_type: str  # e.g., "P0", "Pt", "Lp"
    is_para_start: bool = False
    is_para_end: bool = False
    raw_locus: str = ""


@dataclass
class Page:
    """A page (folio) with metadata and lines."""
    folio: str
    quire: str = ""
    page_in_quire: str = ""
    illustration: str = ""  # T=text, H=herbal, Z=zodiac, B=biological, etc.
    language: str = ""  # A or B (Currier)
    hand: str = ""
    bifolio: str = ""
    lines: list[Line] = field(default_factory=list)
    
    def add_line(self, line: Line):
        self.lines.append(line)


# Regex patterns
PAGE_HEADER_PATTERN = re.compile(r'^<(f\d+[rv]\d*)>\s*(?:<!\s*(.+?)\s*>)?')
METADATA_PATTERN = re.compile(r'\$([A-Z])=([A-Za-z0-9]+)')
LINE_PATTERN = re.compile(r'^<(f\d+[rv]\d*\.\d+),([*@+=])([A-Za-z0-9]+)(?:;[A-Z])?>(.*)$')
UNCERTAIN_CHAR_PATTERN = re.compile(r'\[([^:\]]+):([^\]]+)\]')
LINKED_GLYPH_PATTERN = re.compile(r"\{([^}]+)\}")
COMMENT_ANNOTATION_PATTERN = re.compile(r'<![^>]*>')
INLINE_COMMENT_PATTERN = re.compile(r'<!.*?>')
CURRIER_COMMENT_PATTERN = re.compile(
    r"#\s*Currier'?s?\s+[Ll]anguage\s+([AB]),?\s*hand\s+(\d+)",
    re.IGNORECASE
)


def resolve_uncertain_char(match: re.Match) -> str:
    """
    Resolve uncertain character notation [a:o] by taking first non-? option.
    Example: [a:o] -> 'a', [?:ch] -> 'ch'
    """
    options = [match.group(1), match.group(2)]
    for opt in options:
        if opt != '?' and opt != '???':
            return opt
    return ''


def resolve_linked_glyphs(match: re.Match) -> str:
    """
    Resolve linked glyph notation {c'y} by removing quotes/apostrophes.
    Example: {c'y} -> 'cy', {cto} -> 'cto'
    """
    content = match.group(1)
    return content.replace("'", "")


def clean_line_text(text: str) -> str:
    """
    Clean line text by:
    - Resolving uncertain characters [a:o]
    - Resolving linked glyphs {c'y}
    - Removing inline comments <!...>
    - Removing paragraph markers <%> and <$>
    - Keeping word separators (.) and line breaks (/ and \\)
    - Removing illustration break markers <->
    """
    # Remove inline comments
    text = INLINE_COMMENT_PATTERN.sub('', text)
    
    # Remove non-Voynich annotation references like @254;
    text = re.sub(r'@\d+;?', '', text)
    
    # Resolve uncertain characters
    text = UNCERTAIN_CHAR_PATTERN.sub(resolve_uncertain_char, text)
    
    # Resolve linked glyphs
    text = LINKED_GLYPH_PATTERN.sub(resolve_linked_glyphs, text)
    
    # Remove paragraph start/end markers but track them
    text = text.replace('<%>', '')
    text = text.replace('<$>', '')
    
    # Remove illustration breaks - replace with word boundary
    text = text.replace('<->', '.')
    text = text.replace('-/', '/')
    
    # Remove any remaining angle bracket annotations
    text = re.sub(r'<[^>]*>', '', text)
    
    return text.strip()


def parse_page_metadata(metadata_str: str) -> dict:
    """Parse metadata string like '$Q=A $P=A $I=T $L=A $H=1'"""
    metadata = {}
    for match in METADATA_PATTERN.finditer(metadata_str):
        key, value = match.groups()
        metadata[key] = value
    return metadata


def parse_transcription(filepath: str) -> list[Page]:
    """
    Parse an IVTFF format transcription file.
    
    Returns a list of Page objects with metadata and lines.
    
    Note: Language and hand values are extracted from comment lines like
    "# Currier's language A, hand 1" which are more reliable than the
    $L= and $H= page variables (which have known inconsistencies).
    """
    pages = []
    current_page: Optional[Page] = None
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            
            # Skip empty lines
            if not line:
                continue
            
            # Check comment lines for Currier language/hand info
            if line.startswith('#') and current_page:
                currier_match = CURRIER_COMMENT_PATTERN.match(line)
                if currier_match:
                    current_page.language = currier_match.group(1).upper()
                    current_page.hand = currier_match.group(2)
                continue
            
            # Check for page header: <f1r> <! $Q=A ... >
            page_match = PAGE_HEADER_PATTERN.match(line)
            if page_match:
                folio = page_match.group(1)
                metadata_str = page_match.group(2) or ""
                
                # Create new page with metadata from header
                # Note: language and hand may be overridden by comment parsing above
                metadata = parse_page_metadata(metadata_str)
                current_page = Page(
                    folio=folio,
                    quire=metadata.get('Q', ''),
                    page_in_quire=metadata.get('P', ''),
                    illustration=metadata.get('I', ''),
                    language=metadata.get('L', ''),
                    hand=metadata.get('H', ''),
                    bifolio=metadata.get('B', ''),
                )
                pages.append(current_page)
                continue
            
            # Check for content line: <f1r.1,@P0> text...
            line_match = LINE_PATTERN.match(line)
            if line_match and current_page:
                locus = line_match.group(1)
                position_marker = line_match.group(2)  # *, @, +, =
                locus_type = line_match.group(3)  # P0, Pt, Lp, etc.
                text_content = line_match.group(4)
                
                # Only process paragraph text loci (P*). Skip labels, circular/radial text, etc.
                if not locus_type.startswith('P'):
                    continue
                
                # Extract line number from locus
                line_num_match = re.search(r'\.(\d+)', locus)
                line_num = int(line_num_match.group(1)) if line_num_match else 0
                
                # Check for paragraph markers in raw text
                is_para_start = '<%>' in text_content
                is_para_end = '<$>' in text_content
                
                # Also check position markers
                if position_marker == '*':
                    is_para_start = True
                
                # Clean the text
                cleaned_text = clean_line_text(text_content)
                
                if cleaned_text:  # Only add non-empty lines
                    current_page.add_line(Line(
                        text=cleaned_text,
                        line_num=line_num,
                        locus_type=locus_type,
                        is_para_start=is_para_start,
                        is_para_end=is_para_end,
                        raw_locus=locus,
                    ))
    
    return pages


def get_page_text(page: Page, join_char: str = ' ') -> str:
    """Get all text from a page joined together."""
    return join_char.join(line.text for line in page.lines)


def get_all_text(pages: list[Page], join_char: str = ' ') -> str:
    """Get all text from all pages."""
    return join_char.join(get_page_text(p, join_char) for p in pages)


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python parser.py <transcription_file>")
        sys.exit(1)
    
    pages = parse_transcription(sys.argv[1])
    print(f"Parsed {len(pages)} pages")
    
    for page in pages[:3]:
        print(f"\n{page.folio}: lang={page.language}, hand={page.hand}, illust={page.illustration}")
        for line in page.lines[:3]:
            print(f"  Line {line.line_num}: {line.text[:60]}...")
