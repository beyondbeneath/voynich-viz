"""
Word position analyzer for Voynich manuscript text.

Analyzes character preferences for word positions:
- Start: First character of a word
- Middle: Characters not at start or end (only for words >= 3 chars)
- End: Last character of a word
- Only: Single-character words

Also analyzes multi-character sequences (bigrams, i/e variants).
"""

from collections import Counter
from dataclasses import dataclass, field
from typing import Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import Page
from common.normalizer import (
    normalize_text,
    filter_to_valid_chars,
    get_words,
    CollapseMode,
)


@dataclass
class PositionCounts:
    """Counts of character occurrences by word position."""
    start: Counter = field(default_factory=Counter)
    middle: Counter = field(default_factory=Counter)
    end: Counter = field(default_factory=Counter)
    only: Counter = field(default_factory=Counter)  # Single-char words
    total: Counter = field(default_factory=Counter)
    
    def add_word(self, word: str):
        """Analyze a word and count character positions."""
        if not word:
            return
        
        chars = list(word)
        n = len(chars)
        
        if n == 1:
            self.only[chars[0]] += 1
            self.total[chars[0]] += 1
        elif n == 2:
            self.start[chars[0]] += 1
            self.end[chars[1]] += 1
            self.total[chars[0]] += 1
            self.total[chars[1]] += 1
        else:
            self.start[chars[0]] += 1
            self.end[chars[-1]] += 1
            self.total[chars[0]] += 1
            self.total[chars[-1]] += 1
            for char in chars[1:-1]:
                self.middle[char] += 1
                self.total[char] += 1
    
    def merge(self, other: 'PositionCounts'):
        """Merge another PositionCounts into this one."""
        self.start.update(other.start)
        self.middle.update(other.middle)
        self.end.update(other.end)
        self.only.update(other.only)
        self.total.update(other.total)
    
    def get_charset(self) -> list[str]:
        """Get sorted list of all characters."""
        chars = set(self.total.keys())
        return sorted(chars)
    
    def get_position_ratios(self, char: str) -> dict[str, float]:
        """Get position ratios for a character (each position / total)."""
        total = self.total.get(char, 0)
        if total == 0:
            return {'start': 0, 'middle': 0, 'end': 0, 'only': 0}
        
        return {
            'start': self.start.get(char, 0) / total,
            'middle': self.middle.get(char, 0) / total,
            'end': self.end.get(char, 0) / total,
            'only': self.only.get(char, 0) / total,
        }
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        charset = self.get_charset()
        
        # Compute ratios for each character
        char_data = {}
        for char in charset:
            ratios = self.get_position_ratios(char)
            char_data[char] = {
                'start': self.start.get(char, 0),
                'middle': self.middle.get(char, 0),
                'end': self.end.get(char, 0),
                'only': self.only.get(char, 0),
                'total': self.total.get(char, 0),
                'ratios': ratios,
            }
        
        # Also compute position totals
        position_totals = {
            'start': sum(self.start.values()),
            'middle': sum(self.middle.values()),
            'end': sum(self.end.values()),
            'only': sum(self.only.values()),
            'total': sum(self.total.values()),
        }
        
        return {
            'charset': charset,
            'characters': char_data,
            'position_totals': position_totals,
        }


@dataclass
class PagePositionCounts:
    """Position counts for a single page."""
    folio: str
    counts: PositionCounts = field(default_factory=PositionCounts)
    word_count: int = 0
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'folio': self.folio,
            'word_count': self.word_count,
            'metadata': self.metadata,
            **self.counts.to_dict(),
        }


def analyze_page_positions(
    page: Page,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
    min_word_length: int = 1,
) -> PagePositionCounts:
    """
    Analyze word positions for all characters on a page.
    
    Args:
        page: Page object from parser
        collapse_mode: Normalization mode
        min_word_length: Minimum word length to include
        
    Returns:
        PagePositionCounts object
    """
    result = PagePositionCounts(
        folio=page.folio,
        metadata={
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
            'quire': page.quire,
        }
    )
    
    for line in page.lines:
        words = get_words(line.text, collapse_mode)
        
        for word in words:
            if len(word) >= min_word_length:
                result.counts.add_word(word)
                result.word_count += 1
    
    return result


def analyze_text_positions(
    text: str,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
    min_word_length: int = 1,
) -> PositionCounts:
    """
    Analyze word positions in a text string.
    
    Args:
        text: Raw text
        collapse_mode: Normalization mode
        min_word_length: Minimum word length to include
        
    Returns:
        PositionCounts object
    """
    counts = PositionCounts()
    words = get_words(text, collapse_mode)
    
    for word in words:
        if len(word) >= min_word_length:
            counts.add_word(word)
    
    return counts


if __name__ == '__main__':
    from common.parser import parse_transcription
    
    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <transcription_file>")
        sys.exit(1)
    
    pages = parse_transcription(sys.argv[1])
    
    # Test on first page
    page = pages[0]
    result = analyze_page_positions(page, CollapseMode.DISTINCT)
    
    print(f"Page {result.folio}:")
    print(f"  Word count: {result.word_count}")
    print(f"  Charset size: {len(result.counts.get_charset())}")
    
    # Show position preferences for common characters
    print("\n  Position ratios (start/middle/end/only):")
    for char in result.counts.total.most_common(10):
        c = char[0]
        ratios = result.counts.get_position_ratios(c)
        print(f"    {c}: {ratios['start']:.2%} / {ratios['middle']:.2%} / {ratios['end']:.2%} / {ratios['only']:.2%}")
