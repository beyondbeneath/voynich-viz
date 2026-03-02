"""
Common configuration for Voynich manuscript processing.

Contains character sets, bigram rules, section definitions, and other
shared configurable parameters used across different analysis types.

This is the SINGLE SOURCE OF TRUTH for transcription config.
The web visualizations load this config from docs/output/transcription_config.json.
"""

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable, Optional


class CollapseMode(Enum):
    """Mode for collapsing repeated i/e characters."""
    DISTINCT = "distinct"  # ii->2, iii->3, iiii->4
    COLLAPSED = "collapsed"  # all i* -> I, all e* -> E


@dataclass
class ProcessingConfig:
    """Base configuration for text processing."""
    
    collapse_mode: CollapseMode = CollapseMode.DISTINCT
    lowercase_first: bool = True
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'collapse_mode': self.collapse_mode.value,
            'lowercase_first': self.lowercase_first,
        }


# Valid character sets
VALID_CHARS_DISTINCT = {
    'p', 'f', 't', 'k', 'd', 'j', 'm', 'n', 'g', 's', 'r', 'y', 'l', 'o', 'a',
    'C', 'S', 'T', 'P', 'F', 'K',  # bigrams
    'q', 'x',
    '1', '2', '3', '4',  # i variants
    '6', '7', '8', '9',  # e variants
}

VALID_CHARS_COLLAPSED = {
    'p', 'f', 't', 'k', 'd', 'j', 'm', 'n', 'g', 's', 'r', 'y', 'l', 'o', 'a',
    'C', 'S', 'T', 'P', 'F', 'K',  # bigrams
    'q', 'x',
    'I', 'E',  # collapsed i/e
}

# Word/line separators
WORD_SEPARATORS = {'.', ','}
LINE_BREAK = '/'
UNCERTAIN_BREAK = '\\'


# Section type definitions based on illustration type ($I)
ILLUSTRATION_TYPES = {
    'T': 'Text only',
    'H': 'Herbal',
    'Z': 'Zodiac',
    'B': 'Biological',
    'P': 'Pharmaceutical',
    'A': 'Astronomical',
    'C': 'Cosmological',
    'S': 'Stars',  # text with marginal stars
}


# Quire letter to number mapping
QUIRE_MAPPING = {
    'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
    'I': 9, 'J': 10, 'K': 11, 'L': 12, 'M': 13, 'N': 14, 'O': 15, 'P': 16,
    'Q': 17, 'R': 18, 'S': 19, 'T': 20,
}


# =============================================================================
# CHARACTER DISPLAY AND ORDERING
# =============================================================================

# Display expansions for UI (internal code -> human readable)
CHAR_DISPLAY = {
    'C': 'ch', 'S': 'sh', 'T': 'cth', 'P': 'cph', 'F': 'cfh', 'K': 'ckh',
    '1': 'i', '2': 'ii', '3': 'iii', '4': 'iiii',
    '6': 'e', '7': 'ee', '8': 'eee', '9': 'eeee',
}

# Backwards compatibility alias
DISPLAY_EXPANSIONS = CHAR_DISPLAY


def get_char_order(collapse_mode: CollapseMode = CollapseMode.DISTINCT, 
                   include_boundaries: bool = False) -> list[str]:
    """
    Get canonical character ordering for matrix/chart display.
    
    This ordering is used by all visualizations to ensure consistent
    presentation across tools.
    """
    if collapse_mode == CollapseMode.DISTINCT:
        chars = [
            # Consonants
            'p', 'f', 't', 'k', 'd', 'j', 'm', 'n', 'g', 's', 'r', 'y', 'l', 'q', 'x',
            # Bigrams
            'C', 'S', 'T', 'P', 'F', 'K',
            # Vowels
            'o', 'a',
            # i variants
            '1', '2', '3', '4',
            # e variants
            '6', '7', '8', '9',
        ]
    else:
        chars = [
            # Consonants
            'p', 'f', 't', 'k', 'd', 'j', 'm', 'n', 'g', 's', 'r', 'y', 'l', 'q', 'x',
            # Bigrams
            'C', 'S', 'T', 'P', 'F', 'K',
            # Vowels
            'o', 'a', 'I', 'E',
        ]
    
    if include_boundaries:
        chars.extend([
            WORD_START, WORD_END,
            LINE_START, LINE_END,
            PARA_START, PARA_END,
            PAGE_START, PAGE_END,
        ])
    
    return chars


# =============================================================================
# BOUNDARY TOKENS
# =============================================================================

WORD_START = '^'
WORD_END = '$'
LINE_START = '^^'
LINE_END = '$$'
PARA_START = '^^^'
PARA_END = '$$$'
PAGE_START = '^^^^'
PAGE_END = '$$$$'

BOUNDARY_TOKENS = {
    WORD_START, WORD_END,
    LINE_START, LINE_END,
    PARA_START, PARA_END,
    PAGE_START, PAGE_END,
}

