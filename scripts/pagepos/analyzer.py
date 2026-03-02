"""
Page position analyzer for Voynich manuscript text.

Analyzes where each character appears spatially on pages:
- X position: Character offset from line start
- Y position: Line number on page

Supports two normalization modes:
- Page-relative: Positions normalized per page (0-1 within each page)
- Manuscript-relative: Positions normalized to global max values

Stores raw normalized positions and quantizes to multiple grid resolutions.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import Page, Line
from common.normalizer import (
    normalize_text,
    filter_to_valid_chars,
    get_valid_chars,
    CollapseMode,
    WORD_SEPARATORS,
)

# Grid resolution presets
GRID_RESOLUTIONS = {
    'coarse': (5, 10),    # 5 cols x 10 rows
    'fine': (10, 20),     # 10 cols x 20 rows
    'raw': (50, 100),     # 50 cols x 100 rows - high resolution for "raw" view
}

# Normalization modes
NORMALIZATION_MODES = ['page', 'manuscript']


@dataclass
class RawPositions:
    """Raw normalized positions for each character."""
    positions: dict[str, list[tuple[float, float]]] = field(default_factory=lambda: defaultdict(list))
    char_totals: Counter = field(default_factory=Counter)
    
    def add_position(self, char: str, x_norm: float, y_norm: float):
        """Add a raw normalized position (0-1, 0-1) for a character."""
        self.positions[char].append((x_norm, y_norm))
        self.char_totals[char] += 1
    
    def merge(self, other: 'RawPositions'):
        """Merge another RawPositions into this one."""
        for char, pos_list in other.positions.items():
            self.positions[char].extend(pos_list)
        self.char_totals.update(other.char_totals)
    
    def get_charset(self) -> list[str]:
        """Get sorted list of all characters."""
        return sorted(self.char_totals.keys())
    
    def quantize_to_sparse_grid(self, grid_cols: int, grid_rows: int) -> dict[str, dict[str, int]]:
        """
        Quantize raw positions to a sparse grid of given resolution.
        Returns dict mapping char -> {"col,row": count} for non-zero cells only.
        """
        result = {}
        
        for char, pos_list in self.positions.items():
            sparse = {}
            
            for x_norm, y_norm in pos_list:
                grid_x = min(int(x_norm * grid_cols), grid_cols - 1)
                grid_y = min(int(y_norm * grid_rows), grid_rows - 1)
                key = f"{grid_x},{grid_y}"
                sparse[key] = sparse.get(key, 0) + 1
            
            result[char] = sparse
        
        return result
    
    def to_dict_with_grids(self) -> dict:
        """
        Convert to JSON-serializable dict with multiple grid resolutions.
        Uses sparse format (only non-zero cells) to reduce file size.
        """
        charset = self.get_charset()
        
        grids = {}
        for res_name, (cols, rows) in GRID_RESOLUTIONS.items():
            char_grids = self.quantize_to_sparse_grid(cols, rows)
            grids[res_name] = {
                'grid_cols': cols,
                'grid_rows': rows,
                'sparse': True,
                'characters': {
                    char: {
                        'cells': char_grids.get(char, {}),
                        'total': self.char_totals[char],
                    }
                    for char in charset
                },
                'total_cells': self._compute_total_sparse_grid(char_grids, charset),
            }
        
        return {
            'charset': charset,
            'total_chars': sum(self.char_totals.values()),
            'grids': grids,
        }
    
    def _compute_total_sparse_grid(self, char_grids: dict, charset: list[str]) -> dict[str, int]:
        """Compute total sparse grid by summing all character grids."""
        total = {}
        for char in charset:
            if char in char_grids:
                for key, count in char_grids[char].items():
                    total[key] = total.get(key, 0) + count
        return total


@dataclass 
class PageCharPositions:
    """Raw character positions for a single page (before normalization)."""
    folio: str
    positions: list[tuple[str, int, int, int]]  # (char, line_num, char_idx, line_width)
    line_count: int = 0
    max_line_num: int = 0
    min_line_num: int = 0
    max_line_width: int = 0
    metadata: dict = field(default_factory=dict)


def extract_page_positions(
    page: Page,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> PageCharPositions:
    """
    Extract raw character positions from a page (before normalization).
    Returns positions with absolute line numbers and character indices.
    """
    result = PageCharPositions(
        folio=page.folio,
        positions=[],
        metadata={
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
            'quire': page.quire,
        }
    )
    
    if not page.lines:
        return result
    
    valid_chars = get_valid_chars(collapse_mode)
    
    normalized_lines = []
    for line in page.lines:
        normalized = normalize_text(line.text, collapse_mode)
        filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=False)
        normalized_lines.append((line.line_num, filtered))
    
    if not normalized_lines:
        return result
    
    line_nums = [ln for ln, _ in normalized_lines]
    result.min_line_num = min(line_nums)
    result.max_line_num = max(line_nums)
    result.line_count = len(normalized_lines)
    result.max_line_width = max(len(text) for _, text in normalized_lines) if normalized_lines else 0
    
    for line_num, text in normalized_lines:
        line_width = len(text)
        for char_idx, char in enumerate(text):
            if char in valid_chars:
                result.positions.append((char, line_num, char_idx, line_width))
    
    return result


def normalize_positions(
    page_positions: PageCharPositions,
    mode: str = 'page',
    global_max_line_num: int = None,
    global_max_line_width: int = None,
) -> RawPositions:
    """
    Normalize character positions to 0-1 range.
    
    Args:
        page_positions: Raw positions from extract_page_positions
        mode: 'page' for per-page normalization, 'manuscript' for global normalization
        global_max_line_num: Required for 'manuscript' mode - max line number across all pages
        global_max_line_width: Required for 'manuscript' mode - max line width across all pages
    
    Returns:
        RawPositions with normalized (0-1, 0-1) coordinates
    """
    result = RawPositions()
    
    if not page_positions.positions:
        return result
    
    if mode == 'page':
        # Per-page normalization
        min_line = page_positions.min_line_num
        max_line = page_positions.max_line_num
        max_width = page_positions.max_line_width
        
        for char, line_num, char_idx, line_width in page_positions.positions:
            # Y: normalize by page's line range
            if max_line > min_line:
                y_norm = (line_num - min_line) / (max_line - min_line)
            else:
                y_norm = 0.5
            
            # X: normalize by page's max line width
            x_norm = char_idx / max_width if max_width > 0 else 0.5
            
            result.add_position(char, x_norm, y_norm)
    
    elif mode == 'manuscript':
        # Global normalization
        if global_max_line_num is None or global_max_line_width is None:
            raise ValueError("global_max_line_num and global_max_line_width required for manuscript mode")
        
        for char, line_num, char_idx, line_width in page_positions.positions:
            # Y: normalize by global max line number (line 1 = top, line N = bottom)
            y_norm = (line_num - 1) / global_max_line_num if global_max_line_num > 1 else 0.5
            
            # X: normalize by global max line width
            x_norm = char_idx / global_max_line_width if global_max_line_width > 0 else 0.5
            
            result.add_position(char, x_norm, y_norm)
    
    else:
        raise ValueError(f"Unknown normalization mode: {mode}")
    
    return result


@dataclass
class MultiModePositions:
    """Positions with multiple normalization modes."""
    folio: str
    page_normalized: RawPositions = field(default_factory=RawPositions)
    manuscript_normalized: RawPositions = field(default_factory=RawPositions)
    line_count: int = 0
    max_line_width: int = 0
    char_count: int = 0
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict with both normalization modes."""
        page_data = self.page_normalized.to_dict_with_grids()
        manuscript_data = self.manuscript_normalized.to_dict_with_grids()
        
        return {
            'folio': self.folio,
            'line_count': self.line_count,
            'max_line_width': self.max_line_width,
            'char_count': self.char_count,
            'metadata': self.metadata,
            'charset': page_data['charset'],
            'total_chars': page_data['total_chars'],
            'normalization_modes': {
                'page': page_data['grids'],
                'manuscript': manuscript_data['grids'],
            }
        }


