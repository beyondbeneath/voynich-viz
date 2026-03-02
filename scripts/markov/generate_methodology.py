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

# Add parent directory for common imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.normalizer import BIGRAM_TO_SINGLE, I_DISTINCT, E_DISTINCT
from common.config import ILLUSTRATION_TYPES

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


def generate_methodology_html(metadata_path: Optional[Path] = None) -> str:
    """Generate the methodology HTML document."""
    
    # Load metadata if available
    metadata = {}
    if metadata_path and metadata_path.exists():
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    
    config = metadata.get('config', {})
    total_pages = metadata.get('total_pages', '~226')
    
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
            f'          <tr class="group-header"><td colspan="3"><strong>{group_name}</strong></td></tr>'
        )
        for name in agg_names:
            if name in STANDARD_AGGREGATIONS:
                info = STANDARD_AGGREGATIONS[name]
                filter_desc = ', '.join(f'{k}={v}' for k, v in info['filter'].items()) if info['filter'] else 'None (all pages)'
                aggregation_rows.append(
                    f'          <tr><td><code>{name}</code></td><td>{info["description"]}</td><td>{filter_desc}</td></tr>'
                )
    
    aggregation_table = '\n'.join(aggregation_rows)
    
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
      scribal hands, or Currier languages.
    </p>
    <table>
      <thead>
        <tr><th>Name</th><th>Description</th><th>Filter</th></tr>
      </thead>
      <tbody>
{aggregation_table}
      </tbody>
    </table>

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
</body>
</html>
'''
    return html


def save_methodology(output_path: Path, metadata_path: Optional[Path] = None) -> None:
    """Generate and save the methodology HTML document."""
    html = generate_methodology_html(metadata_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


if __name__ == '__main__':
    output = Path('../../web/markov/methodology.html')
    metadata = Path('../../output/markov/metadata.json')
    
    if len(sys.argv) > 1:
        output = Path(sys.argv[1])
    if len(sys.argv) > 2:
        metadata = Path(sys.argv[2])
    
    save_methodology(output, metadata)
    print(f"Generated methodology document: {output}")
