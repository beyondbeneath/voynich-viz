"""
Configuration for line position effects analysis.
"""

from dataclasses import dataclass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode

# Maximum word position to track (0 to MAX_WORD_POSITION)
MAX_WORD_POSITION = 10


@dataclass
class LineposConfig:
    """Configuration for line position effects analysis."""
    collapse_mode: CollapseMode = CollapseMode.DISTINCT
    max_word_position: int = MAX_WORD_POSITION
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'collapse_mode': self.collapse_mode.value,
            'max_word_position': self.max_word_position,
        }
