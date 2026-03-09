#!/usr/bin/env python3
"""
Main CLI entry point for Voynich manuscript line transition analysis.

Analyzes bigram transitions across line breaks: last glyph of line i → first glyph of line i+1.

Usage:
    python -m linetrans.main --input data/voynich-transcription.txt --output docs/output/linetrans/
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode, save_transcription_config
from common.parser import parse_transcription
from common.normalizer import CollapseMode as NormCollapseMode

from .config import LineTransConfig
from .transitions import count_page_line_transitions
from .aggregator import (
    run_all_aggregations,
    save_all_aggregations,
    save_page_transitions,
    AGGREGATIONS,
)


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        description='Analyze line transitions in Voynich manuscript transcription',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full pipeline with default settings
  python -m linetrans.main --input data/voynich-transcription.txt --output docs/output/linetrans/

  # Use collapsed i/e mode
  python -m linetrans.main --input data/voynich-transcription.txt --output docs/output/linetrans/ --bigram-mode collapsed
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
    
    config = LineTransConfig(
        collapse_mode=CollapseMode.DISTINCT if args.bigram_mode == 'distinct' else CollapseMode.COLLAPSED,
    )
    
    if args.verbose:
        print(f"Configuration:")
        print(f"  Bigram mode: {args.bigram_mode}")
    
    if args.verbose:
        print(f"\nParsing {args.input}...")
    
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    pages = parse_transcription(str(args.input))
    
    if args.verbose:
        print(f"  Parsed {len(pages)} pages")
    
    if args.verbose:
        print("\nCounting line transitions per page...")
    
    page_transitions = {}
    for page in pages:
        tc = count_page_line_transitions(page, collapse_mode=collapse_mode)
        page_transitions[page.folio] = tc
    
    if args.verbose:
        total_transitions = sum(sum(tc.transitions.values()) for tc in page_transitions.values())
        print(f"  Total line transitions counted: {total_transitions}")
    
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    
    page_transitions_path = output_dir / 'page_transitions.json'
    if args.verbose:
        print(f"\nSaving page transitions to {page_transitions_path}...")
    
    save_page_transitions(page_transitions, page_transitions_path, config.to_dict())
    
    if args.verbose:
        print("\nRunning aggregations...")
    
    aggregations_to_run = AGGREGATIONS
    if args.aggregations:
        aggregations_to_run = {k: v for k, v in AGGREGATIONS.items() if k in args.aggregations}
    
    results = run_all_aggregations(pages, page_transitions, aggregations_to_run)
    
    if args.verbose:
        for name, result in results.items():
            total = sum(result.transitions.values())
            print(f"  {name}: {result.page_count} pages, {total} transitions")
    
    aggregated_dir = output_dir / 'aggregated'
    if args.verbose:
        print(f"\nSaving aggregations to {aggregated_dir}/...")
    
    save_all_aggregations(results, aggregated_dir)
    
    metadata = {
        'config': config.to_dict(),
        'total_pages': len(pages),
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
    
    print(f"\nDone! Output written to {output_dir}/")
    print(f"  - page_transitions.json ({len(page_transitions)} pages)")
    print(f"  - aggregated/ ({len(results)} aggregations)")
    print(f"  - metadata.json")


if __name__ == '__main__':
    main()
