"""
Markov-specific configuration for transition analysis.

Method-specific settings only. Shared config (char ordering, boundaries,
aggregations) is in common/config.py.
"""

from dataclasses import dataclass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import (
    CollapseMode, 
    ProcessingConfig,
    # Re-export boundary tokens for backwards compatibility
    WORD_START, WORD_END,
    LINE_START, LINE_END,
    PARA_START, PARA_END,
    PAGE_START, PAGE_END,
    BOUNDARY_TOKENS,
    BOUNDARY_DISPLAY,
    get_char_order,
    AGGREGATION_DEFINITIONS,
)

# Re-export for backwards compatibility
STANDARD_AGGREGATIONS = AGGREGATION_DEFINITIONS


@dataclass
class MarkovConfig(ProcessingConfig):
    """Configuration for Markov transition analysis."""
    
    # Boundary token settings
    include_word_boundaries: bool = True
    include_line_boundaries: bool = True
    include_para_boundaries: bool = True
    include_page_boundaries: bool = True
    
    # Output settings
    output_raw_counts: bool = True
    output_probabilities: bool = True
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        base = super().to_dict()
        base.update({
            'include_word_boundaries': self.include_word_boundaries,
            'include_line_boundaries': self.include_line_boundaries,
            'include_para_boundaries': self.include_para_boundaries,
            'include_page_boundaries': self.include_page_boundaries,
        })
        return base
