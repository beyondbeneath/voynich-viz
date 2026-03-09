"""
Line position effects analyzer for Voynich manuscript text.

Computes:
- P(word STARTS with glyph | word at position k from line start)
  → Identifies "line-start effects" (glyphs that prefer to START words at beginning of lines)
  
- P(word ENDS with glyph | word at position k from line end)
  → Identifies "line-end effects" (glyphs that prefer to END words at end of lines)

This semantic distinction makes sense:
- Line-start effect = a glyph prefers to BEGIN words at the START of lines
- Line-end effect = a glyph prefers to END words at the END of lines
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
from .config import MAX_WORD_POSITION


@dataclass
class LinePositionCounts:
    """Counts for line position analysis on a single page."""
    folio: str
    # Counts of words STARTING with each glyph at each position from line start
    # start_glyph_from_start[glyph][k] = count of words at position k that START with glyph
    start_glyph_from_start: dict = field(default_factory=lambda: defaultdict(Counter))
    # Counts of words ENDING with each glyph at each position from line end
    # end_glyph_from_end[glyph][k] = count of words at position k (from end) that END with glyph
    end_glyph_from_end: dict = field(default_factory=lambda: defaultdict(Counter))
    # Total words at each position from line start
    total_words_from_start: Counter = field(default_factory=Counter)
    # Total words at each position from line end
    total_words_from_end: Counter = field(default_factory=Counter)
    # Total word count per start glyph
    start_glyph_totals: Counter = field(default_factory=Counter)
    # Total word count per end glyph
    end_glyph_totals: Counter = field(default_factory=Counter)
    metadata: dict = field(default_factory=dict)
    
    def add_word(self, start_glyph: str, end_glyph: str, pos_from_start: int, pos_from_end: int):
        """Add a word with its starting/ending glyphs and positions."""
        k_start = min(pos_from_start, MAX_WORD_POSITION)
        k_end = min(pos_from_end, MAX_WORD_POSITION)
        
        # Track word-starting glyphs by position from line start
        self.start_glyph_from_start[start_glyph][k_start] += 1
        self.start_glyph_totals[start_glyph] += 1
        
        # Track word-ending glyphs by position from line end
        self.end_glyph_from_end[end_glyph][k_end] += 1
        self.end_glyph_totals[end_glyph] += 1
        
        # Track totals
        self.total_words_from_start[k_start] += 1
        self.total_words_from_end[k_end] += 1
    
    def get_start_charset(self) -> set[str]:
        """Get all glyphs that appear as word starters."""
        return set(self.start_glyph_totals.keys())
    
    def get_end_charset(self) -> set[str]:
        """Get all glyphs that appear as word endings."""
        return set(self.end_glyph_totals.keys())
    
    def get_charset(self) -> set[str]:
        """Get all glyphs (union of start and end)."""
        return self.get_start_charset() | self.get_end_charset()
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'folio': self.folio,
            'metadata': self.metadata,
            'start_glyph_from_start': {g: dict(c) for g, c in self.start_glyph_from_start.items()},
            'end_glyph_from_end': {g: dict(c) for g, c in self.end_glyph_from_end.items()},
            'total_words_from_start': dict(self.total_words_from_start),
            'total_words_from_end': dict(self.total_words_from_end),
            'start_glyph_totals': dict(self.start_glyph_totals),
            'end_glyph_totals': dict(self.end_glyph_totals),
        }


def extract_words_from_line(
    line: Line,
    collapse_mode: CollapseMode,
) -> list[str]:
    """
    Extract words from a line, returning list of normalized word strings.
    """
    normalized = normalize_text(line.text, collapse_mode)
    filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=True)
    
    words = []
    current_word = []
    
    for char in filtered:
        if char in WORD_SEPARATORS:
            if current_word:
                words.append(''.join(current_word))
                current_word = []
        else:
            current_word.append(char)
    
    if current_word:
        words.append(''.join(current_word))
    
    return [w for w in words if w]


def analyze_page_line_positions(
    page: Page,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> LinePositionCounts:
    """
    Analyze line position effects for a single page.
    
    For each word in each line, records:
    - The starting glyph of the word (for line-start analysis)
    - The ending glyph of the word (for line-end analysis)
    - The word's position from line start (0-indexed)
    - The word's position from line end (0-indexed)
    """
    counts = LinePositionCounts(
        folio=page.folio,
        metadata={
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
            'quire': page.quire,
        }
    )
    
    for line in page.lines:
        words = extract_words_from_line(line, collapse_mode)
        
        if not words:
            continue
        
        num_words = len(words)
        
        for i, word in enumerate(words):
            if not word:
                continue
            
            start_glyph = word[0]
            end_glyph = word[-1]
            pos_from_start = i
            pos_from_end = num_words - 1 - i
            
            counts.add_word(start_glyph, end_glyph, pos_from_start, pos_from_end)
    
    return counts


def merge_line_position_counts(counts_list: list[LinePositionCounts]) -> LinePositionCounts:
    """Merge multiple LinePositionCounts into one."""
    if not counts_list:
        return LinePositionCounts(folio='merged')
    
    merged = LinePositionCounts(folio='merged')
    
    for counts in counts_list:
        for glyph, pos_counts in counts.start_glyph_from_start.items():
            for k, count in pos_counts.items():
                merged.start_glyph_from_start[glyph][k] += count
        
        for glyph, pos_counts in counts.end_glyph_from_end.items():
            for k, count in pos_counts.items():
                merged.end_glyph_from_end[glyph][k] += count
        
        merged.total_words_from_start.update(counts.total_words_from_start)
        merged.total_words_from_end.update(counts.total_words_from_end)
        merged.start_glyph_totals.update(counts.start_glyph_totals)
        merged.end_glyph_totals.update(counts.end_glyph_totals)
    
    return merged


def compute_probabilities(counts: LinePositionCounts) -> dict:
    """
    Compute probabilities from counts.
    
    Returns dict with:
    - prob_from_start[glyph][k] = P(word STARTS with glyph | position k from line start)
    - prob_from_end[glyph][k] = P(word ENDS with glyph | position k from line end)
    - asymmetry[glyph] = P(starts with glyph | first word) - P(ends with glyph | last word)
    """
    prob_from_start = {}
    prob_from_end = {}
    
    start_charset = counts.get_start_charset()
    end_charset = counts.get_end_charset()
    all_charset = start_charset | end_charset
    
    # P(word STARTS with glyph | position k from line start)
    for glyph in start_charset:
        prob_from_start[glyph] = {}
        for k in range(MAX_WORD_POSITION + 1):
            total_at_k = counts.total_words_from_start.get(k, 0)
            count_at_k = counts.start_glyph_from_start[glyph].get(k, 0)
            prob_from_start[glyph][k] = count_at_k / total_at_k if total_at_k > 0 else 0.0
    
    # P(word ENDS with glyph | position k from line end)
    for glyph in end_charset:
        prob_from_end[glyph] = {}
        for k in range(MAX_WORD_POSITION + 1):
            total_at_k = counts.total_words_from_end.get(k, 0)
            count_at_k = counts.end_glyph_from_end[glyph].get(k, 0)
            prob_from_end[glyph][k] = count_at_k / total_at_k if total_at_k > 0 else 0.0
    
    # Compute asymmetry: P(starts at first) - P(ends at last)
    # Positive = prefers line-start, Negative = prefers line-end
    asymmetry = {}
    for glyph in all_charset:
        p_start_first = prob_from_start.get(glyph, {}).get(0, 0.0)
        p_end_last = prob_from_end.get(glyph, {}).get(0, 0.0)
        asymmetry[glyph] = p_start_first - p_end_last
    
    return {
        'prob_from_start': prob_from_start,
        'prob_from_end': prob_from_end,
        'asymmetry': asymmetry,
    }


if __name__ == '__main__':
    from common.parser import parse_transcription
    
    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <transcription_file>")
        sys.exit(1)
    
    pages = parse_transcription(sys.argv[1])
    
    # Analyze all pages
    all_counts = []
    for page in pages:
        counts = analyze_page_line_positions(page, CollapseMode.DISTINCT)
        all_counts.append(counts)
    
    # Merge
    merged = merge_line_position_counts(all_counts)
    probs = compute_probabilities(merged)
    
    print(f"Total start glyphs: {len(merged.get_start_charset())}")
    print(f"Total end glyphs: {len(merged.get_end_charset())}")
    print(f"Total words: {sum(merged.total_words_from_start.values())}")
    
    # Show top line-start preferring glyphs
    asymmetry = probs['asymmetry']
    sorted_by_start = sorted(asymmetry.items(), key=lambda x: -x[1])[:5]
    print("\nTop line-START preferring glyphs (high P(starts first word)):")
    for glyph, asym in sorted_by_start:
        p_start = probs['prob_from_start'].get(glyph, {}).get(0, 0) * 100
        p_end = probs['prob_from_end'].get(glyph, {}).get(0, 0) * 100
        print(f"  {glyph}: starts_first={p_start:.2f}%, ends_last={p_end:.2f}%, diff={asym*100:+.2f}pp")
    
    # Show top line-end preferring glyphs
    sorted_by_end = sorted(asymmetry.items(), key=lambda x: x[1])[:5]
    print("\nTop line-END preferring glyphs (high P(ends last word)):")
    for glyph, asym in sorted_by_end:
        p_start = probs['prob_from_start'].get(glyph, {}).get(0, 0) * 100
        p_end = probs['prob_from_end'].get(glyph, {}).get(0, 0) * 100
        print(f"  {glyph}: starts_first={p_start:.2f}%, ends_last={p_end:.2f}%, diff={asym*100:+.2f}pp")
