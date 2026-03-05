"""
Character position analyzer for Voynich manuscript text.

Analyzes two types of positional preferences:
1. Word position: For N-character words, which position (1-N) does each character prefer?
2. Line position: For N-word lines, which word position (1-N) does each character prefer?
"""

from collections import Counter, defaultdict
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
class CharPositionCounts:
    """
    Counts of character occurrences by position within words/lines of different lengths.
    
    word_position[char][word_length] = [count_pos1, count_pos2, ..., count_posN]
    line_position[char][line_length] = [count_word1, count_word2, ..., count_wordN]
    """
    max_word_length: int = 7
    max_line_length: int = 7
    
    # word_position[char][word_length] = list of counts by position (0-indexed)
    word_position: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(lambda: [])))
    
    # line_position[char][line_length] = list of counts by word position (0-indexed)
    line_position: dict = field(default_factory=lambda: defaultdict(lambda: defaultdict(lambda: [])))
    
    # Total counts per character
    total: Counter = field(default_factory=Counter)
    
    def add_word(self, word: str):
        """Analyze a word and count character positions by word length."""
        if not word:
            return
        
        chars = list(word)
        n = len(chars)
        
        if n > self.max_word_length:
            n = self.max_word_length
            chars = chars[:n]
        
        # Ensure we have the right size list for this word length
        for i, char in enumerate(chars):
            # Initialize list if needed
            if len(self.word_position[char][n]) < n:
                self.word_position[char][n] = [0] * n
            
            self.word_position[char][n][i] += 1
            self.total[char] += 1
    
    def add_line(self, words: list[str]):
        """Analyze a line and count character occurrences by word position."""
        if not words:
            return
        
        n = len(words)
        if n > self.max_line_length:
            n = self.max_line_length
            words = words[:n]
        
        for word_idx, word in enumerate(words):
            for char in word:
                # Initialize list if needed
                if len(self.line_position[char][n]) < n:
                    self.line_position[char][n] = [0] * n
                
                self.line_position[char][n][word_idx] += 1
    
    def merge(self, other: 'CharPositionCounts'):
        """Merge another CharPositionCounts into this one."""
        # Merge word positions
        for char, lengths in other.word_position.items():
            for length, counts in lengths.items():
                if len(self.word_position[char][length]) < length:
                    self.word_position[char][length] = [0] * length
                for i, count in enumerate(counts):
                    self.word_position[char][length][i] += count
        
        # Merge line positions
        for char, lengths in other.line_position.items():
            for length, counts in lengths.items():
                if len(self.line_position[char][length]) < length:
                    self.line_position[char][length] = [0] * length
                for i, count in enumerate(counts):
                    self.line_position[char][length][i] += count
        
        self.total.update(other.total)
    
    def get_charset(self) -> list[str]:
        """Get sorted list of all characters."""
        chars = set(self.total.keys())
        return sorted(chars)
    
    def get_word_position_ratios(self, char: str) -> dict[int, list[float]]:
        """
        Get position ratios for a character within words of each length.
        Normalized across ALL lengths combined (total adds to 100%).
        Returns {word_length: [ratio_pos1, ratio_pos2, ...]}
        """
        result = {}
        char_data = self.word_position.get(char, {})
        
        # Calculate total across all word lengths
        grand_total = 0
        for length in range(1, self.max_word_length + 1):
            counts = char_data.get(length, [0] * length)
            if counts:
                grand_total += sum(counts)
        
        for length in range(1, self.max_word_length + 1):
            counts = char_data.get(length, [0] * length)
            if not counts:
                counts = [0] * length
            if grand_total > 0:
                result[length] = [c / grand_total for c in counts]
            else:
                result[length] = [0.0] * length
        
        return result
    
    def get_line_position_ratios(self, char: str) -> dict[int, list[float]]:
        """
        Get position ratios for a character within lines of each length.
        Normalized across ALL lengths combined (total adds to 100%).
        Returns {line_length: [ratio_word1, ratio_word2, ...]}
        """
        result = {}
        char_data = self.line_position.get(char, {})
        
        # Calculate total across all line lengths
        grand_total = 0
        for length in range(1, self.max_line_length + 1):
            counts = char_data.get(length, [0] * length)
            if counts:
                grand_total += sum(counts)
        
        for length in range(1, self.max_line_length + 1):
            counts = char_data.get(length, [0] * length)
            if not counts:
                counts = [0] * length
            if grand_total > 0:
                result[length] = [c / grand_total for c in counts]
            else:
                result[length] = [0.0] * length
        
        return result
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        charset = self.get_charset()
        
        char_data = {}
        for char in charset:
            # Word position data
            word_pos_counts = {}
            word_pos_ratios = self.get_word_position_ratios(char)
            for length in range(1, self.max_word_length + 1):
                counts = self.word_position.get(char, {}).get(length, [0] * length)
                if not counts:
                    counts = [0] * length
                word_pos_counts[length] = counts
            
            # Line position data
            line_pos_counts = {}
            line_pos_ratios = self.get_line_position_ratios(char)
            for length in range(1, self.max_line_length + 1):
                counts = self.line_position.get(char, {}).get(length, [0] * length)
                if not counts:
                    counts = [0] * length
                line_pos_counts[length] = counts
            
            char_data[char] = {
                'total': self.total.get(char, 0),
                'word_position': {
                    'counts': word_pos_counts,
                    'ratios': {k: v for k, v in word_pos_ratios.items()},
                },
                'line_position': {
                    'counts': line_pos_counts,
                    'ratios': {k: v for k, v in line_pos_ratios.items()},
                },
            }
        
        return {
            'charset': charset,
            'characters': char_data,
            'max_word_length': self.max_word_length,
            'max_line_length': self.max_line_length,
            'total_chars': sum(self.total.values()),
        }