BOUNDARY_DISPLAY = {
    WORD_START: {'name': 'Word Start', 'short': 'WORD▸'},
    WORD_END: {'name': 'Word End', 'short': '◂WORD'},
    LINE_START: {'name': 'Line Start', 'short': 'LINE▸'},
    LINE_END: {'name': 'Line End', 'short': '◂LINE'},
    PARA_START: {'name': 'Paragraph Start', 'short': 'PARA▸'},
    PARA_END: {'name': 'Paragraph End', 'short': '◂PARA'},
    PAGE_START: {'name': 'Page Start', 'short': 'PAGE▸'},
    PAGE_END: {'name': 'Page End', 'short': '◂PAGE'},
}


# =============================================================================
# AGGREGATION DEFINITIONS
# =============================================================================

# These define how pages can be grouped for analysis.
# Used by all analysis methods (markov, ngram, wordpos).
AGGREGATION_DEFINITIONS = {
    'all': {
        'description': 'All pages',
        'filter': {},
    },
    'language_a': {
        'description': 'Currier Language A',
        'filter': {'language': 'A'},
    },
    'language_b': {
        'description': 'Currier Language B',
        'filter': {'language': 'B'},
    },
    'hand_1': {
        'description': 'Hand 1',
        'filter': {'hand': '1'},
    },
    'hand_2': {
        'description': 'Hand 2',
        'filter': {'hand': '2'},
    },
    'hand_3': {
        'description': 'Hand 3',
        'filter': {'hand': '3'},
    },
    'hand_4': {
        'description': 'Hand 4',
        'filter': {'hand': '4'},
    },
    'hand_5': {
        'description': 'Hand 5',
        'filter': {'hand': '5'},
    },
    'herbal': {
        'description': 'Herbal section',
        'filter': {'illustration': 'H'},
    },
    'zodiac': {
        'description': 'Zodiac section',
        'filter': {'illustration': 'Z'},
    },
    'biological': {
        'description': 'Biological section',
        'filter': {'illustration': 'B'},
    },
    'pharmaceutical': {
        'description': 'Pharmaceutical section',
        'filter': {'illustration': 'P'},
    },
    'astronomical': {
        'description': 'Astronomical section',
        'filter': {'illustration': 'A'},
    },
    'cosmological': {
        'description': 'Cosmological section',
        'filter': {'illustration': 'C'},
    },
    'text_only': {
        'description': 'Text only pages',
        'filter': {'illustration': 'T'},
    },
    'herbal_lang_a': {
        'description': 'Herbal section, Language A',
        'filter': {'illustration': 'H', 'language': 'A'},
    },
    'herbal_lang_b': {
        'description': 'Herbal section, Language B',
        'filter': {'illustration': 'H', 'language': 'B'},
    },
    'biological_lang_a': {
        'description': 'Biological section, Language A',
        'filter': {'illustration': 'B', 'language': 'A'},
    },
    'biological_lang_b': {
        'description': 'Biological section, Language B',
        'filter': {'illustration': 'B', 'language': 'B'},
    },
    'quire_13': {
        'description': 'Quire 13',
        'filter': {'quire': 13},
    },
    'quire_20': {
        'description': 'Quire 20',
        'filter': {'quire': 20},
    },
}

# Defines the display order for aggregations in methodology (grouped by type)
AGGREGATION_ORDER = [
    # All
    'all',
    # By language
    'language_a',
    'language_b',
    # By hand
    'hand_1',
    'hand_2',
    'hand_3',
    'hand_4',
    'hand_5',
    # By illustration
    'herbal',
    'zodiac',
    'biological',
    'pharmaceutical',
    'astronomical',
    'cosmological',
    'text_only',
    # By quire
    'quire_13',
    'quire_20',
    # Combined filters
    'herbal_lang_a',
    'herbal_lang_b',
    'biological_lang_a',
    'biological_lang_b',
]


# =============================================================================
# TRANSCRIPTION CONFIG OUTPUT
# =============================================================================

def build_transcription_config(collapse_mode: CollapseMode = CollapseMode.DISTINCT) -> dict:
    """
    Build the complete transcription config for web visualizations.
    
    This is the single source of truth that JS viz code loads.
    """
    return {
        'collapse_mode': collapse_mode.value,
        'char_order': get_char_order(collapse_mode, include_boundaries=False),
        'char_order_with_boundaries': get_char_order(collapse_mode, include_boundaries=True),
        'char_display': CHAR_DISPLAY,
        'boundary_tokens': {
            token: info for token, info in BOUNDARY_DISPLAY.items()
        },
        'aggregations': AGGREGATION_DEFINITIONS,
        'illustration_types': ILLUSTRATION_TYPES,
        'valid_chars': list(VALID_CHARS_DISTINCT if collapse_mode == CollapseMode.DISTINCT 
                           else VALID_CHARS_COLLAPSED),
    }


def save_transcription_config(output_dir: Path, 
                              collapse_mode: CollapseMode = CollapseMode.DISTINCT):
    """
    Save transcription config to docs/output/transcription_config.json.
    
    Called by analysis scripts after processing to ensure viz has
    up-to-date config.
    """
    config = build_transcription_config(collapse_mode)
    output_path = output_dir / 'transcription_config.json'
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)
    
    return output_path
