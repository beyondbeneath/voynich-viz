"""
Aggregator for Voynich manuscript line position effects analysis.

Aggregates line position counts across pages filtered by various criteria
(language, hand, section type) and outputs JSON files.
"""

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import Page
from .analyzer import LinePositionCounts, merge_line_position_counts, compute_probabilities
from .config import MAX_WORD_POSITION


@dataclass
class AggregationResult:
    """Result of aggregating line position counts."""
    name: str
    description: str
    page_count: int
    merged_counts: LinePositionCounts
    pages: list
    
    def get_charset(self) -> list[str]:
        """Get sorted list of all ending glyphs."""
        return sorted(self.merged_counts.get_charset())
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        probs = compute_probabilities(self.merged_counts)
        
        # Convert position keys to strings for JSON
        prob_from_start = {}
        prob_from_end = {}
        
        for glyph, pos_dict in probs['prob_from_start'].items():
            prob_from_start[glyph] = {str(k): v for k, v in pos_dict.items()}
        
        for glyph, pos_dict in probs['prob_from_end'].items():
            prob_from_end[glyph] = {str(k): v for k, v in pos_dict.items()}
        
        # Compute top line-start and line-end preferring glyphs
        asymmetry = probs['asymmetry']
        
        top_line_start = sorted(asymmetry.items(), key=lambda x: -x[1])[:15]
        top_line_end = sorted(asymmetry.items(), key=lambda x: x[1])[:15]
        
        # Prepare top lists with stats
        top_start_list = []
        for glyph, asym in top_line_start:
            p_first = probs['prob_from_start'].get(glyph, {}).get(0, 0)
            p_last = probs['prob_from_end'].get(glyph, {}).get(0, 0)
            top_start_list.append({
                'glyph': glyph,
                'p_first_word': p_first,
                'p_last_word': p_last,
                'asymmetry': asym,
                'start_count': self.merged_counts.start_glyph_totals.get(glyph, 0),
                'end_count': self.merged_counts.end_glyph_totals.get(glyph, 0),
            })
        
        top_end_list = []
        for glyph, asym in top_line_end:
            p_first = probs['prob_from_start'].get(glyph, {}).get(0, 0)
            p_last = probs['prob_from_end'].get(glyph, {}).get(0, 0)
            top_end_list.append({
                'glyph': glyph,
                'p_first_word': p_first,
                'p_last_word': p_last,
                'asymmetry': asym,
                'start_count': self.merged_counts.start_glyph_totals.get(glyph, 0),
                'end_count': self.merged_counts.end_glyph_totals.get(glyph, 0),
            })
        
        # All glyphs sorted by absolute asymmetry
        all_glyphs_by_asymmetry = sorted(
            asymmetry.items(),
            key=lambda x: -abs(x[1])
        )
        asymmetry_ranking = []
        for glyph, asym in all_glyphs_by_asymmetry:
            p_first = probs['prob_from_start'].get(glyph, {}).get(0, 0)
            p_last = probs['prob_from_end'].get(glyph, {}).get(0, 0)
            asymmetry_ranking.append({
                'glyph': glyph,
                'p_first_word': p_first,
                'p_last_word': p_last,
                'asymmetry': asym,
                'start_count': self.merged_counts.start_glyph_totals.get(glyph, 0),
                'end_count': self.merged_counts.end_glyph_totals.get(glyph, 0),
            })
        
        return {
            'name': self.name,
            'description': self.description,
            'page_count': self.page_count,
            'charset': self.get_charset(),
            'max_word_position': MAX_WORD_POSITION,
            'total_words_from_start': {str(k): v for k, v in self.merged_counts.total_words_from_start.items()},
            'total_words_from_end': {str(k): v for k, v in self.merged_counts.total_words_from_end.items()},
            'start_glyph_totals': dict(self.merged_counts.start_glyph_totals),
            'end_glyph_totals': dict(self.merged_counts.end_glyph_totals),
            'prob_from_start': prob_from_start,
            'prob_from_end': prob_from_end,
            'asymmetry': {g: v for g, v in asymmetry.items()},
            'top_line_start_glyphs': top_start_list,
            'top_line_end_glyphs': top_end_list,
            'asymmetry_ranking': asymmetry_ranking,
            'pages': self.pages,
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
    page_counts: dict[str, LinePositionCounts],
    name: str,
    description: str,
    filter_func: PageFilter,
) -> AggregationResult:
    """
    Aggregate line position counts for pages matching a filter.
    """
    matching_pages = [p for p in pages if filter_func(p)]
    
    counts_list = []
    page_metadata_list = []
    
    for page in matching_pages:
        if page.folio in page_counts:
            counts_list.append(page_counts[page.folio])
        
        page_metadata_list.append({
            'folio': page.folio,
            'quire': page.quire,
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
        })
    
    merged = merge_line_position_counts(counts_list)
    
    return AggregationResult(
        name=name,
        description=description,
        page_count=len(matching_pages),
        merged_counts=merged,
        pages=page_metadata_list,
    )


def run_all_aggregations(
    pages: list[Page],
    page_counts: dict[str, LinePositionCounts],
    aggregations: Optional[dict[str, tuple[str, PageFilter]]] = None,
) -> dict[str, AggregationResult]:
    """Run all standard aggregations."""
    if aggregations is None:
        aggregations = AGGREGATIONS
    
    results = {}
    for name, (description, filter_func) in aggregations.items():
        results[name] = aggregate_pages(
            pages, page_counts, name, description, filter_func
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
):
    """Save all aggregation results to separate JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for name, result in results.items():
        save_aggregation(result, output_dir / f"{name}.json")
    
    manifest = {
        'aggregations': [
            {
                'name': name,
                'description': result.description,
                'page_count': result.page_count,
                'total_words': sum(result.merged_counts.total_words_from_start.values()),
                'file': f"{name}.json",
            }
            for name, result in results.items()
        ]
    }
    with open(output_dir / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
