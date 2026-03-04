#!/usr/bin/env python3
"""
Generate a human-readable methodology document for the Markov transition matrix.

This script outputs an HTML file explaining how the processing pipeline works,
combining hard-coded explanatory text with dynamic content from config.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional
from collections import defaultdict

# Add parent directory for common imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.normalizer import BIGRAM_TO_SINGLE, I_DISTINCT, E_DISTINCT
from common.config import ILLUSTRATION_TYPES, QUIRE_MAPPING

from .config import (
    BOUNDARY_TOKENS,
    BOUNDARY_DISPLAY,
    WORD_START, WORD_END,
    LINE_START, LINE_END,
    PARA_START, PARA_END,
    PAGE_START, PAGE_END,
    STANDARD_AGGREGATIONS,
)
from common.config import AGGREGATION_ORDER


def load_page_data(page_transitions_path: Optional[Path] = None) -> list[dict]:
    """Load page metadata from page_transitions.json."""
    if page_transitions_path and page_transitions_path.exists():
        with open(page_transitions_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('pages', [])
    return []


def matches_filter(page_metadata: dict, filter_def: dict) -> bool:
    """Check if a page's metadata matches an aggregation filter."""
    for key, value in filter_def.items():
        page_value = page_metadata.get(key)
        if key == 'quire':
            # Quire is stored as letter, convert to number
            quire_letter = page_metadata.get('quire', '')
            page_quire_num = QUIRE_MAPPING.get(quire_letter)
            if page_quire_num != value:
                return False
        elif str(page_value) != str(value):
            return False
    return True


def compute_aggregation_contents(pages: list[dict]) -> dict:
    """
    Compute which folios/pages belong to each aggregation, grouped by quire.
    Returns: {aggregation_name: {quire: {folio: [page_info, ...]}}}
    """
    aggregation_contents = {}
    
    for agg_name, agg_info in STANDARD_AGGREGATIONS.items():
        filter_def = agg_info['filter']
        quire_folios = defaultdict(lambda: defaultdict(list))
        
        for page in pages:
            metadata = page.get('metadata', {})
            folio = page.get('folio', 'unknown')
            
            if matches_filter(metadata, filter_def):
                # Extract folio base (e.g., "f1" from "f1r" or "f1v")
                folio_base = folio.rstrip('rv') if folio else 'unknown'
                quire = metadata.get('quire', '?')
                quire_num = QUIRE_MAPPING.get(quire, 0)
                page_info = {
                    'folio': folio,
                    'language': metadata.get('language', '?'),
                    'hand': metadata.get('hand', '?'),
                    'illustration': metadata.get('illustration', '?'),
                    'quire': quire,
                    'quire_num': quire_num,
                }
                quire_folios[quire][folio_base].append(page_info)
        
        # Convert to regular dicts
        aggregation_contents[agg_name] = {
            quire: dict(folios) for quire, folios in quire_folios.items()
        }
    
    return aggregation_contents


def compute_overlap_statistics(pages: list[dict]) -> dict:
    """
    Compute how each aggregation overlaps with hands, languages, and illustration types.
    Returns: {aggregation_name: {hands: {}, languages: {}, illustrations: {}}}
    """
    overlap_stats = {}
    
    for agg_name, agg_info in STANDARD_AGGREGATIONS.items():
        filter_def = agg_info['filter']
        
        hands = defaultdict(int)
        languages = defaultdict(int)
        illustrations = defaultdict(int)
        total = 0
        
        for page in pages:
            metadata = page.get('metadata', {})
            
            if matches_filter(metadata, filter_def):
                total += 1
                hands[metadata.get('hand', '?')] += 1
                languages[metadata.get('language', '?')] += 1
                illustrations[metadata.get('illustration', '?')] += 1
        
        overlap_stats[agg_name] = {
            'total': total,
            'hands': dict(hands),
            'languages': dict(languages),
            'illustrations': dict(illustrations),
        }
    
    return overlap_stats


