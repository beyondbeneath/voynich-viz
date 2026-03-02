"""
Configuration for n-gram analysis.
"""

from dataclasses import dataclass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from common.config import CollapseMode


@dataclass
class NgramConfig:
    """Configuration for n-gram analysis."""
    
    collapse_mode: CollapseMode = CollapseMode.DISTINCT
    max_n: int = 3  # Maximum n-gram size (1=unigrams, 2=bigrams, 3=trigrams)
    min_count: int = 5  # Minimum count to include in output
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'collapse_mode': self.collapse_mode.value,
            'max_n': self.max_n,
            'min_count': self.min_count,
        }
