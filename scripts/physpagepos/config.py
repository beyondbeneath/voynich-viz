"""
Configuration for physical page position analysis.
"""

from dataclasses import dataclass, asdict
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode


@dataclass
class PhysPagePosConfig:
    """Configuration for physical page position analysis."""
    collapse_mode: CollapseMode = CollapseMode.DISTINCT
    
    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'collapse_mode': self.collapse_mode.value,
        }


# Grid resolution presets for visualization
# Unlike text-based positions, physical positions use pixel coordinates
# We'll normalize to 0-1 and then quantize to grids
GRID_RESOLUTIONS = {
    'coarse': (10, 15),    # 10 cols x 15 rows
    'fine': (20, 30),      # 20 cols x 30 rows
    'raw': None,           # Dynamic based on actual dimensions
}

# Default raw grid size (used when no dynamic sizing)
DEFAULT_RAW_GRID = (100, 150)

# Normalization modes
NORMALIZATION_MODES = ['page', 'manuscript']
