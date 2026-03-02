# Voynich: Analysis & Visualization

A suite of Python analysis tools and web-based visualizations for exploring the Voynich manuscript transcription.

## What this project does

This repository provides multiple analysis pipelines over the Voynich transcription:

1. **Parse** IVTFF transcription and extract page metadata (Currier language, hand, section/illustration type)
2. **Normalize** glyph sequences (including bigram collapsing and i/e handling modes)
3. **Analyze** via multiple methods:
   - **Markov**: Character transition probabilities with boundary markers
   - **N-gram**: Unigram, bigram, and trigram frequency analysis
   - **Word Position**: Character preferences for word start/middle/end positions
   - **Page Position**: Spatial distribution of characters on the page (left/right, top/bottom)
4. **Aggregate** results by filters (language, hand, section, and combinations)
5. **Visualize** in the browser with compare and diff modes

## Repository structure

```text
voynich/
├── data/
│   ├── voynich-transcription.txt
│   └── transcription-format.html
├── scripts/
│   ├── common/                    # Shared parser, normalizer, config
│   ├── markov/                    # Markov transition pipeline
│   ├── ngram/                     # N-gram analysis pipeline
│   ├── wordpos/                   # Word position pipeline
│   ├── pagepos/                   # Page position pipeline
│   └── requirements.txt
└── docs/                          # GitHub Pages root
    ├── index.html                 # Analysis landing page
    ├── output/                    # Generated data (scripts write here)
    │   ├── transcription_config.json
    │   ├── markov/
    │   ├── ngram/
    │   ├── wordpos/
    │   └── pagepos/
    ├── markov/                    # Transition matrix visualization
    ├── ngram/                     # N-gram frequency visualization
    ├── wordpos/                   # Word position visualization
    └── pagepos/                   # Page position visualization
```

## Install

Run from the repository root:

```bash
pip install -r scripts/requirements.txt
```

## Reproduce data extraction

Run from the repository root:

```bash
# Markov: Full pipeline with default settings
python -m scripts.markov.main --input data/voynich-transcription.txt --output docs/output/markov/ -v

# N-gram extraction (unigram/bigram/trigram frequencies)
python -m scripts.ngram.main --input data/voynich-transcription.txt --output docs/output/ngram/ -v

# Word-position extraction (start/middle/end preferences)
python -m scripts.wordpos.main --input data/voynich-transcription.txt --output docs/output/wordpos/ -v

# Page-position extraction (spatial distribution on page)
python -m scripts.pagepos.main --input data/voynich-transcription.txt --output docs/output/pagepos/ -v
```

The page position analysis supports two normalization modes:
- **Page-relative**: Positions normalized within each page (a 2-line page has lines at 0% and 100%)
- **Manuscript-relative**: Positions normalized to global max (81 lines, 97 chars/line observed)

### Variants
```
# Markov: 2) Collapsed i/e mode
python -m scripts.markov.main --input data/voynich-transcription.txt --output docs/output/markov/ --bigram-mode collapsed -v

# Markov: 3) Disable boundary tokens
python -m scripts.markov.main --input data/voynich-transcription.txt --output docs/output/markov/ --no-word-boundaries --no-line-boundaries -v
```

## Run the web viewer

```bash
cd docs
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Output files

Each analysis script generates:

- `docs/output/<method>/page_*.json` — Per-page analysis results
- `docs/output/<method>/aggregated/*.json` — Aggregated results by filters
- `docs/output/<method>/aggregated/manifest.json` — Available aggregations
- `docs/output/<method>/metadata.json` — Processing configuration

Additionally, all scripts output a shared config file:

- `docs/output/transcription_config.json` — Character ordering, display mappings, boundary tokens, and aggregation definitions used by all web visualizations

## Configuration architecture

The project uses a **single source of truth** pattern for transcription config:

1. **Python** (`scripts/common/config.py`) defines all shared configuration:
   - Character display mappings (e.g., `C` → `ch`, `1` → `i`)
   - Canonical character ordering for visualizations
   - Boundary token definitions
   - Aggregation filter definitions

2. **On each run**, scripts output `docs/output/transcription_config.json`

3. **Web visualizations** load this JSON at startup, so changes to the Python config automatically propagate to all viewers after re-running the scripts

This means you can modify character ordering, add new aggregations, or change display mappings in one place (`scripts/common/config.py`), re-run the analysis, and all visualizations update automatically.

## Visual placeholders

<!-- Placeholder: replace with actual images/screenshots when available -->

![Transition matrix placeholder](docs/images/transition-matrix-placeholder.png)
_Transition matrix heatmap (single dataset view)._

![Comparison view placeholder](docs/images/comparison-placeholder.png)
_Comparison view between two selected subsets._

![Diff view placeholder](docs/images/diff-placeholder.png)
_Diff view highlighting transition deltas._

## Add a new analysis type

To add another analysis module:

1. Create `scripts/<name>/` with a CLI entry point (`main.py`) and analysis modules
2. Import shared config from `common.config` (character sets, aggregations, etc.)
3. Call `save_transcription_config()` after processing to update the shared config
4. Write results to `docs/output/<name>/`
5. Build a viewer in `docs/<name>/` that loads `transcription_config.json` on init
6. Add a card/link in `docs/index.html`
