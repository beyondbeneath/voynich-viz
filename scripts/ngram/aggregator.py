"""
Aggregator for Voynich manuscript n-gram counts.

Sums n-gram counts across pages filtered by various criteria.
"""

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import Page
from .analyzer import NgramCounts, PageNgramCounts, build_bigram_matrix


@dataclass
class AggregationResult:
    """Result of aggregating n-gram counts."""
    name: str
    description: str
    page_count: int
    counts: NgramCounts
    
    def to_dict(self, min_count: int = 1) -> dict:
        """Convert to JSON-serializable dict."""
        base = self.counts.to_dict(min_count)
        base.update({
            'name': self.name,
            'description': self.description,
            'page_count': self.page_count,
        })
        
        # Add bigram matrix for visualization
        base['bigram_matrix'] = build_bigram_matrix(self.counts)
        
        return base


PageFilter = Callable[[Page], bool]


def make_language_filter(lang: str) -> PageFilter:
    return lambda p: p.language == lang


def make_hand_filter(hand: str) -> PageFilter:
    return lambda p: p.hand == hand


def make_illustration_filter(illust: str) -> PageFilter:
    return lambda p: p.illustration == illust


def make_quire_filter(quire: str) -> PageFilter:
    return lambda p: p.quire == quire


def make_combined_filter(*filters: PageFilter) -> PageFilter:
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
    page_ngrams: dict[str, PageNgramCounts],
    name: str,
    description: str,
    filter_func: PageFilter,
) -> AggregationResult:
    """Aggregate n-gram counts for pages matching a filter."""
    matching_pages = [p for p in pages if filter_func(p)]
    
    merged_counts = NgramCounts()
    
    for page in matching_pages:
        if page.folio in page_ngrams:
            merged_counts.merge(page_ngrams[page.folio].counts)
    
    return AggregationResult(
        name=name,
        description=description,
        page_count=len(matching_pages),
        counts=merged_counts,
    )


def run_all_aggregations(
    pages: list[Page],
    page_ngrams: dict[str, PageNgramCounts],
    aggregations: Optional[dict[str, tuple[str, PageFilter]]] = None,
) -> dict[str, AggregationResult]:
    """Run all standard aggregations."""
    if aggregations is None:
        aggregations = AGGREGATIONS
    
    results = {}
    for name, (description, filter_func) in aggregations.items():
        results[name] = aggregate_pages(
            pages, page_ngrams, name, description, filter_func
        )
    
    return results


def save_aggregation(result: AggregationResult, output_path: Path, min_count: int = 1):
    """Save an aggregation result to JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result.to_dict(min_count), f, indent=2)


def save_all_aggregations(
    results: dict[str, AggregationResult],
    output_dir: Path,
    min_count: int = 1,
):
    """Save all aggregation results to separate JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for name, result in results.items():
        save_aggregation(result, output_dir / f"{name}.json", min_count)
    
    # Save manifest
    manifest = {
        'aggregations': [
            {
                'name': name,
                'description': result.description,
                'page_count': result.page_count,
                'word_count': result.counts.total_words,
                'file': f"{name}.json",
            }
            for name, result in results.items()
        ]
    }
    with open(output_dir / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)


def save_page_ngrams(
    page_ngrams: dict[str, PageNgramCounts],
    output_path: Path,
    config: Optional[dict] = None,
    min_count: int = 1,
):
    """Save all page n-gram counts to a single JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        'pages': [pc.to_dict(min_count) for pc in page_ngrams.values()],
        'config': config or {},
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
