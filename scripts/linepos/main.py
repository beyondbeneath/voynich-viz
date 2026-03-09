#!/usr/bin/env python3
"""
Main script for line position effects analysis.

Analyzes how glyph probabilities change based on word position within lines:
- P(word STARTS with glyph | k words from line start) for line-start effects
- P(word ENDS with glyph | k words from line end) for line-end effects
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.parser import parse_transcription
from common.config import CollapseMode
from .config import LineposConfig, MAX_WORD_POSITION
from .analyzer import analyze_page_line_positions
from .aggregator import run_all_aggregations, save_all_aggregations


def main():
    parser = argparse.ArgumentParser(
        description='Analyze line position effects in Voynich manuscript'
    )
    parser.add_argument(
        '--input', '-i',
        type=Path,
        default=Path('data/voynich-transcription.txt'),
        help='Path to transcription file (default: data/voynich-transcription.txt)'
    )
    parser.add_argument(
        '--output', '-o',
        type=Path,
        default=Path('docs/output/linepos/aggregated'),
        help='Output directory for JSON files (default: docs/output/linepos/aggregated)'
    )
    parser.add_argument(
        '--collapse-mode',
        type=str,
        choices=['distinct', 'collapsed'],
        default='distinct',
        help='Character collapse mode (default: distinct)'
    )
    
    args = parser.parse_args()
    
    # Configuration
    collapse_mode = CollapseMode.DISTINCT if args.collapse_mode == 'distinct' else CollapseMode.COLLAPSED
    config = LineposConfig(collapse_mode=collapse_mode)
    
    print(f"Line Position Effects Analysis")
    print(f"=" * 50)
    print(f"Input: {args.input}")
    print(f"Output: {args.output}")
    print(f"Collapse mode: {collapse_mode.value}")
    print(f"Max word position: {MAX_WORD_POSITION}")
    print()
    
    # Parse transcription
    print("Parsing transcription...")
    pages = parse_transcription(args.input)
    print(f"  Found {len(pages)} pages")
    
    # Analyze each page
    print("Analyzing line positions...")
    page_counts = {}
    for page in pages:
        counts = analyze_page_line_positions(page, collapse_mode)
        page_counts[page.folio] = counts
    
    total_words = sum(sum(c.total_words_from_start.values()) for c in page_counts.values())
    print(f"  Analyzed {total_words:,} words")
    
    # Run aggregations
    print("Running aggregations...")
    results = run_all_aggregations(pages, page_counts)
    print(f"  Generated {len(results)} aggregations")
    
    # Save results
    print(f"Saving to {args.output}...")
    save_all_aggregations(results, args.output)
    
    # Print summary
    print()
    print("Summary")
    print("-" * 50)
    
    all_result = results.get('all')
    if all_result:
        from .analyzer import compute_probabilities
        probs = compute_probabilities(all_result.merged_counts)
        asymmetry = probs['asymmetry']
        
        # Top line-start preferring glyphs
        top_start = sorted(asymmetry.items(), key=lambda x: -x[1])[:5]
        print("\nTop line-START preferring glyphs (high P(starts first word)):")
        for glyph, asym in top_start:
            p_first = probs['prob_from_start'].get(glyph, {}).get(0, 0) * 100
            p_last = probs['prob_from_end'].get(glyph, {}).get(0, 0) * 100
            count = all_result.merged_counts.start_glyph_totals.get(glyph, 0)
            print(f"  {glyph}: starts_first={p_first:.1f}%, ends_last={p_last:.1f}%, diff={asym*100:+.1f}pp (n={count})")
        
        # Top line-end preferring glyphs
        top_end = sorted(asymmetry.items(), key=lambda x: x[1])[:5]
        print("\nTop line-END preferring glyphs (high P(ends last word)):")
        for glyph, asym in top_end:
            p_first = probs['prob_from_start'].get(glyph, {}).get(0, 0) * 100
            p_last = probs['prob_from_end'].get(glyph, {}).get(0, 0) * 100
            count = all_result.merged_counts.end_glyph_totals.get(glyph, 0)
            print(f"  {glyph}: starts_first={p_first:.1f}%, ends_last={p_last:.1f}%, diff={asym*100:+.1f}pp (n={count})")
    
    print()
    print("Done!")


if __name__ == '__main__':
    main()
