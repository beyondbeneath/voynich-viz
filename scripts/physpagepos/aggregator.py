"""
Aggregator for physical page position counts.

Sums position counts across folios filtered by various criteria
(language, hand, section type) and outputs JSON files.

Similar to pagepos aggregator but works with physical pixel positions.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from .analyzer import (
    RawPositions,
    AbsolutePositions,
    MultiModePositions,
)
from .folio_mapper import FolioMetadata
from .config import GRID_RESOLUTIONS, NORMALIZATION_MODES, DEFAULT_RAW_GRID


@dataclass
class AggregationResult:
    """Result of aggregating position counts."""
    name: str
    description: str
    page_count: int
    char_count: int
    page_positions: RawPositions
    manuscript_positions: RawPositions
    absolute_positions: AbsolutePositions = field(default_factory=AbsolutePositions)
    pages: list = field(default_factory=list)
    
    def to_dict(self, global_stats: dict = None) -> dict:
        """Convert to JSON-serializable dict with both normalization modes."""
        page_data = self.page_positions.to_dict_with_grids()
        manuscript_data = self.manuscript_positions.to_dict_with_grids()
        
        result = {
            'name': self.name,
            'description': self.description,
            'page_count': self.page_count,
            'char_count': self.char_count,
            'charset': page_data['charset'],
            'total_chars': page_data['total_chars'],
            'normalization_modes': {
                'page': page_data['grids'],
                'manuscript': manuscript_data['grids'],
            },
            'pages': self.pages,
        }
        
        if global_stats:
            max_x = global_stats.get('max_width', 1100)
            max_y = global_stats.get('max_height', 1600)
            abs_data = self.absolute_positions.to_dict_with_grid(max_x, max_y)
            result['normalization_modes']['manuscript']['raw'] = abs_data['grids']['raw']
        
        return result


MetadataFilter = Callable[[FolioMetadata], bool]


def make_language_filter(lang: str) -> MetadataFilter:
    """Create filter for Currier language (A or B)."""
    return lambda m: m.language == lang


def make_hand_filter(hand: str) -> MetadataFilter:
    """Create filter for scribe hand."""
    return lambda m: m.hand == hand


def make_illustration_filter(illust: str) -> MetadataFilter:
    """Create filter for illustration type."""
    return lambda m: m.illustration == illust


def make_quire_filter(quire: str) -> MetadataFilter:
    """Create filter for quire."""
    return lambda m: m.quire == quire


def make_combined_filter(*filters: MetadataFilter) -> MetadataFilter:
    """Combine multiple filters with AND logic."""
    return lambda m: all(f(m) for f in filters)


AGGREGATIONS: dict[str, tuple[str, MetadataFilter]] = {
    'all': ('All pages', lambda m: True),
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


def aggregate_folios(
    folio_positions: dict[str, MultiModePositions],
    metadata_map: dict[str, FolioMetadata],
    name: str,
    description: str,
    filter_func: MetadataFilter,
) -> AggregationResult:
    """
    Aggregate position counts for folios matching a filter.
    """
    merged_page = RawPositions()
    merged_manuscript = RawPositions()
    merged_absolute = AbsolutePositions()
    total_chars = 0
    page_metadata_list = []
    matching_count = 0
    
    for folio_name, positions in folio_positions.items():
        metadata = metadata_map.get(folio_name)
        
        if metadata is None:
            continue
        
        if not filter_func(metadata):
            continue
        
        matching_count += 1
        merged_page.merge(positions.page_normalized)
        merged_manuscript.merge(positions.manuscript_normalized)
        merged_absolute.merge(positions.absolute_positions)
        total_chars += positions.char_count
        
        page_metadata_list.append({
            'folio': folio_name,
            'quire': metadata.quire,
            'language': metadata.language,
            'hand': metadata.hand,
            'illustration': metadata.illustration,
        })
    
    return AggregationResult(
        name=name,
        description=description,
        page_count=matching_count,
        char_count=total_chars,
        page_positions=merged_page,
        manuscript_positions=merged_manuscript,
        absolute_positions=merged_absolute,
        pages=page_metadata_list,
    )


def run_all_aggregations(
    folio_positions: dict[str, MultiModePositions],
    metadata_map: dict[str, FolioMetadata],
    aggregations: Optional[dict[str, tuple[str, MetadataFilter]]] = None,
) -> dict[str, AggregationResult]:
    """Run all standard aggregations."""
    if aggregations is None:
        aggregations = AGGREGATIONS
    
    results = {}
    for name, (description, filter_func) in aggregations.items():
        results[name] = aggregate_folios(
            folio_positions, metadata_map, name, description, filter_func
        )
    
    return results


def save_aggregation(result: AggregationResult, output_path: Path, global_stats: dict = None):
    """Save an aggregation result to JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result.to_dict(global_stats), f, indent=2)


def save_all_aggregations(
    results: dict[str, AggregationResult],
    output_dir: Path,
    global_stats: dict,
):
    """Save all aggregation results to separate JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for name, result in results.items():
        save_aggregation(result, output_dir / f"{name}.json", global_stats)
    
    grid_resolutions = {}
    for res_name, res_dims in GRID_RESOLUTIONS.items():
        if res_dims is None:
            cols, rows = DEFAULT_RAW_GRID
            grid_resolutions[res_name] = {
                'cols': cols,
                'rows': rows,
                'absolute': True,
                'max_x': global_stats['max_width'],
                'max_y': global_stats['max_height'],
            }
        else:
            cols, rows = res_dims
            grid_resolutions[res_name] = {'cols': cols, 'rows': rows}
    
    manifest = {
        'grid_resolutions': grid_resolutions,
        'normalization_modes': {
            'page': {
                'name': 'Page-relative',
                'description': 'Positions normalized within each page (0-1 range per page)',
            },
            'manuscript': {
                'name': 'Manuscript-relative', 
                'description': f'Positions normalized to global max (max {global_stats["max_width"]}x{global_stats["max_height"]} pixels)',
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


def save_folio_positions(
    folio_positions: dict[str, MultiModePositions],
    output_path: Path,
    config: Optional[dict] = None,
    global_stats: Optional[dict] = None,
):
    """Save all folio position counts to a single JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    grid_resolutions = {}
    for res_name, res_dims in GRID_RESOLUTIONS.items():
        if res_dims is None and global_stats:
            cols, rows = DEFAULT_RAW_GRID
            grid_resolutions[res_name] = {
                'cols': cols,
                'rows': rows,
                'absolute': True,
                'max_x': global_stats.get('max_width', 1100),
                'max_y': global_stats.get('max_height', 1600),
            }
        elif res_dims is not None:
            cols, rows = res_dims
            grid_resolutions[res_name] = {'cols': cols, 'rows': rows}
    
    data = {
        'grid_resolutions': grid_resolutions,
        'normalization_modes': NORMALIZATION_MODES,
        'global_stats': global_stats or {},
        'pages': [pp.to_dict(global_stats) for pp in folio_positions.values()],
        'config': config or {},
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
