#!/usr/bin/env python3
"""
Main CLI entry point for Voynich manuscript n-gram analysis.

Analyzes unigram, bigram, and trigram frequencies.

Usage:
    python -m scripts.ngram.main --input data/voynich-transcription.txt --output docs/output/ngram/
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode, save_transcription_config
from common.parser import parse_transcription
from common.normalizer import CollapseMode as NormCollapseMode

from .config import NgramConfig
from .analyzer import analyze_page_ngrams
from .aggregator import (
    run_all_aggregations,
    save_all_aggregations,
    save_page_ngrams,
    AGGREGATIONS,
)


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        description='Analyze n-gram frequencies in Voynich manuscript',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full pipeline with default settings
  python -m scripts.ngram.main --input data/voynich-transcription.txt --output docs/output/ngram/

  # Use collapsed i/e mode
  python -m scripts.ngram.main --input data/voynich-transcription.txt --output docs/output/ngram/ --bigram-mode collapsed
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
        '--min-count',
        type=int,
        default=5,
        help='Minimum count to include n-grams in output'
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
    
    config = NgramConfig(
        collapse_mode=CollapseMode.DISTINCT if args.bigram_mode == 'distinct' else CollapseMode.COLLAPSED,
        min_count=args.min_count,
    )
    
    if args.verbose:
        print(f"Configuration:")
        print(f"  Bigram mode: {args.bigram_mode}")
        print(f"  Min count: {config.min_count}")
    
    # Parse transcription
    if args.verbose:
        print(f"\nParsing {args.input}...")
    
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    pages = parse_transcription(str(args.input))
    
    if args.verbose:
        print(f"  Parsed {len(pages)} pages")
    
    # Analyze n-grams for each page
    if args.verbose:
        print("\nAnalyzing n-grams per page...")
    
    page_ngrams = {}
    for page in pages:
        pc = analyze_page_ngrams(page, collapse_mode=collapse_mode)
        page_ngrams[page.folio] = pc
    
    if args.verbose:
        total_words = sum(pc.counts.total_words for pc in page_ngrams.values())
        total_chars = sum(pc.counts.total_chars for pc in page_ngrams.values())
        print(f"  Total words analyzed: {total_words}")
        print(f"  Total characters: {total_chars}")
    
    # Save page n-grams
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    
    page_ngrams_path = output_dir / 'page_ngrams.json'
    if args.verbose:
        print(f"\nSaving page n-grams to {page_ngrams_path}...")
    
    save_page_ngrams(page_ngrams, page_ngrams_path, config.to_dict(), config.min_count)
    
    # Run aggregations
    if args.verbose:
        print("\nRunning aggregations...")
    
    aggregations_to_run = AGGREGATIONS
    if args.aggregations:
        aggregations_to_run = {k: v for k, v in AGGREGATIONS.items() if k in args.aggregations}
    
    results = run_all_aggregations(pages, page_ngrams, aggregations_to_run)
    
    if args.verbose:
        for name, result in results.items():
            print(f"  {name}: {result.page_count} pages, {result.counts.total_words} words")
    
    # Save aggregations
    aggregated_dir = output_dir / 'aggregated'
    if args.verbose:
        print(f"\nSaving aggregations to {aggregated_dir}/...")
    
    save_all_aggregations(results, aggregated_dir, config.min_count)
    
    # Save metadata
    all_result = results.get('all')
    metadata = {
        'config': config.to_dict(),
        'total_pages': len(pages),
        'total_words': all_result.counts.total_words if all_result else 0,
        'total_chars': all_result.counts.total_chars if all_result else 0,
        'unique_unigrams': len(all_result.counts.unigrams) if all_result else 0,
        'unique_bigrams': len(all_result.counts.bigrams) if all_result else 0,
        'unique_trigrams': len(all_result.counts.trigrams) if all_result else 0,
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
        print(f"\nTop 10 bigrams overall:")
        if all_result:
            for ng, count in all_result.counts.get_top_ngrams(2, 10):
                freq = all_result.counts.get_ngram_frequency(ng)
                print(f"  {ng}: {count} ({freq:.2%})")
    
    print(f"\nDone! Output written to {output_dir}/")
    print(f"  - page_ngrams.json ({len(page_ngrams)} pages)")
    print(f"  - aggregated/ ({len(results)} aggregations)")
    print(f"  - metadata.json")


if __name__ == '__main__':
    main()
