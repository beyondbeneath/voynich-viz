#!/usr/bin/env python3
"""
Main CLI entry point for Voynich manuscript page position analysis.

Analyzes where characters appear spatially on pages (left/right, top/bottom).
Supports both page-relative and manuscript-relative normalization.
Generates multiple grid resolutions for visualization.

Usage:
    python -m scripts.pagepos.main --input data/voynich-transcription.txt --output docs/output/pagepos/
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode, save_transcription_config
from common.parser import parse_transcription
from common.normalizer import CollapseMode as NormCollapseMode

from .config import PagePosConfig
from .analyzer import analyze_all_pages, GRID_RESOLUTIONS, NORMALIZATION_MODES
from .aggregator import (
    run_all_aggregations,
    save_all_aggregations,
    save_page_positions,
    AGGREGATIONS,
)


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        description='Analyze character page positions in Voynich manuscript',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full pipeline with default settings
  python -m scripts.pagepos.main --input data/voynich-transcription.txt --output docs/output/pagepos/

  # Use collapsed i/e mode
  python -m scripts.pagepos.main --input data/voynich-transcription.txt --output docs/output/pagepos/ --bigram-mode collapsed

Grid Resolutions:
  The analysis generates multiple grid resolutions:
  - coarse: 5x10 (broader patterns)
  - fine: 10x20 (detailed patterns)
  - raw: 50x100 (fine-grained view with blur effect)

Normalization Modes:
  - page: Positions normalized within each page (0-1 range per page)
  - manuscript: Positions normalized to global max line count and width
        """
    )
    
    parser.add_argument(
        '--input', '-i',
        required=True,
        type=Path,
        help='Path to IVTFF transcription file'
    )
    
    parser.add_argument(
        '--output', '-o',
        required=True,
        type=Path,
        help='Output directory for JSON files'
    )
    
    parser.add_argument(
        '--bigram-mode', '-m',
        choices=['distinct', 'collapsed'],
        default='distinct',
        help='How to handle i/e sequences: distinct (ii->2, iii->3) or collapsed (all->I/E)'
    )
    
    parser.add_argument(
        '--aggregations',
        nargs='+',
        choices=list(AGGREGATIONS.keys()),
        help='Specific aggregations to compute (default: all)'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Print verbose progress information'
    )
    
    return parser


def main():
    """Main entry point."""
    parser = create_parser()
    args = parser.parse_args()
    
    collapse_mode = NormCollapseMode.DISTINCT if args.bigram_mode == 'distinct' else NormCollapseMode.COLLAPSED
    
    config = PagePosConfig(
        collapse_mode=CollapseMode.DISTINCT if args.bigram_mode == 'distinct' else CollapseMode.COLLAPSED,
    )
    
    if args.verbose:
        print(f"Configuration:")
        print(f"  Bigram mode: {args.bigram_mode}")
        print(f"  Grid resolutions:")
        for name, dims in GRID_RESOLUTIONS.items():
            if dims is None:
                print(f"    {name}: (absolute - uses actual line/char positions)")
            else:
                cols, rows = dims
                print(f"    {name}: {cols}x{rows}")
        print(f"  Normalization modes: {', '.join(NORMALIZATION_MODES)}")
    
    if args.verbose:
        print(f"\nParsing {args.input}...")
    
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    pages = parse_transcription(str(args.input))
    
    if args.verbose:
        print(f"  Parsed {len(pages)} pages")
    
    if args.verbose:
        print("\nAnalyzing page positions (two-pass for global normalization)...")
    
    # analyze_all_pages does a two-pass analysis:
    # 1. First pass: extract raw positions and compute global maxes
    # 2. Second pass: normalize with both page-relative and manuscript-relative modes
    page_positions, global_stats = analyze_all_pages(pages, collapse_mode)
    
    if args.verbose:
        total_chars = sum(pp.char_count for pp in page_positions.values())
        print(f"  Total characters analyzed: {total_chars}")
        print(f"  Global max line number: {global_stats['max_line_num']}")
        print(f"  Global max line width: {global_stats['max_line_width']}")
    
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    
    page_positions_path = output_dir / 'page_positions.json'
    if args.verbose:
        print(f"\nSaving page positions to {page_positions_path}...")
    
    save_page_positions(page_positions, page_positions_path, config.to_dict(), global_stats)
    
    if args.verbose:
        print("\nRunning aggregations...")
    
    aggregations_to_run = AGGREGATIONS
    if args.aggregations:
        aggregations_to_run = {k: v for k, v in AGGREGATIONS.items() if k in args.aggregations}
    
    results = run_all_aggregations(pages, page_positions, aggregations_to_run)
    
    if args.verbose:
        for name, result in results.items():
            print(f"  {name}: {result.page_count} pages, {result.char_count} chars")
    
    aggregated_dir = output_dir / 'aggregated'
    if args.verbose:
        print(f"\nSaving aggregations to {aggregated_dir}/...")
    
    save_all_aggregations(results, aggregated_dir, global_stats)
    
    # Build grid resolutions dict, handling 'raw' which uses actual dimensions
    grid_resolutions = {}
    for name, dims in GRID_RESOLUTIONS.items():
        if dims is None:  # 'raw' uses actual dimensions
            grid_resolutions[name] = {
                'cols': global_stats['max_line_width'],
                'rows': global_stats['max_line_num'],
                'absolute': True,
            }
        else:
            cols, rows = dims
            grid_resolutions[name] = {'cols': cols, 'rows': rows}
    
    metadata = {
        'config': config.to_dict(),
        'grid_resolutions': grid_resolutions,
        'normalization_modes': NORMALIZATION_MODES,
        'global_stats': global_stats,
        'total_pages': len(pages),
        'total_chars': sum(pp.char_count for pp in page_positions.values()),
        'aggregations': list(results.keys()),
        'languages': list(set(p.language for p in pages if p.language)),
        'hands': list(set(p.hand for p in pages if p.hand)),
        'illustration_types': list(set(p.illustration for p in pages if p.illustration)),
    }
    
    metadata_path = output_dir / 'metadata.json'
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    
    if args.verbose:
        print(f"\nSaved metadata to {metadata_path}")
    
    transcription_config_path = save_transcription_config(
        output_dir.parent,
        config.collapse_mode
    )
    if args.verbose:
        print(f"Saved transcription config to {transcription_config_path}")
    
    print(f"\nDone! Output written to {output_dir}/")
    print(f"  - page_positions.json ({len(page_positions)} pages)")
    print(f"  - aggregated/ ({len(results)} aggregations)")
    print(f"  - metadata.json")


if __name__ == '__main__':
    main()