@dataclass
class PageCharPositionCounts:
    """Character position counts for a single page."""
    folio: str
    counts: CharPositionCounts = field(default_factory=CharPositionCounts)
    word_count: int = 0
    line_count: int = 0
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'folio': self.folio,
            'word_count': self.word_count,
            'line_count': self.line_count,
            'metadata': self.metadata,
            **self.counts.to_dict(),
        }


def analyze_page_char_positions(
    page: Page,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
    max_word_length: int = 7,
    max_line_length: int = 7,
) -> PageCharPositionCounts:
    """
    Analyze character positions for all characters on a page.
    
    Args:
        page: Page object from parser
        collapse_mode: Normalization mode
        max_word_length: Maximum word length to track (default 7)
        max_line_length: Maximum line length (in words) to track (default 7)
        
    Returns:
        PageCharPositionCounts object
    """
    result = PageCharPositionCounts(
        folio=page.folio,
        counts=CharPositionCounts(
            max_word_length=max_word_length,
            max_line_length=max_line_length,
        ),
        metadata={
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
            'quire': page.quire,
        }
    )
    
    for line in page.lines:
        words = get_words(line.text, collapse_mode)
        
        if not words:
            continue
        
        result.line_count += 1
        
        # Analyze each word for word-position data
        for word in words:
            if word:
                result.counts.add_word(word)
                result.word_count += 1
        
        # Analyze the line for line-position data
        result.counts.add_line(words)
    
    return result


if __name__ == '__main__':
    from common.parser import parse_transcription
    
    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <transcription_file>")
        sys.exit(1)
    
    pages = parse_transcription(sys.argv[1])
    
    # Test on first few pages
    combined = CharPositionCounts()
    for page in pages[:10]:
        result = analyze_page_char_positions(page, CollapseMode.DISTINCT)
        combined.merge(result.counts)
    
    print(f"Analyzed {len(pages[:10])} pages")
    print(f"Charset size: {len(combined.get_charset())}")
    print(f"Total chars: {sum(combined.total.values())}")
    
    # Show word position preferences for most common characters
    print("\nWord position ratios for common characters:")
    for char, count in combined.total.most_common(5):
        ratios = combined.get_word_position_ratios(char)
        print(f"\n  {char} (total: {count}):")
        for length in [2, 3, 4, 5]:
            r = ratios.get(length, [])
            if r:
                formatted = ' '.join(f'{v:.0%}' for v in r)
                print(f"    {length}-char words: {formatted}")
