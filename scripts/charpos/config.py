"""
Configuration for character position analysis.
"""

from dataclasses import dataclass, field
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode


@dataclass
class CharPosConfig:
    """Configuration for character position analysis."""
    
    collapse_mode: CollapseMode = CollapseMode.DISTINCT
    max_word_length: int = 9
    max_line_length: int = 12
    min_word_length: int = 1
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'collapse_mode': self.collapse_mode.value,
            'max_word_length': self.max_word_length,
            'max_line_length': self.max_line_length,
            'min_word_length': self.min_word_length,
        }
