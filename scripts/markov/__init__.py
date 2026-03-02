"""
Markov transition analysis for Voynich manuscript.

This module computes character transition probabilities (Markov chain style)
from the manuscript transcription, tracking transitions at structural boundaries
(word, line, paragraph, page start/end markers).
"""

from .transitions import (
    TransitionCounts,
    count_page_transitions,
    count_transitions_in_text,
    merge_transition_counts,
    compute_probabilities,
)

from .aggregator import (
    AggregationResult,
    aggregate_pages,
    run_all_aggregations,
    save_aggregation,
    save_all_aggregations,
    save_page_transitions,
    AGGREGATIONS,
)

from .config import (
    MarkovConfig,
    STANDARD_AGGREGATIONS,
    get_char_order,
    # Re-exported from common
    BOUNDARY_TOKENS,
    BOUNDARY_DISPLAY,
    WORD_START, WORD_END,
    LINE_START, LINE_END,
    PARA_START, PARA_END,
    PAGE_START, PAGE_END,
)

__all__ = [
    # Transitions
    'TransitionCounts', 'count_page_transitions', 'count_transitions_in_text',
    'merge_transition_counts', 'compute_probabilities',
    'BOUNDARY_TOKENS', 'BOUNDARY_DISPLAY',
    'WORD_START', 'WORD_END', 'LINE_START', 'LINE_END',
    'PARA_START', 'PARA_END', 'PAGE_START', 'PAGE_END',
    # Aggregator
    'AggregationResult', 'aggregate_pages', 'run_all_aggregations',
    'save_aggregation', 'save_all_aggregations', 'save_page_transitions',
    'AGGREGATIONS',
    # Config
    'MarkovConfig', 'STANDARD_AGGREGATIONS', 'get_char_order',
]
