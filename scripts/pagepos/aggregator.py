"""
Aggregator for Voynich manuscript page position counts.

Sums position counts across pages filtered by various criteria
(language, hand, section type) and outputs JSON files.

Supports both page-relative and manuscript-relative normalization modes.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import Page
from .analyzer import (
    RawPositions, 
    MultiModePositions, 
    GRID_RESOLUTIONS,
    NORMALIZATION_MODES,
)


@dataclass
class AggregationResult:
    """Result of aggregating position counts."""
    name: str
    description: str
    page_count: int
    char_count: int
    page_positions: RawPositions  # Page-relative normalization
    manuscript_positions: RawPositions  # Manuscript-relative normalization
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict with both normalization modes."""
        page_data = self.page_positions.to_dict_with_grids()
        manuscript_data = self.manuscript_positions.to_dict_with_grids()
        
        return {
            'name': self.name,
            'description': self.description,
            'page_count': self.page_count,
            'char_count': self.char_count,
            'charset': page_data['charset'],
            'total_chars': page_data['total_chars'],
            'normalization_modes': {
                'page': page_data['grids'],
                'manuscript': manuscript_data['grids'],
            }
        }


PageFilter = Callable[[Page], bool]


def make_language_filter(lang: str) -> PageFilter:
    """Create filter for Currier language (A or B)."""
    return lambda p: p.language == lang


def make_hand_filter(hand: str) -> PageFilter:
    """Create filter for scribe hand."""
    return lambda p: p.hand == hand


def make_illustration_filter(illust: str) -> PageFilter:
    """Create filter for illustration type."""
    return lambda p: p.illustration == illust


def make_quire_filter(quire: str) -> PageFilter:
    """Create filter for quire."""
    return lambda p: p.quire == quire


def make_combined_filter(*filters: PageFilter) -> PageFilter:
    """Combine multiple filters with AND logic."""
    return lambda p: all(f(p) for f in filters)


AGGREGATIONS: dict[str, tuple[str, PageFilter]] = {
    'all': ('All pages', lambda p: True),
    'language_a': ('Currier Language A', make_language_filter('A')),
    'language_b': ('Currier Language B', make_language_filter('B')),
    'hand_1': ('Hand 1', make_hand_filter('1')),
    'hand_2': ('Hand 2', make_hand_filter('2')),
    'hand_3': ('Hand 3', make_hand_filter('3')),
    'hand_4': ('Hand 4', make_hand_filter('4')),
    'hand_5': ('Hand 5', make_hand_filter('5')),
    'herbal': ('Herbal section', make_illustration_filter('H')),
    'zodiac': ('Zodiac section', make_illustration_filter('Z')),
    'biological': ('Biological section', make_illustration_filter('B')),
    'pharmaceutical': ('Pharmaceutical section', make_illustration_filter('P')),
    'astronomical': ('Astronomical section', make_illustration_filter('A')),
    'cosmological': ('Cosmological section', make_illustration_filter('C')),
    'text_only': ('Text only pages', make_illustration_filter('T')),
    'herbal_lang_a': (
        'Herbal section, Language A',
        make_combined_filter(make_illustration_filter('H'), make_language_filter('A'))
    ),
    'herbal_lang_b': (
        'Herbal section, Language B',
        make_combined_filter(make_illustration_filter('H'), make_language_filter('B'))
    ),
    'biological_lang_a': (
        'Biological section, Language A',
        make_combined_filter(make_illustration_filter('B'), make_language_filter('A'))
    ),
    'biological_lang_b': (
        'Biological section, Language B',
        make_combined_filter(make_illustration_filter('B'), make_language_filter('B'))
    ),
    'quire_13': ('Quire 13', make_quire_filter('M')),
    'quire_20': ('Quire 20', make_quire_filter('T')),
}


def aggregate_pages(
    pages: list[Page],
    page_positions: dict[str, MultiModePositions],
    name: str,
    description: str,
    filter_func: PageFilter,
) -> AggregationResult:
    """
    Aggregate position counts for pages matching a filter.
    """
    matching_pages = [p for p in pages if filter_func(p)]
    
    merged_page = RawPositions()
    merged_manuscript = RawPositions()
    total_chars = 0
    
    for page in matching_pages:
        if page.folio in page_positions:
            pp = page_positions[page.folio]
            merged_page.merge(pp.page_normalized)
            merged_manuscript.merge(pp.manuscript_normalized)
            total_chars += pp.char_count
    
    return AggregationResult(
        name=name,
        description=description,
        page_count=len(matching_pages),
        char_count=total_chars,
        page_positions=merged_page,
        manuscript_positions=merged_manuscript,
    )


def run_all_aggregations(
    pages: list[Page],
    page_positions: dict[str, MultiModePositions],
    aggregations: Optional[dict[str, tuple[str, PageFilter]]] = None,
) -> dict[str, AggregationResult]:
    """Run all standard aggregations."""
    if aggregations is None:
        aggregations = AGGREGATIONS
    
    results = {}
    for name, (description, filter_func) in aggregations.items():
        results[name] = aggregate_pages(
            pages, page_positions, name, description, filter_func
        )
    
    return results


def save_aggregation(result: AggregationResult, output_path: Path):
    """Save an aggregation result to JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result.to_dict(), f, indent=2)


def save_all_aggregations(
    results: dict[str, AggregationResult],
    output_dir: Path,
    global_stats: dict,
):
    """Save all aggregation results to separate JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for name, result in results.items():
        save_aggregation(result, output_dir / f"{name}.json")
    
    # Include grid resolution and normalization mode info in manifest
    manifest = {
        'grid_resolutions': {
            name: {'cols': cols, 'rows': rows}
            for name, (cols, rows) in GRID_RESOLUTIONS.items()
        },
        'normalization_modes': {
            'page': {
                'name': 'Page-relative',
                'description': 'Positions normalized within each page (0-1 range per page)',
            },
            'manuscript': {
                'name': 'Manuscript-relative', 
                'description': f'Positions normalized to global max (max {global_stats["max_line_num"]} lines, max {global_stats["max_line_width"]} chars/line)',
            },
        },
        'global_stats': global_stats,
        'aggregations': [
            {
                'name': name,
                'description': result.description,
                'page_count': result.page_count,
                'char_count': result.char_count,
                'file': f"{name}.json",
            }
            for name, result in results.items()
        ]
    }
    with open(output_dir / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)


def save_page_positions(
    page_positions: dict[str, MultiModePositions],
    output_path: Path,
    config: Optional[dict] = None,
    global_stats: Optional[dict] = None,
):
    """Save all page position counts to a single JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        'grid_resolutions': {
            name: {'cols': cols, 'rows': rows}
            for name, (cols, rows) in GRID_RESOLUTIONS.items()
        },
        'normalization_modes': NORMALIZATION_MODES,
        'global_stats': global_stats or {},
        'pages': [pp.to_dict() for pp in page_positions.values()],
        'config': config or {},
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
