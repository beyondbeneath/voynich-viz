"""
Configuration for word position analysis.
"""

from dataclasses import dataclass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from common.config import CollapseMode


@dataclass
class WordPosConfig:
    """Configuration for word position analysis."""
    
    collapse_mode: CollapseMode = CollapseMode.DISTINCT
    min_word_length: int = 1  # Minimum word length to consider
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'collapse_mode': self.collapse_mode.value,
            'min_word_length': self.min_word_length,
        }
