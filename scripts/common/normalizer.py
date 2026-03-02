"""
Character normalizer for Voynich manuscript text.

Handles:
- Bigram collapsing (ch->C, sh->S, cth->T, etc.)
- i/e sequence collapsing (distinct counts vs collapsed)
- Filtering to valid character set
"""

import re
from enum import Enum


class CollapseMode(Enum):
    """Mode for collapsing repeated i/e characters."""
    DISTINCT = "distinct"  # ii->2, iii->3, iiii->4
    COLLAPSED = "collapsed"  # all i* -> I, all e* -> E


# Bigram replacements (order matters - longer sequences first)
BIGRAM_TO_SINGLE = {
    'cth': 'T',
    'cph': 'P', 
    'cfh': 'F',
    'ckh': 'K',
    'ch': 'C',
    'sh': 'S',
}

# Reverse mapping for display
SINGLE_TO_BIGRAM = {v: k for k, v in BIGRAM_TO_SINGLE.items()}

# i/e collapse mappings for distinct mode
I_DISTINCT = {'iiii': '4', 'iii': '3', 'ii': '2', 'i': '1'}
E_DISTINCT = {'eeee': '9', 'eee': '8', 'ee': '7', 'e': '6'}

# i/e collapse mappings for collapsed mode
I_COLLAPSED = {'iiii': 'I', 'iii': 'I', 'ii': 'I', 'i': 'I'}
E_COLLAPSED = {'eeee': 'E', 'eee': 'E', 'ee': 'E', 'e': 'E'}

# Valid character set after normalization (distinct mode)
VALID_CHARS_DISTINCT = {
    'p', 'f', 't', 'k', 'd', 'j', 'm', 'n', 'g', 's', 'r', 'y', 'l', 'o', 'a',
    'C', 'S', 'T', 'P', 'F', 'K',  # bigrams
    'q', 'x',
    '1', '2', '3', '4',  # i variants
    '6', '7', '8', '9',  # e variants
}

# Valid character set after normalization (collapsed mode)
VALID_CHARS_COLLAPSED = {
    'p', 'f', 't', 'k', 'd', 'j', 'm', 'n', 'g', 's', 'r', 'y', 'l', 'o', 'a',
    'C', 'S', 'T', 'P', 'F', 'K',  # bigrams
    'q', 'x',
    'I', 'E',  # collapsed i/e
}

# Word/line separators that we keep track of
WORD_SEPARATORS = {'.', ','}
LINE_BREAK = '/'
UNCERTAIN_BREAK = '\\'


def normalize_text(
    text: str,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
    lowercase_first: bool = True,
) -> str:
    """
    Normalize Voynich text by applying bigram and i/e collapsing rules.
    
    Args:
        text: Raw text from parser
        collapse_mode: How to handle i/e sequences
        lowercase_first: Whether to lowercase before processing
        
    Returns:
        Normalized text with bigrams collapsed to single chars
    """
    if lowercase_first:
        text = text.lower()
    
    # Apply bigram replacements (longer sequences first)
    for bigram, single in sorted(BIGRAM_TO_SINGLE.items(), key=lambda x: -len(x[0])):
        text = text.replace(bigram, single)
    
    # Apply i/e collapsing based on mode
    if collapse_mode == CollapseMode.DISTINCT:
        i_map, e_map = I_DISTINCT, E_DISTINCT
    else:
        i_map, e_map = I_COLLAPSED, E_COLLAPSED
    
    # Apply i collapsing (longest first)
    for seq, repl in sorted(i_map.items(), key=lambda x: -len(x[0])):
        text = text.replace(seq, repl)
    
    # Apply e collapsing (longest first)  
    for seq, repl in sorted(e_map.items(), key=lambda x: -len(x[0])):
        text = text.replace(seq, repl)
    
    return text


def get_valid_chars(collapse_mode: CollapseMode = CollapseMode.DISTINCT) -> set[str]:
    """Get the valid character set for a given collapse mode."""
    if collapse_mode == CollapseMode.DISTINCT:
        return VALID_CHARS_DISTINCT.copy()
    return VALID_CHARS_COLLAPSED.copy()


def filter_to_valid_chars(
    text: str,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
    keep_separators: bool = True,
) -> str:
    """
    Filter text to only valid characters.
    
    Args:
        text: Normalized text
        collapse_mode: Which valid char set to use
        keep_separators: Whether to keep word/line separators
        
    Returns:
        Text with only valid characters (and optionally separators)
    """
    valid = get_valid_chars(collapse_mode)
    
    if keep_separators:
        valid = valid | WORD_SEPARATORS | {LINE_BREAK, UNCERTAIN_BREAK}
    
    return ''.join(c for c in text if c in valid)


def expand_char_for_display(char: str) -> str:
    """
    Expand a normalized character back to its display form.
    
    Example: 'C' -> 'ch', '2' -> 'ii'
    """
    if char in SINGLE_TO_BIGRAM:
        return SINGLE_TO_BIGRAM[char]
    
    # Expand i/e variants
    expand_map = {
        '1': 'i', '2': 'ii', '3': 'iii', '4': 'iiii',
        '6': 'e', '7': 'ee', '8': 'eee', '9': 'eeee',
    }
    return expand_map.get(char, char)


def tokenize(
    text: str,
    collapse_mode: CollapseMode = CollapseMode.DISTINCT,
) -> list[str]:
    """
    Tokenize normalized text into individual characters/tokens.
    
    This handles the fact that after normalization, each character
    is a single token (bigrams have been collapsed).
    
    Args:
        text: Normalized text
        collapse_mode: Which mode was used for normalization
        
    Returns:
        List of character tokens
    """
    # After normalization, each character is its own token
    # We just need to filter to valid chars
    normalized = normalize_text(text, collapse_mode)
    filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=True)
    return list(filtered)


def get_words(text: str, collapse_mode: CollapseMode = CollapseMode.DISTINCT) -> list[str]:
    """
    Split text into words (split on . and ,).
    
    Returns list of words, each word being a string of normalized characters.
    """
    normalized = normalize_text(text, collapse_mode)
    filtered = filter_to_valid_chars(normalized, collapse_mode, keep_separators=True)
    
    # Split on word separators
    words = re.split(r'[.,/\\]+', filtered)
    return [w for w in words if w]  # Filter empty strings


if __name__ == '__main__':
    # Test the normalizer
    test_text = "fachys.ykal.ar.ataiin.shol.shory.cthres.y.kor.sholdy"
    
    print("Original:", test_text)
    
    normalized_distinct = normalize_text(test_text, CollapseMode.DISTINCT)
    print("Normalized (distinct):", normalized_distinct)
    
    normalized_collapsed = normalize_text(test_text, CollapseMode.COLLAPSED)
    print("Normalized (collapsed):", normalized_collapsed)
    
    filtered = filter_to_valid_chars(normalized_distinct, CollapseMode.DISTINCT)
    print("Filtered:", filtered)
    
    words = get_words(test_text, CollapseMode.DISTINCT)
    print("Words:", words)
