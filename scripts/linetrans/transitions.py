"""
Line transition counting for Voynich manuscript text.

Computes transitions from the last glyph of line i to the first glyph of line i+1.
"""

from collections import Counter
from dataclasses import dataclass, field
from typing import Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import Page, Line
from common.normalizer import (
    normalize_text, 
    filter_to_valid_chars, 
    CollapseMode,
)


@dataclass
class LineTransitionCounts:
    """Line transition counts for a single page."""
    folio: str
    transitions: Counter = field(default_factory=Counter)
    line_end_chars: Counter = field(default_factory=Counter)
    line_start_chars: Counter = field(default_factory=Counter)
    metadata: dict = field(default_factory=dict)
    
    def add_transition(self, from_char: str, to_char: str, count: int = 1):
        """Add a line transition from one character to another."""
        self.transitions[(from_char, to_char)] += count
    
    def get_charset(self) -> set[str]:
        """Get all characters that appear in transitions."""
        chars = set()
        for from_char, to_char in self.transitions:
            chars.add(from_char)
            chars.add(to_char)
        return chars
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'folio': self.folio,
            'metadata': self.metadata,
            'transitions': {f"{k[0]}|{k[1]}": v for k, v in self.transitions.items()},
            'line_end_chars': dict(self.line_end_chars),
            'line_start_chars': dict(self.line_start_chars),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'LineTransitionCounts':
        """Create from JSON dict."""
        tc = cls(folio=data['folio'], metadata=data.get('metadata', {}))
        for key, count in data.get('transitions', {}).items():
            from_char, to_char = key.split('|')
            tc.transitions[(from_char, to_char)] = count
        tc.line_end_chars = Counter(data.get('line_end_chars', {}))
        tc.line_start_chars = Counter(data.get('line_start_chars', {}))
        return tc


def get_line_first_last_chars(
    line: Line,
    collapse_mode: CollapseMode,
) -> tuple[Optional[str], Optional[str]]:
    """
    Get the first and last character of a line.
    
    Returns:
        Tuple of (first_char, last_char), either can be None if line is empty
    """
    normalized = normalize_text(line.text, collapse_mode)
    filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=False)
    
    if not filtered:
        return None, None
    
    return filtered[0], filtered[-1]


def count_page_line_transitions(
    page: Page,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> LineTransitionCounts:
    """
    Count line-to-line transitions for a page.
    
    For each consecutive pair of lines, records the transition from
    the last character of line i to the first character of line i+1.
    
    Args:
        page: Page object from parser
        collapse_mode: Normalization mode
        
    Returns:
        LineTransitionCounts object
    """
    tc = LineTransitionCounts(
        folio=page.folio,
        metadata={
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
            'quire': page.quire,
        }
    )
    
    prev_last_char: Optional[str] = None
    
    for line in page.lines:
        first_char, last_char = get_line_first_last_chars(line, collapse_mode)
        
        if first_char:
            tc.line_start_chars[first_char] += 1
        
        if last_char:
            tc.line_end_chars[last_char] += 1
        
        # Record transition from previous line's last char to this line's first char
        if prev_last_char is not None and first_char is not None:
            tc.add_transition(prev_last_char, first_char)
        
        # Update for next iteration
        prev_last_char = last_char
    
    return tc


def merge_line_transition_counts(counts_list: list[LineTransitionCounts]) -> LineTransitionCounts:
    """
    Merge multiple LineTransitionCounts into one.
    """
    if not counts_list:
        return LineTransitionCounts(folio='merged')
    
    merged = LineTransitionCounts(folio='merged')
    
    for tc in counts_list:
        merged.transitions.update(tc.transitions)
        merged.line_end_chars.update(tc.line_end_chars)
        merged.line_start_chars.update(tc.line_start_chars)
    
    return merged


def compute_probabilities(tc: LineTransitionCounts) -> dict[tuple[str, str], float]:
    """
    Compute transition probabilities (row-normalized).
    
    For each line-end character, probabilities sum to 1.
    """
    source_totals = Counter()
    for (from_char, to_char), count in tc.transitions.items():
        source_totals[from_char] += count
    
    probs = {}
    for (from_char, to_char), count in tc.transitions.items():
        total = source_totals[from_char]
        if total > 0:
            probs[(from_char, to_char)] = count / total
    
    return probs


if __name__ == '__main__':
    from common.parser import parse_transcription
    
    if len(sys.argv) < 2:
        print("Usage: python transitions.py <transcription_file>")
        sys.exit(1)
    
    pages = parse_transcription(sys.argv[1])
    
    # Test on first few pages
    total_transitions = 0
    for page in pages[:5]:
        tc = count_page_line_transitions(page, CollapseMode.DISTINCT)
        
        print(f"Page {tc.folio}:")
        print(f"  Total line transitions: {sum(tc.transitions.values())}")
        print(f"  Unique transitions: {len(tc.transitions)}")
        
        if tc.transitions:
            print("  Top 5 transitions:")
            for (from_char, to_char), count in tc.transitions.most_common(5):
                print(f"    {from_char} → {to_char}: {count}")
        
        total_transitions += sum(tc.transitions.values())
    
    print(f"\nTotal transitions in first 5 pages: {total_transitions}")
