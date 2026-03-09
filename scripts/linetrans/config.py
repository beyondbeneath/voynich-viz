"""
Configuration for line transition analysis.
"""

from dataclasses import dataclass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode


@dataclass
class LineTransConfig:
    """Configuration for line transition analysis."""
    collapse_mode: CollapseMode = CollapseMode.DISTINCT
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'collapse_mode': self.collapse_mode.value,
        }
