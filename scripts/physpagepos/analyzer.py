"""
Physical page position analyzer for Voynich manuscript.

Analyzes where each character appears spatially on pages using
actual pixel coordinates from the Voynichese XML files.

Key differences from text-based pagepos:
- Uses actual x,y pixel coordinates instead of line/char positions
- Interpolates character positions within words based on word width
- Normalizes to page dimensions rather than line counts
"""

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.normalizer import (
    normalize_text,
    filter_to_valid_chars,
    get_valid_chars,
    CollapseMode,
)

from .xml_parser import PhysicalFolio, WordPosition
from .folio_mapper import FolioMetadata
from .config import GRID_RESOLUTIONS, NORMALIZATION_MODES, DEFAULT_RAW_GRID


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
        """Convert to JSON-serializable dict with multiple grid resolutions."""
        charset = self.get_charset()
        
        grids = {}
        for res_name, res_dims in GRID_RESOLUTIONS.items():
            if res_dims is None:
                continue
            cols, rows = res_dims
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
class AbsolutePositions:
    """Absolute (pixel) character positions for raw mode."""
    positions: dict[str, list[tuple[int, int]]] = field(default_factory=lambda: defaultdict(list))
    char_totals: Counter = field(default_factory=Counter)
    
    def add_position(self, char: str, x: int, y: int):
        """Add an absolute pixel position for a character."""
        self.positions[char].append((x, y))
        self.char_totals[char] += 1
    
    def merge(self, other: 'AbsolutePositions'):
        """Merge another AbsolutePositions into this one."""
        for char, pos_list in other.positions.items():
            self.positions[char].extend(pos_list)
        self.char_totals.update(other.char_totals)
    
    def get_charset(self) -> list[str]:
        """Get sorted list of all characters."""
        return sorted(self.char_totals.keys())
    
    def to_sparse_grid(self, max_x: int, max_y: int, grid_cols: int, grid_rows: int) -> dict[str, dict[str, int]]:
        """Convert absolute positions to sparse grid format."""
        result = {}
        
        for char, pos_list in self.positions.items():
            sparse = {}
            
            for x, y in pos_list:
                col = min(int((x / max_x) * grid_cols), grid_cols - 1) if max_x > 0 else 0
                row = min(int((y / max_y) * grid_rows), grid_rows - 1) if max_y > 0 else 0
                key = f"{col},{row}"
                sparse[key] = sparse.get(key, 0) + 1
            
            result[char] = sparse
        
        return result
    
    def to_dict_with_grid(self, max_x: int, max_y: int) -> dict:
        """Convert to JSON-serializable dict for raw/absolute mode."""
        charset = self.get_charset()
        
        grid_cols, grid_rows = DEFAULT_RAW_GRID
        char_grids = self.to_sparse_grid(max_x, max_y, grid_cols, grid_rows)
        
        return {
            'charset': charset,
            'total_chars': sum(self.char_totals.values()),
            'grids': {
                'raw': {
                    'grid_cols': grid_cols,
                    'grid_rows': grid_rows,
                    'sparse': True,
                    'absolute': True,
                    'max_x': max_x,
                    'max_y': max_y,
                    'characters': {
                        char: {
                            'cells': char_grids.get(char, {}),
                            'total': self.char_totals[char],
                        }
                        for char in charset
                    },
                    'total_cells': self._compute_total_sparse_grid(char_grids, charset),
                }
            }
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
    """Character positions for a single folio (before normalization)."""
    folio: str
    positions: list[tuple[str, float, float]]  # (char, x_pixel, y_pixel)
    width: int = 0
    height: int = 0
    metadata: dict = field(default_factory=dict)


@dataclass
class MultiModePositions:
    """Positions with multiple normalization modes."""
    folio: str
    page_normalized: RawPositions = field(default_factory=RawPositions)
    manuscript_normalized: RawPositions = field(default_factory=RawPositions)
    absolute_positions: AbsolutePositions = field(default_factory=AbsolutePositions)
    width: int = 0
    height: int = 0
    char_count: int = 0
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self, global_stats: dict = None) -> dict:
        """Convert to JSON-serializable dict with both normalization modes."""
        page_data = self.page_normalized.to_dict_with_grids()
        manuscript_data = self.manuscript_normalized.to_dict_with_grids()
        
        result = {
            'folio': self.folio,
            'width': self.width,
            'height': self.height,
            'char_count': self.char_count,
            'metadata': self.metadata,
            'charset': page_data['charset'],
            'total_chars': page_data['total_chars'],
            'normalization_modes': {
                'page': page_data['grids'],
                'manuscript': manuscript_data['grids'],
            }
        }
        
        if global_stats:
            max_x = global_stats.get('max_width', 1100)
            max_y = global_stats.get('max_height', 1600)
            abs_data = self.absolute_positions.to_dict_with_grid(max_x, max_y)
            result['normalization_modes']['manuscript']['raw'] = abs_data['grids']['raw']
        
        return result