def generate_methodology_html(metadata_path: Optional[Path] = None, 
                              page_transitions_path: Optional[Path] = None) -> str:
    """Generate the methodology HTML document."""
    
    # Load metadata if available
    metadata = {}
    if metadata_path and metadata_path.exists():
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    
    config = metadata.get('config', {})
    total_pages = metadata.get('total_pages', '~226')
    
    # Load page data for aggregation contents and overlap
    pages = load_page_data(page_transitions_path)
    aggregation_contents = compute_aggregation_contents(pages) if pages else {}
    overlap_stats = compute_overlap_statistics(pages) if pages else {}
    
    # Build bigram table rows
    bigram_rows = '\n'.join(
        f'          <tr><td><code>{bigram}</code></td><td>→</td><td><code>{single}</code></td></tr>'
        for bigram, single in sorted(BIGRAM_TO_SINGLE.items(), key=lambda x: -len(x[0]))
    )
    
    # Build i/e distinct table rows
    i_distinct_rows = '\n'.join(
        f'          <tr><td><code>{orig}</code></td><td>→</td><td><code>{mapped}</code></td></tr>'
        for orig, mapped in sorted(I_DISTINCT.items(), key=lambda x: len(x[0]))
    )
    e_distinct_rows = '\n'.join(
        f'          <tr><td><code>{orig}</code></td><td>→</td><td><code>{mapped}</code></td></tr>'
        for orig, mapped in sorted(E_DISTINCT.items(), key=lambda x: len(x[0]))
    )
    
    # Build boundary token table
    boundary_rows = '\n'.join(
        f'          <tr><td><code>{token}</code></td><td>{BOUNDARY_DISPLAY[token]["name"]}</td></tr>'
        for token in [WORD_START, WORD_END, LINE_START, LINE_END, PARA_START, PARA_END, PAGE_START, PAGE_END]
    )
    
    # Build aggregation table grouped by type
    aggregation_rows = []
    
    # Group definitions for display
    groups = [
        ('All', ['all']),
        ('By Language', ['language_a', 'language_b']),
        ('By Hand', ['hand_1', 'hand_2', 'hand_3', 'hand_4', 'hand_5']),
        ('By Illustration', ['herbal', 'zodiac', 'biological', 'pharmaceutical', 'astronomical', 'cosmological', 'text_only']),
        ('By Quire', ['quire_13', 'quire_20']),
        ('Combined Filters', ['herbal_lang_a', 'herbal_lang_b', 'biological_lang_a', 'biological_lang_b']),
    ]
    
    for group_name, agg_names in groups:
        # Add group header row
        aggregation_rows.append(
            f'          <tr class="group-header"><td colspan="4"><strong>{group_name}</strong></td></tr>'
        )
        for name in agg_names:
            if name in STANDARD_AGGREGATIONS:
                info = STANDARD_AGGREGATIONS[name]
                filter_desc = ', '.join(f'{k}={v}' for k, v in info['filter'].items()) if info['filter'] else 'None (all pages)'
                
                # Build expandable folio details grouped by quire
                contents = aggregation_contents.get(name, {})  # {quire: {folio: [pages]}}
                
                # Count totals
                page_count = sum(
                    len(pages) 
                    for quire_folios in contents.values() 
                    for pages in quire_folios.values()
                )
                folio_count = sum(len(folios) for folios in contents.values())
                
                # Build folio details HTML grouped by quire
                quire_sections = []
                # Sort quires by their numeric value
                sorted_quires = sorted(
                    contents.keys(), 
                    key=lambda q: QUIRE_MAPPING.get(q, 99)
                )
                
                for quire in sorted_quires:
                    quire_folios = contents[quire]
                    quire_num = QUIRE_MAPPING.get(quire, '?')
                    
                    # Sort folios within quire
                    folio_items = []
                    for folio_base in sorted(quire_folios.keys(), key=lambda x: (x[1:].zfill(5) if x[1:].rstrip('rv0123456789').replace('f','').isdigit() else x)):
                        page_list = quire_folios[folio_base]
                        page_ids = ', '.join(p['folio'] for p in sorted(page_list, key=lambda x: x['folio']))
                        folio_items.append(f'<span class="folio-item"><strong>{folio_base}</strong>: {page_ids}</span>')
                    
                    quire_label = f'Quire {quire_num}' if quire_num != '?' else 'Unknown Quire'
                    quire_sections.append(
                        f'<div class="quire-group"><span class="quire-label">{quire_label}</span> {" ".join(folio_items)}</div>'
                    )
                
                folio_html = ''.join(quire_sections) if quire_sections else '<em>No pages</em>'
                
                aggregation_rows.append(
                    f'''          <tr>
            <td><code>{name}</code></td>
            <td>{info["description"]}</td>
            <td>{filter_desc}</td>
            <td class="expand-cell">
              <button class="expand-btn" onclick="toggleFolioDetails(this)" title="Show folios">?</button>
              <span class="page-count">{page_count} pages</span>
            </td>
          </tr>
          <tr class="folio-details-row" style="display: none;">
            <td colspan="4">
              <div class="folio-details">
                <strong>{folio_count} folios, {page_count} pages:</strong>
                {folio_html}
              </div>
            </td>
          </tr>'''
                )
    
    aggregation_table = '\n'.join(aggregation_rows)
    
    # Build overlap statistics JSON for JavaScript
    overlap_json = json.dumps(overlap_stats)
    
    # Build illustration types table
    illustration_rows = '\n'.join(
        f'          <tr><td><code>{code}</code></td><td>{desc}</td></tr>'
        for code, desc in sorted(ILLUSTRATION_TYPES.items())
    )
    
    # Current config display
    collapse_mode = config.get('collapse_mode', 'distinct')
    boundaries_enabled = []
    if config.get('include_word_boundaries', True):
        boundaries_enabled.append('Word')
    if config.get('include_line_boundaries', True):
        boundaries_enabled.append('Line')
    if config.get('include_para_boundaries', True):
        boundaries_enabled.append('Paragraph')
    if config.get('include_page_boundaries', True):
        boundaries_enabled.append('Page')
    boundaries_str = ', '.join(boundaries_enabled) if boundaries_enabled else 'None'
    
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Methodology - Markov Transition Analysis</title>
  <link rel="stylesheet" href="../common/css/base.css">
  <link rel="stylesheet" href="css/style.css">
  <style>
    .methodology {{
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.7;
    }}
    .methodology h1 {{
      border-bottom: 2px solid var(--accent-color);
      padding-bottom: 12px;
      margin-bottom: 30px;
    }}
    .methodology h2 {{
      color: var(--accent-color);
      margin-top: 40px;
      margin-bottom: 16px;
    }}
    .methodology h3 {{
      margin-top: 24px;
      margin-bottom: 12px;
    }}
    .methodology p {{
      margin-bottom: 16px;
      color: var(--text-secondary);
    }}
    .methodology ul {{
      color: var(--text-secondary);
      margin-bottom: 16px;
    }}
    .methodology li {{
      margin-bottom: 8px;
    }}
    .methodology code {{
      background: var(--bg-primary);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Consolas', monospace;
    }}
    .methodology table {{
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 24px;
      font-size: 14px;
    }}
    .methodology th, .methodology td {{
      padding: 10px 12px;
      text-align: left;
      border: 1px solid var(--border-color);
    }}
    .methodology th {{
      background: var(--bg-primary);
      font-weight: 600;
    }}
    .methodology tr:hover {{
      background: var(--bg-primary);
    }}
    .methodology tr.group-header {{
      background: var(--bg-secondary);
    }}
    .methodology tr.group-header:hover {{
      background: var(--bg-secondary);
    }}
    .methodology tr.group-header td {{
      padding-top: 16px;
      border-bottom: none;
    }}
    .step-box {{
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-left: 4px solid var(--accent-color);
      padding: 16px 20px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
    }}
    .step-box h4 {{
      margin: 0 0 8px;
      color: var(--text-primary);
    }}
    .step-box p {{
      margin: 0;
      font-size: 14px;
    }}
    .config-badge {{
      display: inline-block;
      background: var(--accent-color);
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 8px;
    }}
    .back-link {{
      display: inline-block;
      margin-bottom: 20px;
      color: var(--accent-color);
      text-decoration: none;
    }}
    .back-link:hover {{
      text-decoration: underline;
    }}
    .timestamp {{
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border-color);
    }}
    .two-col {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }}
    @media (max-width: 600px) {{
      .two-col {{
        grid-template-columns: 1fr;
      }}
    }}
    
    /* Expandable folio details */
    .expand-cell {{
      white-space: nowrap;
    }}
    .expand-btn {{
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 50%;
      width: 20px;
      height: 20px;
      font-size: 11px;
      cursor: pointer;
      color: var(--text-secondary);
      margin-right: 8px;
      padding: 0;
      line-height: 18px;
    }}
    .expand-btn:hover {{
      background: var(--accent-color);
      color: white;
      border-color: var(--accent-color);
    }}
    .expand-btn.expanded {{
      background: var(--accent-color);
      color: white;
      border-color: var(--accent-color);
    }}
    .page-count {{
      font-size: 12px;
      color: var(--text-secondary);
    }}
    .folio-details-row td {{
      background: var(--bg-secondary);
      padding: 12px 16px;
    }}
    .folio-details-row:hover {{
      background: var(--bg-secondary) !important;
    }}
    .folio-details {{
      font-size: 13px;
      line-height: 1.8;
    }}
    .quire-group {{
      margin-top: 10px;
      padding-left: 12px;
      border-left: 2px solid var(--border-color);
    }}
    .quire-group:first-child {{
      margin-top: 8px;
    }}
    .quire-label {{
      display: inline-block;
      background: var(--bg-primary);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-right: 10px;
      margin-bottom: 4px;
    }}
    .folio-item {{
      display: inline-block;
      margin-right: 16px;
      margin-bottom: 4px;
    }}
    .folio-item strong {{
      color: var(--accent-color);
    }}
    
    /* Overlap visualization section */
    .overlap-section {{
      margin-top: 40px;
    }}
    .overlap-controls {{
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }}
    .overlap-controls label {{
      font-weight: 600;
    }}
    .overlap-controls select {{
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 14px;
      min-width: 200px;
    }}
    .overlap-summary {{
      font-size: 14px;
      color: var(--text-secondary);
      margin-left: auto;
    }}
    .charts-grid {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 16px;
    }}
    @media (max-width: 800px) {{
      .charts-grid {{
        grid-template-columns: 1fr;
      }}
    }}
    .chart-container {{
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
    }}
    .chart-container h4 {{
      margin: 0 0 16px;
      font-size: 14px;
      color: var(--text-primary);
    }}
    .bar-chart {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .bar-row {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .bar-label {{
      width: 60px;
      font-size: 12px;
      text-align: right;
      color: var(--text-secondary);
      flex-shrink: 0;
    }}
    .bar-track {{
      flex: 1;
      height: 20px;
      background: var(--bg-primary);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }}
    .bar-fill {{
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }}
    .bar-fill.hand {{ background: #6366f1; }}
    .bar-fill.language {{ background: #10b981; }}
    .bar-fill.illustration {{ background: #f59e0b; }}
    .bar-value {{
      width: 50px;
      font-size: 12px;
      text-align: left;
      color: var(--text-secondary);
      flex-shrink: 0;
    }}
    .no-data {{
      color: var(--text-secondary);
      font-style: italic;
      text-align: center;
      padding: 20px;
    }}
  </style>
</head>
<body>
  <div class="methodology">
    <a href="index.html" class="back-link">← Back to Transition Matrix</a>
    
    <h1>Processing Methodology</h1>
    
    <p>
      This document explains how the Voynich manuscript transcription is processed
      to generate character transition matrices. The processing pipeline transforms
      raw transcription data into normalized character sequences, then counts
      transitions between characters to reveal statistical patterns.
    </p>

    <h2>Current Configuration</h2>
    <p>
      <span class="config-badge">Collapse Mode: {collapse_mode}</span>
      <span class="config-badge">Boundaries: {boundaries_str}</span>
      <span class="config-badge">Pages Processed: {total_pages}</span>
    </p>

    <h2>Pipeline Overview</h2>
    
    <div class="step-box">
      <h4>Step 1: Parse Transcription</h4>
      <p>
        Load the IVTFF (Intermediate Voynich Transcription File Format) transcription
        and extract page metadata including folio ID, Currier language (A/B), 
        scribal hand (1-5), illustration type, and quire number.
      </p>
    </div>

    <div class="step-box">
      <h4>Step 2: Character Normalization</h4>
      <p>
        Transform raw transcription characters into a normalized form by collapsing
        multi-character sequences (bigrams) into single tokens and handling repeated
        i/e characters according to the configured mode.
      </p>
    </div>

    <div class="step-box">
      <h4>Step 3: Boundary Token Insertion</h4>
      <p>
        Insert special boundary tokens to mark word, line, paragraph, and page
        boundaries. This allows analysis of character positions within structural units.
      </p>
    </div>

    <div class="step-box">
      <h4>Step 4: Transition Counting</h4>
      <p>
        For each page, count every character pair (bigram) that appears in sequence.
        This produces a transition matrix showing how often each character follows
        each other character.
      </p>
    </div>

    <div class="step-box">
      <h4>Step 5: Aggregation</h4>
      <p>
        Combine page-level transition counts into aggregated datasets by filtering
        on metadata (language, hand, section type). Compute both raw counts and
        row-normalized probabilities.
      </p>
    </div>

    <h2>Character Substitutions</h2>
    
    <h3>Bigram Collapsing</h3>
    <p>
      Multi-character sequences in the EVA transcription alphabet are collapsed
      into single tokens to simplify analysis. This is applied in order from
      longest to shortest to handle overlapping patterns correctly.
    </p>
    <table>
      <thead>
        <tr><th>Original</th><th></th><th>Normalized</th></tr>
      </thead>
      <tbody>
{bigram_rows}
      </tbody>
    </table>

    <h3>i/e Sequence Handling</h3>
    <p>
      The manuscript contains many repeated 'i' and 'e' characters. These are
      mapped to distinct tokens based on their count. In "distinct" mode, each
      length maps to a unique token. In "collapsed" mode, all lengths map to
      a single token (I or E).
    </p>
    
    <div class="two-col">
      <div>
        <h4>i-sequences (distinct mode)</h4>
        <table>
          <thead>
            <tr><th>Original</th><th></th><th>Token</th></tr>
          </thead>
          <tbody>
{i_distinct_rows}
          </tbody>
        </table>
      </div>
      <div>
        <h4>e-sequences (distinct mode)</h4>
        <table>
          <thead>
            <tr><th>Original</th><th></th><th>Token</th></tr>
          </thead>
          <tbody>
{e_distinct_rows}
          </tbody>
        </table>
      </div>
    </div>

    <h2>Boundary Tokens</h2>
    <p>
      Special tokens are inserted to mark structural boundaries in the text.
      These allow analysis of which characters tend to appear at the start
      or end of words, lines, paragraphs, and pages.
    </p>
    <table>
      <thead>
        <tr><th>Token</th><th>Meaning</th></tr>
      </thead>
      <tbody>
{boundary_rows}
      </tbody>
    </table>

    <h2>Aggregations</h2>
    <p>
      Page-level transition counts are aggregated into various subsets based on
      metadata filters. This allows comparison between different sections,
      scribal hands, or Currier languages. Click the <strong>?</strong> button to see which folios and pages are included in each aggregation.
    </p>
    <table>
      <thead>
        <tr><th>Name</th><th>Description</th><th>Filter</th><th>Pages</th></tr>
      </thead>
      <tbody>
{aggregation_table}
      </tbody>
    </table>

    <h2>Aggregation Overlap Analysis</h2>
    <p>
      This section shows how each aggregation breaks down by other metadata dimensions.
      Select an aggregation to see its composition by scribal hand, Currier language, and illustration type.
    </p>
    
    <div class="overlap-section">
      <div class="overlap-controls">
        <label for="overlap-select">Select Aggregation:</label>
        <select id="overlap-select" onchange="updateOverlapCharts()">
          <option value="">-- Choose an aggregation --</option>
        </select>
        <span class="overlap-summary" id="overlap-summary"></span>
      </div>
      
      <div class="charts-grid" id="charts-container" style="display: none;">
        <div class="chart-container">
          <h4>By Scribal Hand</h4>
          <div class="bar-chart" id="hand-chart"></div>
        </div>
        <div class="chart-container">
          <h4>By Currier Language</h4>
          <div class="bar-chart" id="language-chart"></div>
        </div>
        <div class="chart-container">
          <h4>By Illustration Type</h4>
          <div class="bar-chart" id="illustration-chart"></div>
        </div>
      </div>
      
      <div class="no-data" id="no-selection">
        Select an aggregation above to view its composition breakdown.
      </div>
    </div>

    <h2>Illustration Types</h2>
    <p>
      Pages are classified by their illustration type, which often correlates
      with section boundaries in the manuscript.
    </p>
    <table>
      <thead>
        <tr><th>Code</th><th>Description</th></tr>
      </thead>
      <tbody>
{illustration_rows}
      </tbody>
    </table>

    <h2>Output Format</h2>
    <p>
      The pipeline outputs JSON files containing:
    </p>
    <ul>
      <li><strong>page_transitions.json</strong>: Per-page transition counts and metadata</li>
      <li><strong>aggregated/*.json</strong>: Aggregated counts and probabilities for each filter</li>
      <li><strong>metadata.json</strong>: Configuration and summary statistics</li>
      <li><strong>methodology.html</strong>: This document</li>
    </ul>

    <h2>Reading the Transition Matrix</h2>
    <p>
      In the visualization, rows represent the <strong>source</strong> character
      and columns represent the <strong>target</strong> character. Each cell shows
      how likely (or how often) the target character follows the source character.
    </p>
    <p>
      For example, a bright cell at row "k" and column "o" indicates that "o" 
      frequently follows "k" in the text. Row-normalized probabilities sum to 1.0
      across each row, showing the conditional probability P(target | source).
    </p>

    <p class="timestamp">
      Generated: {timestamp}
    </p>
  </div>

  <script>
    // Overlap statistics data
    const overlapStats = {overlap_json};
    
    // Illustration type labels
    const illustrationLabels = {{
      'A': 'Astronomical',
      'B': 'Biological',
      'C': 'Cosmological',
      'H': 'Herbal',
      'P': 'Pharmaceutical',
      'S': 'Stars',
      'T': 'Text only',
      'Z': 'Zodiac'
    }};
    
    // Aggregation order matching the table
    const aggregationOrder = [
      // All
      'all',
      // By Language
      'language_a', 'language_b',
      // By Hand
      'hand_1', 'hand_2', 'hand_3', 'hand_4', 'hand_5',
      // By Illustration
      'herbal', 'zodiac', 'biological', 'pharmaceutical', 'astronomical', 'cosmological', 'text_only',
      // By Quire
      'quire_13', 'quire_20',
      // Combined Filters
      'herbal_lang_a', 'herbal_lang_b', 'biological_lang_a', 'biological_lang_b'
    ];
    
    // Initialize the aggregation dropdown
    function initOverlapSelect() {{
      const select = document.getElementById('overlap-select');
      
      // Use the predefined order matching the table
      aggregationOrder.forEach(name => {{
        if (overlapStats[name]) {{
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name + ' (' + (overlapStats[name].total || 0) + ' pages)';
          select.appendChild(option);
        }}
      }});
    }}
    
    // Toggle folio details row
    function toggleFolioDetails(btn) {{
      const row = btn.closest('tr');
      const detailsRow = row.nextElementSibling;
      
      if (detailsRow && detailsRow.classList.contains('folio-details-row')) {{
        const isHidden = detailsRow.style.display === 'none';
        detailsRow.style.display = isHidden ? 'table-row' : 'none';
        btn.classList.toggle('expanded', isHidden);
        btn.textContent = isHidden ? '-' : '?';
      }}
    }}
    
    // Create a bar chart
    function createBarChart(container, data, total, cssClass) {{
      container.innerHTML = '';
      
      if (!data || Object.keys(data).length === 0) {{
        container.innerHTML = '<div class="no-data">No data</div>';
        return;
      }}
      
      // Sort by count descending
      const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
      
      sorted.forEach(([label, count]) => {{
        const pct = total > 0 ? (count / total * 100) : 0;
        
        // Get display label with fallbacks for empty values
        let displayLabel = label || 'Unknown';
        if (cssClass === 'illustration') {{
          displayLabel = illustrationLabels[label] || (label ? label : 'Unknown');
        }} else if (cssClass === 'hand') {{
          displayLabel = label ? 'Hand ' + label : 'Unknown';
        }} else if (cssClass === 'language') {{
          displayLabel = label ? 'Lang ' + label : 'Unknown';
        }}
        
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
          <span class="bar-label">${{displayLabel}}</span>
          <div class="bar-track">
            <div class="bar-fill ${{cssClass}}" style="width: ${{pct}}%"></div>
          </div>
          <span class="bar-value">${{pct.toFixed(1)}}%</span>
        `;
        container.appendChild(row);
      }});
    }}
    
    // Update overlap charts based on selection
    function updateOverlapCharts() {{
      const select = document.getElementById('overlap-select');
      const chartsContainer = document.getElementById('charts-container');
      const noSelection = document.getElementById('no-selection');
      const summary = document.getElementById('overlap-summary');
      
      const aggName = select.value;
      
      if (!aggName || !overlapStats[aggName]) {{
        chartsContainer.style.display = 'none';
        noSelection.style.display = 'block';
        summary.textContent = '';
        return;
      }}
      
      const stats = overlapStats[aggName];
      const total = stats.total || 0;
      
      chartsContainer.style.display = 'grid';
      noSelection.style.display = 'none';
      summary.textContent = total + ' pages total';
      
      // Create charts
      createBarChart(document.getElementById('hand-chart'), stats.hands, total, 'hand');
      createBarChart(document.getElementById('language-chart'), stats.languages, total, 'language');
      createBarChart(document.getElementById('illustration-chart'), stats.illustrations, total, 'illustration');
    }}
    
    // Initialize on load
    document.addEventListener('DOMContentLoaded', initOverlapSelect);
  </script>
</body>
</html>
'''
    return html


def save_methodology(output_path: Path, 
                     metadata_path: Optional[Path] = None,
                     page_transitions_path: Optional[Path] = None) -> None:
    """Generate and save the methodology HTML document."""
    html = generate_methodology_html(metadata_path, page_transitions_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


if __name__ == '__main__':
    output = Path('../../docs/markov/methodology.html')
    metadata = Path('../../docs/output/markov/metadata.json')
    page_transitions = Path('../../docs/output/markov/page_transitions.json')
    
    if len(sys.argv) > 1:
        output = Path(sys.argv[1])
    if len(sys.argv) > 2:
        metadata = Path(sys.argv[2])
    if len(sys.argv) > 3:
        page_transitions = Path(sys.argv[3])
    
    save_methodology(output, metadata, page_transitions)
    print(f"Generated methodology document: {output}")
