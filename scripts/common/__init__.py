"""
Common utilities for Voynich manuscript analysis.

This module provides shared functionality used across different analysis types:
- parser: IVTFF format parsing for transcription files
- normalizer: Character normalization (bigram collapsing, i/e sequences)
- config: Common configuration and character sets
"""

from .parser import Page, Line, parse_transcription, get_page_text, get_all_text
from .normalizer import (
    CollapseMode,
    normalize_text,
    filter_to_valid_chars,
    get_valid_chars,
    get_words,
    tokenize,
    expand_char_for_display,
    BIGRAM_TO_SINGLE,
    SINGLE_TO_BIGRAM,
)
from .config import (
    ProcessingConfig,
    VALID_CHARS_DISTINCT,
    VALID_CHARS_COLLAPSED,
    WORD_SEPARATORS,
    LINE_BREAK,
    UNCERTAIN_BREAK,
    ILLUSTRATION_TYPES,
    QUIRE_MAPPING,
)

__all__ = [
    # Parser
    'Page', 'Line', 'parse_transcription', 'get_page_text', 'get_all_text',
    # Normalizer
    'CollapseMode', 'normalize_text', 'filter_to_valid_chars', 'get_valid_chars',
    'get_words', 'tokenize', 'expand_char_for_display',
    'BIGRAM_TO_SINGLE', 'SINGLE_TO_BIGRAM',
    # Config
    'ProcessingConfig', 'VALID_CHARS_DISTINCT', 'VALID_CHARS_COLLAPSED',
    'WORD_SEPARATORS', 'LINE_BREAK', 'UNCERTAIN_BREAK',
    'ILLUSTRATION_TYPES', 'QUIRE_MAPPING',
]
