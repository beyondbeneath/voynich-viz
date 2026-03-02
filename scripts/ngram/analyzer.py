"""
N-gram analyzer for Voynich manuscript text.

Counts unigrams, bigrams, and trigrams in the text.
Unlike the Markov transition analysis, this doesn't collapse i/e sequences
for bigram counting - it counts actual character sequences.
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
class NgramCounts:
    """Counts of n-grams at various sizes."""
    unigrams: Counter = field(default_factory=Counter)
    bigrams: Counter = field(default_factory=Counter)
    trigrams: Counter = field(default_factory=Counter)
    total_chars: int = 0
    total_words: int = 0
    
    def add_word(self, word: str):
        """Analyze a word and count n-grams."""
        if not word:
            return
        
        chars = list(word)
        n = len(chars)
        self.total_chars += n
        self.total_words += 1
        
        # Unigrams
        for char in chars:
            self.unigrams[char] += 1
        
        # Bigrams
        for i in range(n - 1):
            bigram = chars[i] + chars[i + 1]
            self.bigrams[bigram] += 1
        
        # Trigrams
        for i in range(n - 2):
            trigram = chars[i] + chars[i + 1] + chars[i + 2]
            self.trigrams[trigram] += 1
    
    def merge(self, other: 'NgramCounts'):
        """Merge another NgramCounts into this one."""
        self.unigrams.update(other.unigrams)
        self.bigrams.update(other.bigrams)
        self.trigrams.update(other.trigrams)
        self.total_chars += other.total_chars
        self.total_words += other.total_words
    
    def get_top_ngrams(self, n: int, limit: int = 50, min_count: int = 1) -> list[tuple[str, int]]:
        """Get top n-grams by frequency."""
        if n == 1:
            counter = self.unigrams
        elif n == 2:
            counter = self.bigrams
        else:
            counter = self.trigrams
        
        return [(ng, count) for ng, count in counter.most_common(limit) if count >= min_count]
    
    def get_ngram_frequency(self, ngram: str) -> float:
        """Get frequency (proportion) of an n-gram."""
        n = len(ngram)
        if n == 1:
            total = sum(self.unigrams.values())
            count = self.unigrams.get(ngram, 0)
        elif n == 2:
            total = sum(self.bigrams.values())
            count = self.bigrams.get(ngram, 0)
        else:
            total = sum(self.trigrams.values())
            count = self.trigrams.get(ngram, 0)
        
        return count / total if total > 0 else 0
    
    def to_dict(self, min_count: int = 1) -> dict:
        """Convert to JSON-serializable dict."""
        # Filter by minimum count
        unigrams = {k: v for k, v in self.unigrams.items() if v >= min_count}
        bigrams = {k: v for k, v in self.bigrams.items() if v >= min_count}
        trigrams = {k: v for k, v in self.trigrams.items() if v >= min_count}
        
        # Calculate totals for frequencies
        unigram_total = sum(self.unigrams.values())
        bigram_total = sum(self.bigrams.values())
        trigram_total = sum(self.trigrams.values())
        
        return {
            'unigrams': {
                'counts': unigrams,
                'frequencies': {k: v / unigram_total for k, v in unigrams.items()} if unigram_total > 0 else {},
                'total': unigram_total,
                'unique': len(unigrams),
            },
            'bigrams': {
                'counts': bigrams,
                'frequencies': {k: v / bigram_total for k, v in bigrams.items()} if bigram_total > 0 else {},
                'total': bigram_total,
                'unique': len(bigrams),
            },
            'trigrams': {
                'counts': trigrams,
                'frequencies': {k: v / trigram_total for k, v in trigrams.items()} if trigram_total > 0 else {},
                'total': trigram_total,
                'unique': len(trigrams),
            },
            'total_chars': self.total_chars,
            'total_words': self.total_words,
        }


@dataclass
class PageNgramCounts:
    """N-gram counts for a single page."""
    folio: str
    counts: NgramCounts = field(default_factory=NgramCounts)
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self, min_count: int = 1) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'folio': self.folio,
            'metadata': self.metadata,
            **self.counts.to_dict(min_count),
        }


def analyze_page_ngrams(
    page: Page,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> PageNgramCounts:
    """
    Analyze n-grams for all text on a page.
    """
    result = PageNgramCounts(
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
            result.counts.add_word(word)
    
    return result


def analyze_text_ngrams(
    text: str,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> NgramCounts:
    """
    Analyze n-grams in a text string.
    """
    counts = NgramCounts()
    words = get_words(text, collapse_mode)
    
    for word in words:
        counts.add_word(word)
    
    return counts


def build_bigram_matrix(counts: NgramCounts, charset: list[str] = None) -> dict:
    """
    Build a 2D matrix representation of bigram counts.
    
    Returns a dict with matrix data suitable for heatmap visualization.
    """
    if charset is None:
        # Get all unique characters from bigrams
        chars = set()
        for bigram in counts.bigrams:
            chars.add(bigram[0])
            chars.add(bigram[1])
        charset = sorted(chars)
    
    total = sum(counts.bigrams.values())
    
    matrix = {
        'charset': charset,
        'counts': {},
        'frequencies': {},
    }
    
    for first in charset:
        matrix['counts'][first] = {}
        matrix['frequencies'][first] = {}
        for second in charset:
            bigram = first + second
            count = counts.bigrams.get(bigram, 0)
            matrix['counts'][first][second] = count
            matrix['frequencies'][first][second] = count / total if total > 0 else 0
    
    return matrix


if __name__ == '__main__':
    from common.parser import parse_transcription
    
    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <transcription_file>")
        sys.exit(1)
    
    pages = parse_transcription(sys.argv[1])
    
    # Test on first few pages
    total_counts = NgramCounts()
    for page in pages[:10]:
        result = analyze_page_ngrams(page, CollapseMode.DISTINCT)
        total_counts.merge(result.counts)
    
    print(f"Analyzed {total_counts.total_words} words, {total_counts.total_chars} characters")
    
    print("\nTop 10 unigrams:")
    for ng, count in total_counts.get_top_ngrams(1, 10):
        print(f"  {ng}: {count} ({total_counts.get_ngram_frequency(ng):.2%})")
    
    print("\nTop 10 bigrams:")
    for ng, count in total_counts.get_top_ngrams(2, 10):
        print(f"  {ng}: {count} ({total_counts.get_ngram_frequency(ng):.2%})")
    
    print("\nTop 10 trigrams:")
    for ng, count in total_counts.get_top_ngrams(3, 10):
        print(f"  {ng}: {count} ({total_counts.get_ngram_frequency(ng):.2%})")
