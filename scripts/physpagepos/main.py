#!/usr/bin/env python3
"""
Main CLI entry point for Voynich manuscript physical page position analysis.

Analyzes where characters appear spatially on pages using actual pixel
coordinates from the Voynichese XML files.

Usage:
    python -m scripts.physpagepos.main --xml-source data/voynichese.zip --transcription data/voynich-transcription.txt --output docs/output/physpagepos/
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from common.config import CollapseMode, save_transcription_config
from common.normalizer import CollapseMode as NormCollapseMode

from .config import PhysPagePosConfig, GRID_RESOLUTIONS, NORMALIZATION_MODES, DEFAULT_RAW_GRID
from .xml_parser import parse_xml_source
from .folio_mapper import FolioMapper
from .analyzer import analyze_all_folios
from .aggregator import (
    run_all_aggregations,
    save_all_aggregations,
    save_folio_positions,
    AGGREGATIONS,
)


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        description='Analyze physical character page positions in Voynich manuscript',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full pipeline from zip file (recommended)
  python -m scripts.physpagepos.main --xml-source data/voynichese.zip --transcription data/voynich-transcription.txt --output docs/output/physpagepos/

  # From directory of XML files
  python -m scripts.physpagepos.main --xml-source data/voynichese/ --transcription data/voynich-transcription.txt --output docs/output/physpagepos/

  # Use collapsed i/e mode
  python -m scripts.physpagepos.main --xml-source data/voynichese.zip --transcription data/voynich-transcription.txt --output docs/output/physpagepos/ --bigram-mode collapsed

Grid Resolutions:
  The analysis generates multiple grid resolutions:
  - coarse: 10x15 (broader patterns)
  - fine: 20x30 (detailed patterns)
  - raw: 100x150 (fine-grained view based on pixel positions)

Normalization Modes:
  - page: Positions normalized within each page (0-1 range per page)
  - manuscript: Positions normalized to global max page dimensions
        """
    )
    
    parser.add_argument(
        '--xml-source', '-x',
        required=True,
        type=Path,
        help='Path to Voynichese XML source (zip file or directory)'
    )
    
    parser.add_argument(
        '--transcription', '-t',
        required=True,
        type=Path,
        help='Path to IVTFF transcription file (for metadata mapping)'
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
    
    config = PhysPagePosConfig(
        collapse_mode=CollapseMode.DISTINCT if args.bigram_mode == 'distinct' else CollapseMode.COLLAPSED,
    )
    
    if args.verbose:
        print(f"Configuration:")
        print(f"  Bigram mode: {args.bigram_mode}")
        print(f"  Grid resolutions:")
        for name, dims in GRID_RESOLUTIONS.items():
            if dims is None:
                cols, rows = DEFAULT_RAW_GRID
                print(f"    {name}: {cols}x{rows} (pixel-based)")
            else:
                cols, rows = dims
                print(f"    {name}: {cols}x{rows}")
        print(f"  Normalization modes: {', '.join(NORMALIZATION_MODES)}")
    
    if not args.xml_source.exists():
        print(f"Error: XML source not found: {args.xml_source}", file=sys.stderr)
        sys.exit(1)
    
    if not args.transcription.exists():
        print(f"Error: Transcription file not found: {args.transcription}", file=sys.stderr)
        sys.exit(1)
    
    source_type = "zip file" if args.xml_source.suffix.lower() == '.zip' else "directory"
    if args.verbose:
        print(f"\nParsing XML files from {source_type}: {args.xml_source}...")
    
    folios = parse_xml_source(args.xml_source)
    
    if args.verbose:
        print(f"  Parsed {len(folios)} folios")
    
    if args.verbose:
        print(f"\nLoading metadata from {args.transcription}...")
    
    mapper = FolioMapper(args.transcription)
    metadata_map = mapper.metadata
    
    if args.verbose:
        print(f"  Loaded metadata for {len(metadata_map)} folios")
        
        matched = sum(1 for f in folios if f.name in metadata_map)
        print(f"  Matched {matched}/{len(folios)} XML folios to transcription")
    
    if args.verbose:
        print("\nAnalyzing physical page positions...")
    
    folio_positions, global_stats = analyze_all_folios(
        folios, metadata_map, collapse_mode
    )
    
    if args.verbose:
        total_chars = sum(pp.char_count for pp in folio_positions.values())
        print(f"  Total characters analyzed: {total_chars}")
        print(f"  Global max dimensions: {global_stats['max_width']}x{global_stats['max_height']} pixels")
    
    output_dir = args.output
    output_dir.mkdir(parents=True, exist_ok=True)
    
    folio_positions_path = output_dir / 'folio_positions.json'
    if args.verbose:
        print(f"\nSaving folio positions to {folio_positions_path}...")
    
    save_folio_positions(folio_positions, folio_positions_path, config.to_dict(), global_stats)
    
    if args.verbose:
        print("\nRunning aggregations...")
    
    aggregations_to_run = AGGREGATIONS
    if args.aggregations:
        aggregations_to_run = {k: v for k, v in AGGREGATIONS.items() if k in args.aggregations}
    
    results = run_all_aggregations(folio_positions, metadata_map, aggregations_to_run)
    
    if args.verbose:
        for name, result in results.items():
            print(f"  {name}: {result.page_count} pages, {result.char_count} chars")
    
    aggregated_dir = output_dir / 'aggregated'
    if args.verbose:
        print(f"\nSaving aggregations to {aggregated_dir}/...")
    
    save_all_aggregations(results, aggregated_dir, global_stats)
    
    # Build grid resolutions for metadata
    grid_resolutions = {}
    for name, dims in GRID_RESOLUTIONS.items():
        if dims is None:
            cols, rows = DEFAULT_RAW_GRID
            grid_resolutions[name] = {
                'cols': cols,
                'rows': rows,
                'absolute': True,
                'max_x': global_stats['max_width'],
                'max_y': global_stats['max_height'],
            }
        else:
            cols, rows = dims
            grid_resolutions[name] = {'cols': cols, 'rows': rows}
    
    metadata = {
        'config': config.to_dict(),
        'grid_resolutions': grid_resolutions,
        'normalization_modes': NORMALIZATION_MODES,
        'global_stats': global_stats,
        'total_folios': len(folios),
        'total_chars': sum(pp.char_count for pp in folio_positions.values()),
        'aggregations': list(results.keys()),
        'languages': list(set(m.language for m in metadata_map.values() if m.language)),
        'hands': list(set(m.hand for m in metadata_map.values() if m.hand)),
        'illustration_types': list(set(m.illustration for m in metadata_map.values() if m.illustration)),
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
    print(f"  - folio_positions.json ({len(folio_positions)} folios)")
    print(f"  - aggregated/ ({len(results)} aggregations)")
    print(f"  - metadata.json")


if __name__ == '__main__':
    main()
