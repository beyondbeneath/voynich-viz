"""
Aggregator for Voynich manuscript line transition counts.

Sums line transition counts across pages filtered by various criteria
(language, hand, section type) and outputs JSON files.
"""

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import Page
from .transitions import LineTransitionCounts, compute_probabilities


@dataclass
class AggregationResult:
    """Result of aggregating line transition counts."""
    name: str
    description: str
    page_count: int
    transitions: Counter
    line_end_chars: Counter
    line_start_chars: Counter
    pages: list
    
    def get_charset(self) -> list[str]:
        """Get sorted list of all characters in transitions."""
        chars = set()
        for from_char, to_char in self.transitions:
            chars.add(from_char)
            chars.add(to_char)
        return sorted(chars)
    
    def get_probabilities(self) -> dict[tuple[str, str], float]:
        """Get row-normalized transition probabilities."""
        source_totals = Counter()
        for (from_char, to_char), count in self.transitions.items():
            source_totals[from_char] += count
        
        probs = {}
        for (from_char, to_char), count in self.transitions.items():
            total = source_totals[from_char]
            if total > 0:
                probs[(from_char, to_char)] = count / total
        return probs
    
    def get_top_transitions(self, n: int = 10) -> list[dict]:
        """Get top N transitions by count."""
        top = []
        for (from_char, to_char), count in self.transitions.most_common(n):
            probs = self.get_probabilities()
            prob = probs.get((from_char, to_char), 0)
            top.append({
                'from': from_char,
                'to': to_char,
                'count': count,
                'probability': prob,
            })
        return top
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        probs = self.get_probabilities()
        return {
            'name': self.name,
            'description': self.description,
            'page_count': self.page_count,
            'transitions': {f"{k[0]}|{k[1]}": v for k, v in self.transitions.items()},
            'probabilities': {f"{k[0]}|{k[1]}": v for k, v in probs.items()},
            'line_end_chars': dict(self.line_end_chars),
            'line_start_chars': dict(self.line_start_chars),
            'charset': self.get_charset(),
            'top_transitions': self.get_top_transitions(20),
            'total_transitions': sum(self.transitions.values()),
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
    page_transitions: dict[str, LineTransitionCounts],
    name: str,
    description: str,
    filter_func: PageFilter,
) -> AggregationResult:
    """
    Aggregate line transition counts for pages matching a filter.
    """
    matching_pages = [p for p in pages if filter_func(p)]
    
    merged_transitions = Counter()
    merged_end_chars = Counter()
    merged_start_chars = Counter()
    
    page_metadata_list = []
    
    for page in matching_pages:
        if page.folio in page_transitions:
            tc = page_transitions[page.folio]
            merged_transitions.update(tc.transitions)
            merged_end_chars.update(tc.line_end_chars)
            merged_start_chars.update(tc.line_start_chars)
        
        page_metadata_list.append({
            'folio': page.folio,
            'quire': page.quire,
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
        })
    
    return AggregationResult(
        name=name,
        description=description,
        page_count=len(matching_pages),
        transitions=merged_transitions,
        line_end_chars=merged_end_chars,
        line_start_chars=merged_start_chars,
        pages=page_metadata_list,
    )


def run_all_aggregations(
    pages: list[Page],
    page_transitions: dict[str, LineTransitionCounts],
    aggregations: Optional[dict[str, tuple[str, PageFilter]]] = None,
) -> dict[str, AggregationResult]:
    """Run all standard aggregations."""
    if aggregations is None:
        aggregations = AGGREGATIONS
    
    results = {}
    for name, (description, filter_func) in aggregations.items():
        results[name] = aggregate_pages(
            pages, page_transitions, name, description, filter_func
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
                'total_transitions': sum(result.transitions.values()),
                'file': f"{name}.json",
            }
            for name, result in results.items()
        ]
    }
    with open(output_dir / 'manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)


def save_page_transitions(
    page_transitions: dict[str, LineTransitionCounts],
    output_path: Path,
    config: Optional[dict] = None,
):
    """Save all page transitions to a single JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        'pages': [tc.to_dict() for tc in page_transitions.values()],
        'config': config or {},
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