def analyze_all_pages(
    pages: list[Page],
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> tuple[dict[str, MultiModePositions], dict]:
    """
    Analyze all pages with both normalization modes.
    
    Returns:
        Tuple of (page_positions dict, global_stats dict)
    """
    # First pass: extract raw positions and compute global maxes
    raw_page_data = {}
    global_max_line_num = 0
    global_max_line_width = 0
    
    for page in pages:
        pp = extract_page_positions(page, collapse_mode)
        raw_page_data[page.folio] = pp
        
        if pp.max_line_num > global_max_line_num:
            global_max_line_num = pp.max_line_num
        if pp.max_line_width > global_max_line_width:
            global_max_line_width = pp.max_line_width
    
    # Second pass: normalize with both modes
    result = {}
    for folio, pp in raw_page_data.items():
        page_norm = normalize_positions(pp, mode='page')
        manuscript_norm = normalize_positions(
            pp, 
            mode='manuscript',
            global_max_line_num=global_max_line_num,
            global_max_line_width=global_max_line_width,
        )
        
        result[folio] = MultiModePositions(
            folio=folio,
            page_normalized=page_norm,
            manuscript_normalized=manuscript_norm,
            line_count=pp.line_count,
            max_line_width=pp.max_line_width,
            char_count=len(pp.positions),
            metadata=pp.metadata,
        )
    
    global_stats = {
        'max_line_num': global_max_line_num,
        'max_line_width': global_max_line_width,
    }
    
    return result, global_stats


if __name__ == '__main__':
    from common.parser import parse_transcription
    
    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <transcription_file>")
        sys.exit(1)
    
    pages = parse_transcription(sys.argv[1])
    
    page_positions, global_stats = analyze_all_pages(pages, CollapseMode.DISTINCT)
    
    print(f"Global stats:")
    print(f"  Max line number: {global_stats['max_line_num']}")
    print(f"  Max line width: {global_stats['max_line_width']}")
    
    # Show first page
    folio = list(page_positions.keys())[0]
    pp = page_positions[folio]
    
    print(f"\nPage {folio}:")
    print(f"  Lines: {pp.line_count}, Max width: {pp.max_line_width}")
    print(f"  Total chars: {pp.char_count}")
    
    print("\n  Grid resolutions:")
    for res_name, (cols, rows) in GRID_RESOLUTIONS.items():
        print(f"    {res_name}: {cols}x{rows}")
