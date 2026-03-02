#!/usr/bin/env python3
"""
Main CLI entry point for Voynich manuscript Markov transition analysis.

Usage:
    python -m markov.main --input data/voynich-transcription.txt --output output/markov/
    python -m markov.main --input ... --bigram-mode collapsed --no-boundaries
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode, save_transcription_config
from common.parser import parse_transcription
from common.normalizer import CollapseMode as NormCollapseMode

from .config import MarkovConfig
from .transitions import count_page_transitions
from .aggregator import (
    run_all_aggregations,
    save_all_aggregations,
    save_page_transitions,
    AGGREGATIONS,
)
from .generate_methodology import save_methodology


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        description='Analyze character transitions in Voynich manuscript transcription',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full pipeline with default settings
  python -m markov.main --input data/voynich-transcription.txt --output output/markov/

  # Use collapsed i/e mode
  python -m markov.main --input data/voynich-transcription.txt --output output/markov/ --bigram-mode collapsed

  # Disable boundary tokens
  python -m markov.main --input data/voynich-transcription.txt --output output/markov/ --no-word-boundaries --no-line-boundaries
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
        '--no-word-boundaries',
        action='store_true',
        help='Disable word start/end boundary tokens'
    )
    
    parser.add_argument(
        '--no-line-boundaries',
        action='store_true',
        help='Disable line start/end boundary tokens'
    )
    
    parser.add_argument(
        '--no-para-boundaries',
        action='store_true',
        help='Disable paragraph start/end boundary tokens'
    )
    
    parser.add_argument(
        '--no-page-boundaries',
        action='store_true',
        help='Disable page start/end boundary tokens'
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
    
    # Create config
    collapse_mode = NormCollapseMode.DISTINCT if args.bigram_mode == 'distinct' else NormCollapseMode.COLLAPSED
    
    config = MarkovConfig(
        collapse_mode=CollapseMode.DISTINCT if args.bigram_mode == 'distinct' else CollapseMode.COLLAPSED,
        include_word_boundaries=not args.no_word_boundaries,
        include_line_boundaries=not args.no_line_boundaries,
        include_para_boundaries=not args.no_para_boundaries,
        include_page_boundaries=not args.no_page_boundaries,
    )
    
    if args.verbose:
        print(f"Configuration:")
        print(f"  Bigram mode: {args.bigram_mode}")
        print(f"  Word boundaries: {config.include_word_boundaries}")
        print(f"  Line boundaries: {config.include_line_boundaries}")
        print(f"  Para boundaries: {config.include_para_boundaries}")
        print(f"  Page boundaries: {config.include_page_boundaries}")
    
    # Parse transcription
    if args.verbose:
        print(f"\nParsing {args.input}...")
    
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    pages = parse_transcription(str(args.input))
    
    if args.verbose:
        print(f"  Parsed {len(pages)} pages")
    
    # Count transitions for each page
    if args.verbose:
        print("\nCounting transitions per page...")
    
    page_transitions = {}
    for page in pages:
        tc = count_page_transitions(
            page,
            collapse_mode=collapse_mode,
            include_word_boundaries=config.include_word_boundaries,
            include_line_boundaries=config.include_line_boundaries,
            include_para_boundaries=config.include_para_boundaries,
            include_page_boundaries=config.include_page_boundaries,
        )
        page_transitions[page.folio] = tc
    
    if args.verbose:
        total_transitions = sum(sum(tc.transitions.values()) for tc in page_transitions.values())
        print(f"  Total transitions counted: {total_transitions}")
    
    # Save page transitions
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    
    page_transitions_path = output_dir / 'page_transitions.json'
    if args.verbose:
        print(f"\nSaving page transitions to {page_transitions_path}...")
    
    save_page_transitions(page_transitions, page_transitions_path, config.to_dict())
    
    # Run aggregations
    if args.verbose:
        print("\nRunning aggregations...")
    
    # Filter aggregations if specified
    aggregations_to_run = AGGREGATIONS
    if args.aggregations:
        aggregations_to_run = {k: v for k, v in AGGREGATIONS.items() if k in args.aggregations}
    
    results = run_all_aggregations(pages, page_transitions, aggregations_to_run)
    
    if args.verbose:
        for name, result in results.items():
            print(f"  {name}: {result.page_count} pages")
    
    # Save aggregations
    aggregated_dir = output_dir / 'aggregated'
    if args.verbose:
        print(f"\nSaving aggregations to {aggregated_dir}/...")
    
    save_all_aggregations(results, aggregated_dir)
    
    # Save metadata
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
    
    # Save shared transcription config for web visualizations
    transcription_config_path = save_transcription_config(
        output_dir.parent,  # output/ directory
        config.collapse_mode
    )
    if args.verbose:
        print(f"Saved transcription config to {transcription_config_path}")
    
    # Generate methodology document for website
    web_dir = output_dir.parent.parent / 'web' / 'markov'
    methodology_path = web_dir / 'methodology.html'
    if web_dir.exists():
        if args.verbose:
            print(f"\nGenerating methodology document...")
        save_methodology(methodology_path, metadata_path)
        if args.verbose:
            print(f"  Saved to {methodology_path}")
    
    print(f"\nDone! Output written to {output_dir}/")
    print(f"  - page_transitions.json ({len(page_transitions)} pages)")
    print(f"  - aggregated/ ({len(results)} aggregations)")
    print(f"  - metadata.json")
    if methodology_path.exists():
        print(f"  - {methodology_path.relative_to(output_dir.parent.parent)}")


if __name__ == '__main__':
    main()
