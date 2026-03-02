"""
Transition counting for Voynich manuscript text.

Computes character transition counts (bigram frequencies) per page,
with support for special boundary tokens (word/line/paragraph/page start/end).
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
    get_valid_chars,
    CollapseMode,
    WORD_SEPARATORS,
    LINE_BREAK,
    UNCERTAIN_BREAK,
)
from common.config import (
    WORD_START, WORD_END,
    LINE_START, LINE_END,
    PARA_START, PARA_END,
    PAGE_START, PAGE_END,
    BOUNDARY_TOKENS,
)


@dataclass
class TransitionCounts:
    """Transition counts for a single page."""
    folio: str
    transitions: Counter = field(default_factory=Counter)
    char_counts: Counter = field(default_factory=Counter)
    metadata: dict = field(default_factory=dict)
    
    def add_transition(self, from_char: str, to_char: str, count: int = 1):
        """Add a transition from one character to another."""
        self.transitions[(from_char, to_char)] += count
    
    def add_char(self, char: str, count: int = 1):
        """Add character count."""
        self.char_counts[char] += count
    
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
            'char_counts': dict(self.char_counts),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'TransitionCounts':
        """Create from JSON dict."""
        tc = cls(folio=data['folio'], metadata=data.get('metadata', {}))
        for key, count in data.get('transitions', {}).items():
            from_char, to_char = key.split('|')
            tc.transitions[(from_char, to_char)] = count
        tc.char_counts = Counter(data.get('char_counts', {}))
        return tc


def count_transitions_in_text(
    text: str,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
    include_word_boundaries: bool = True,
) -> tuple[Counter, Counter]:
    """
    Count character transitions in a piece of text.
    
    Args:
        text: Normalized text with word separators
        collapse_mode: Normalization mode
        include_word_boundaries: Whether to add word start/end tokens
        
    Returns:
        Tuple of (transition_counts, char_counts)
    """
    transitions = Counter()
    char_counts = Counter()
    
    # Normalize and filter
    normalized = normalize_text(text, collapse_mode)
    filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=True)
    
    # Split into words
    words = []
    current_word = []
    
    for char in filtered:
        if char in WORD_SEPARATORS or char == LINE_BREAK or char == UNCERTAIN_BREAK:
            if current_word:
                words.append(''.join(current_word))
                current_word = []
        else:
            current_word.append(char)
    
    if current_word:
        words.append(''.join(current_word))
    
    # Count transitions within and between words
    for word in words:
        if not word:
            continue
            
        chars = list(word)
        
        # Add word boundary transitions if enabled
        if include_word_boundaries and chars:
            transitions[(WORD_START, chars[0])] += 1
            transitions[(chars[-1], WORD_END)] += 1
        
        # Count character occurrences
        for char in chars:
            char_counts[char] += 1
        
        # Count internal transitions
        for i in range(len(chars) - 1):
            transitions[(chars[i], chars[i + 1])] += 1
    
    return transitions, char_counts


def count_page_transitions(
    page: Page,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
    include_word_boundaries: bool = True,
    include_line_boundaries: bool = True,
    include_para_boundaries: bool = True,
    include_page_boundaries: bool = True,
) -> TransitionCounts:
    """
    Count all transitions for a page.
    
    Args:
        page: Page object from parser
        collapse_mode: Normalization mode
        include_*_boundaries: Whether to include various boundary tokens
        
    Returns:
        TransitionCounts object
    """
    tc = TransitionCounts(
        folio=page.folio,
        metadata={
            'language': page.language,
            'hand': page.hand,
            'illustration': page.illustration,
            'quire': page.quire,
        }
    )
    
    prev_line_last_char: Optional[str] = None
    prev_para_last_char: Optional[str] = None
    page_first_char_seen = False
    
    for line_idx, line in enumerate(page.lines):
        # Get transitions for this line
        line_transitions, line_chars = count_transitions_in_text(
            line.text, collapse_mode, include_word_boundaries
        )
        
        # Merge into page counts
        tc.transitions.update(line_transitions)
        tc.char_counts.update(line_chars)
        
        # Get first and last char of line (excluding boundaries)
        normalized = normalize_text(line.text, collapse_mode)
        filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=False)
        
        if not filtered:
            continue
            
        line_first_char = filtered[0]
        line_last_char = filtered[-1]
        
        # Page start boundary
        if include_page_boundaries and not page_first_char_seen:
            tc.add_transition(PAGE_START, line_first_char)
            page_first_char_seen = True
        
        # Paragraph start boundary
        if include_para_boundaries and line.is_para_start:
            tc.add_transition(PARA_START, line_first_char)
        
        # Line start boundary
        if include_line_boundaries:
            tc.add_transition(LINE_START, line_first_char)
            tc.add_transition(line_last_char, LINE_END)
        
        # Paragraph end boundary
        if include_para_boundaries and line.is_para_end:
            tc.add_transition(line_last_char, PARA_END)
    
    # Page end boundary (last char of last line)
    if include_page_boundaries and page.lines:
        last_line = page.lines[-1]
        normalized = normalize_text(last_line.text, collapse_mode)
        filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=False)
        if filtered:
            tc.add_transition(filtered[-1], PAGE_END)
    
    return tc


def merge_transition_counts(counts_list: list[TransitionCounts]) -> TransitionCounts:
    """
    Merge multiple TransitionCounts into one.
    
    Used for aggregating across pages.
    """
    if not counts_list:
        return TransitionCounts(folio='merged')
    
    merged = TransitionCounts(folio='merged')
    
    for tc in counts_list:
        merged.transitions.update(tc.transitions)
        merged.char_counts.update(tc.char_counts)
    
    return merged


def compute_probabilities(tc: TransitionCounts) -> dict[tuple[str, str], float]:
    """
    Compute transition probabilities (row-normalized).
    
    For each source character, probabilities sum to 1.
    """
    # Get total count for each source character
    source_totals = Counter()
    for (from_char, to_char), count in tc.transitions.items():
        source_totals[from_char] += count
    
    # Compute probabilities
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
    
    # Test on first page
    page = pages[0]
    tc = count_page_transitions(page, CollapseMode.DISTINCT)
    
    print(f"Page {tc.folio}:")
    print(f"  Metadata: {tc.metadata}")
    print(f"  Total transitions: {sum(tc.transitions.values())}")
    print(f"  Unique transitions: {len(tc.transitions)}")
    print(f"  Charset size: {len(tc.get_charset())}")
    
    # Show top transitions
    print("\n  Top 10 transitions:")
    for (from_char, to_char), count in tc.transitions.most_common(10):
        print(f"    {from_char} -> {to_char}: {count}")
    
    # Show top characters
    print("\n  Top 10 characters:")
    for char, count in tc.char_counts.most_common(10):
        print(f"    {char}: {count}")