def extract_page_positions(
    folio: PhysicalFolio,
    metadata: Optional[FolioMetadata],
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> PageCharPositions:
    """
    Extract character positions from a physical folio.
    
    Applies text normalization (bigram collapsing, i/e handling) and
    interpolates character positions within words.
    
    Args:
        folio: PhysicalFolio with word positions
        metadata: FolioMetadata with language/hand/quire info
        collapse_mode: How to handle i/e sequences
        
    Returns:
        PageCharPositions with normalized character positions
    """
    result = PageCharPositions(
        folio=folio.name,
        positions=[],
        width=folio.width,
        height=folio.height,
        metadata={
            'language': metadata.language if metadata else '',
            'hand': metadata.hand if metadata else '',
            'illustration': metadata.illustration if metadata else '',
            'quire': metadata.quire if metadata else '',
        }
    )
    
    valid_chars = get_valid_chars(collapse_mode)
    
    for word in folio.words:
        raw_text = word.text
        if not raw_text:
            continue
        
        normalized = normalize_text(raw_text, collapse_mode)
        filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=False)
        
        if not filtered:
            continue
        
        num_chars = len(filtered)
        
        for i, char in enumerate(filtered):
            if char not in valid_chars:
                continue
            
            if num_chars > 1:
                char_width = word.width / num_chars
                x = word.x + (i + 0.5) * char_width
            else:
                x = word.x + word.width / 2
            
            y = word.y + word.height / 2
            
            result.positions.append((char, x, y))
    
    return result


def normalize_positions(
    page_positions: PageCharPositions,
    mode: str = 'page',
    global_max_width: int = None,
    global_max_height: int = None,
) -> RawPositions:
    """
    Normalize character positions to 0-1 range.
    
    Args:
        page_positions: Raw positions from extract_page_positions
        mode: 'page' for per-page normalization, 'manuscript' for global
        global_max_width: Required for 'manuscript' mode
        global_max_height: Required for 'manuscript' mode
        
    Returns:
        RawPositions with normalized (0-1, 0-1) coordinates
    """
    result = RawPositions()
    
    if not page_positions.positions:
        return result
    
    if mode == 'page':
        width = page_positions.width
        height = page_positions.height
        
        for char, x, y in page_positions.positions:
            x_norm = x / width if width > 0 else 0.5
            y_norm = y / height if height > 0 else 0.5
            x_norm = max(0, min(1, x_norm))
            y_norm = max(0, min(1, y_norm))
            result.add_position(char, x_norm, y_norm)
    
    elif mode == 'manuscript':
        if global_max_width is None or global_max_height is None:
            raise ValueError("global_max_width and global_max_height required for manuscript mode")
        
        for char, x, y in page_positions.positions:
            x_norm = x / global_max_width if global_max_width > 0 else 0.5
            y_norm = y / global_max_height if global_max_height > 0 else 0.5
            x_norm = max(0, min(1, x_norm))
            y_norm = max(0, min(1, y_norm))
            result.add_position(char, x_norm, y_norm)
    
    else:
        raise ValueError(f"Unknown normalization mode: {mode}")
    
    return result


def extract_absolute_positions(page_positions: PageCharPositions) -> AbsolutePositions:
    """Extract absolute (pixel) positions from PageCharPositions."""
    result = AbsolutePositions()
    
    for char, x, y in page_positions.positions:
        result.add_position(char, int(x), int(y))
    
    return result


def analyze_all_folios(
    folios: list[PhysicalFolio],
    metadata_map: dict[str, FolioMetadata],
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> tuple[dict[str, MultiModePositions], dict]:
    """
    Analyze all folios with both normalization modes.
    
    Returns:
        Tuple of (folio_positions dict, global_stats dict)
    """
    raw_folio_data = {}
    global_max_width = 0
    global_max_height = 0
    
    for folio in folios:
        metadata = metadata_map.get(folio.name)
        pp = extract_page_positions(folio, metadata, collapse_mode)
        raw_folio_data[folio.name] = pp
        
        if folio.width > global_max_width:
            global_max_width = folio.width
        if folio.height > global_max_height:
            global_max_height = folio.height
    
    result = {}
    for folio_name, pp in raw_folio_data.items():
        page_norm = normalize_positions(pp, mode='page')
        manuscript_norm = normalize_positions(
            pp,
            mode='manuscript',
            global_max_width=global_max_width,
            global_max_height=global_max_height,
        )
        absolute_pos = extract_absolute_positions(pp)
        
        result[folio_name] = MultiModePositions(
            folio=folio_name,
            page_normalized=page_norm,
            manuscript_normalized=manuscript_norm,
            absolute_positions=absolute_pos,
            width=pp.width,
            height=pp.height,
            char_count=len(pp.positions),
            metadata=pp.metadata,
        )
    
    global_stats = {
        'max_width': global_max_width,
        'max_height': global_max_height,
    }
    
    return result, global_stats
