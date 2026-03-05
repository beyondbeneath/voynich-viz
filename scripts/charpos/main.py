#!/usr/bin/env python3
"""
Main CLI entry point for Voynich manuscript character position analysis.

Analyzes character preferences for positions within words and lines:
- Word position: Which position in N-character words does each character prefer?
- Line position: In which word position (within N-word lines) does each character prefer?

Usage:
    python -m scripts.charpos.main --input data/voynich-transcription.txt --output docs/output/charpos/
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode, save_transcription_config
from common.parser import parse_transcription
from common.normalizer import CollapseMode as NormCollapseMode

from .config import CharPosConfig
from .analyzer import analyze_page_char_positions
from .aggregator import (
    run_all_aggregations,
    save_all_aggregations,
    save_page_positions,
    AGGREGATIONS,
)


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        description='Analyze character position preferences within words and lines in Voynich manuscript',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full pipeline with default settings
  python -m scripts.charpos.main --input data/voynich-transcription.txt --output docs/output/charpos/

  # Use collapsed i/e mode
  python -m scripts.charpos.main --input data/voynich-transcription.txt --output docs/output/charpos/ --bigram-mode collapsed

  # Track up to 10-character words
  python -m scripts.charpos.main --input data/voynich-transcription.txt --output docs/output/charpos/ --max-word-length 10
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
        '--max-word-length',
        type=int,
        default=9,
        help='Maximum word length to track positions for (default: 9)'
    )
    
    parser.add_argument(
        '--max-line-length',
        type=int,
        default=12,
        help='Maximum line length (in words) to track positions for (default: 12)'
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
    
    config = CharPosConfig(
        collapse_mode=CollapseMode.DISTINCT if args.bigram_mode == 'distinct' else CollapseMode.COLLAPSED,
        max_word_length=args.max_word_length,
        max_line_length=args.max_line_length,
    )
    
    if args.verbose:
        print(f"Configuration:")
        print(f"  Bigram mode: {args.bigram_mode}")
        print(f"  Max word length: {config.max_word_length}")
        print(f"  Max line length: {config.max_line_length}")
    
    if args.verbose:
        print(f"\nParsing {args.input}...")
    
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    pages = parse_transcription(str(args.input))
    
    if args.verbose:
        print(f"  Parsed {len(pages)} pages")
    
    if args.verbose:
        print("\nAnalyzing character positions per page...")
    
    page_positions = {}
    for page in pages:
        pc = analyze_page_char_positions(
            page,
            collapse_mode=collapse_mode,
            max_word_length=config.max_word_length,
            max_line_length=config.max_line_length,
        )
        page_positions[page.folio] = pc
    
    if args.verbose:
        total_words = sum(pc.word_count for pc in page_positions.values())
        total_lines = sum(pc.line_count for pc in page_positions.values())
        print(f"  Total words analyzed: {total_words}")
        print(f"  Total lines analyzed: {total_lines}")
    
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    
    page_positions_path = output_dir / 'page_positions.json'
    if args.verbose:
        print(f"\nSaving page positions to {page_positions_path}...")
    
    save_page_positions(page_positions, page_positions_path, config.to_dict())
    
    if args.verbose:
        print("\nRunning aggregations...")
    
    aggregations_to_run = AGGREGATIONS
    if args.aggregations:
        aggregations_to_run = {k: v for k, v in AGGREGATIONS.items() if k in args.aggregations}
    
    results = run_all_aggregations(
        pages, page_positions, aggregations_to_run,
        max_word_length=config.max_word_length,
        max_line_length=config.max_line_length,
    )
    
    if args.verbose:
        for name, result in results.items():
            print(f"  {name}: {result.page_count} pages, {result.word_count} words, {result.line_count} lines")
    
    aggregated_dir = output_dir / 'aggregated'
    if args.verbose:
        print(f"\nSaving aggregations to {aggregated_dir}/...")
    
    save_all_aggregations(results, aggregated_dir)
    
    metadata = {
        'config': config.to_dict(),
        'total_pages': len(pages),
        'total_words': sum(pc.word_count for pc in page_positions.values()),
        'total_lines': sum(pc.line_count for pc in page_positions.values()),
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
