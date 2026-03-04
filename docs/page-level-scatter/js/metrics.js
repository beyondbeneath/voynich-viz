/**
 * Page-level metric computation from existing analysis data.
 * All metrics are derived client-side—no extra data processing required.
 */

const Metrics = (function() {
  function shannonEntropy(probs) {
    let h = 0;
    for (const p of Object.values(probs)) {
      if (p > 0) h -= p * Math.log2(p);
    }
    return h;
  }

  return {
    /**
     * Compute all available metrics for a page, given the four page-level data sources.
     */
    computePageMetrics(folio, metadata, markovPage, ngramPage, wordposPage, pageposPage) {
      const m = { folio, metadata };
      if (!metadata) return m;

      // --- N-gram derived ---
      if (ngramPage?.unigrams?.frequencies) {
        const freqs = ngramPage.unigrams.frequencies;
        m.unigram_entropy = shannonEntropy(freqs);
        m.token_diversity = ngramPage.unigrams.unique / Math.max(1, ngramPage.unigrams.total);
      }
      if (ngramPage?.unigrams?.total && ngramPage?.bigrams?.total) {
        m.bigram_ratio = ngramPage.bigrams.total / Math.max(1, ngramPage.unigrams.total);
      }
      if (ngramPage?.bigrams?.frequencies) {
        m.bigram_entropy = shannonEntropy(ngramPage.bigrams.frequencies);
      }
      if (ngramPage?.trigrams?.total && ngramPage?.unigrams?.total) {
        m.trigram_ratio = ngramPage.trigrams.total / Math.max(1, ngramPage.unigrams.total);
      }

      // --- Markov derived ---
      if (markovPage?.transitions) {
        const counts = Object.values(markovPage.transitions);
        const total = counts.reduce((a, b) => a + b, 0);
        if (total > 0) {
          const probs = counts.map(c => c / total);
          m.transition_entropy = shannonEntropy(probs);
          m.unique_transitions = Object.keys(markovPage.transitions).length;
          m.transition_diversity = m.unique_transitions / total;
        }
      }

      // --- Word position derived ---
      if (wordposPage?.characters) {
        let posEntropySum = 0;
        let startBiasSum = 0;
        let endBiasSum = 0;
        let n = 0;
        for (const ch of Object.values(wordposPage.characters)) {
          if (ch?.ratios && ch.total > 0) {
            const r = ch.ratios;
            const probs = [r.start, r.middle, r.end, r.only].filter(p => p > 0);
            if (probs.length) posEntropySum += shannonEntropy(probs);
            startBiasSum += r.start || 0;
            endBiasSum += r.end || 0;
            n++;
          }
        }
        if (n > 0) {
          m.wordpos_entropy = posEntropySum / n;
          m.start_bias = startBiasSum / n;
          m.end_bias = endBiasSum / n;
        }
      }

      // --- Page position derived (coarse grid) ---
      if (pageposPage?.normalization_modes?.page?.coarse?.characters) {
        const chars = pageposPage.normalization_modes.page.coarse.characters;
        const grid = pageposPage.normalization_modes.page.coarse;
        const cols = grid.grid_cols || 5;
        const rows = grid.grid_rows || 10;

        let totalMass = 0;
        let sumCol = 0, sumRow = 0;
        let sumCol2 = 0, sumRow2 = 0;

        for (const chData of Object.values(chars)) {
          if (!chData?.cells) continue;
          for (const [cell, count] of Object.entries(chData.cells)) {
            const [c, r] = cell.split(',').map(Number);
            totalMass += count;
            sumCol += c * count;
            sumRow += r * count;
            sumCol2 += c * c * count;
            sumRow2 += r * r * count;
          }
        }

        if (totalMass > 0) {
          const centerCol = sumCol / totalMass;
          const centerRow = sumRow / totalMass;
          m.page_center_x = centerCol / (cols - 1);  // 0–1
          m.page_center_y = centerRow / (rows - 1);  // 0–1
          const varCol = (sumCol2 / totalMass) - (centerCol * centerCol);
          const varRow = (sumRow2 / totalMass) - (centerRow * centerRow);
          m.page_spread = Math.sqrt(Math.max(0, varCol) + Math.max(0, varRow));
        }
      }

      return m;
    },

    /**
     * Metric definitions for axis dropdowns.
     */
    DEFINITIONS: [
      { id: 'unigram_entropy', label: 'Unigram entropy', desc: 'Shannon entropy of character frequencies. Higher = more varied character use.' },
      { id: 'token_diversity', label: 'Token diversity', desc: 'Unique characters / total characters. Higher = more diverse charset.' },
      { id: 'bigram_ratio', label: 'Bigram ratio', desc: 'Bigram count / unigram count. Indicates sequential structure.' },
      { id: 'bigram_entropy', label: 'Bigram entropy', desc: 'Shannon entropy of bigram frequencies. Higher = more varied bigram use.' },
      { id: 'trigram_ratio', label: 'Trigram ratio', desc: 'Trigram count / unigram count. Indicates longer-sequence structure.' },
      { id: 'transition_entropy', label: 'Transition entropy', desc: 'Entropy of Markov transitions. Higher = less predictable sequences.' },
      { id: 'transition_diversity', label: 'Transition diversity', desc: 'Unique transitions / total transitions.' },
      { id: 'wordpos_entropy', label: 'Word position entropy', desc: 'Avg entropy of char position (start/mid/end). Higher = less positional bias.' },
      { id: 'start_bias', label: 'Start bias', desc: 'Average ratio of characters at word start.' },
      { id: 'end_bias', label: 'End bias', desc: 'Average ratio of characters at word end.' },
      { id: 'page_center_x', label: 'Page center X', desc: 'Horizontal center of text on page (0=left, 1=right).' },
      { id: 'page_center_y', label: 'Page center Y', desc: 'Vertical center of text on page (0=top, 1=bottom).' },
      { id: 'page_spread', label: 'Page spread', desc: 'Spatial spread of text on page.' },
    ],
  };
})();
