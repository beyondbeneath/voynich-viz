/**
 * Main application module for Voynich n-gram visualizer.
 */

const App = (function() {
  let state = {
    manifest: null,
    viewMode: 'single',
    currentAggregation: null,
    currentAggregationB: null,
    currentData: null,
    currentDataB: null,
    diffData: null,
    settings: { ...Config.DEFAULTS },
    loading: false,
  };
  
  let elements = {};
  
  /**
   * Initialize the application.
   */
  async function init() {
    elements = {
      canvas: document.getElementById('viz-canvas'),
      canvasB: document.getElementById('viz-canvas-b'),
      vizArea: document.getElementById('viz-area'),
      vizContainerA: document.getElementById('viz-container-a'),
      vizContainerB: document.getElementById('viz-container-b'),
      vizLabelA: document.getElementById('viz-label-a'),
      vizLabelB: document.getElementById('viz-label-b'),
      viewMode: document.getElementById('view-mode'),
      aggregationSelect: document.getElementById('aggregation-select'),
      aggregationSelectB: document.getElementById('aggregation-select-b'),
      aggregationBGroup: document.getElementById('aggregation-b-group'),
      aggregationLabel: document.getElementById('aggregation-label'),
      ngramType: document.getElementById('ngram-type'),
      displayMode: document.getElementsByName('display-mode'),
      colorScale: document.getElementById('color-scale'),
      voynichFont: document.getElementById('voynich-font'),
      logScale: document.getElementById('log-scale'),
      hoverInfo: document.getElementById('hover-info'),
      topNgrams: document.getElementById('top-ngrams'),
      loadingOverlay: document.getElementById('loading-overlay'),
      errorMessage: document.getElementById('error-message'),
      pageCount: document.getElementById('page-count'),
      wordCount: document.getElementById('word-count'),
      description: document.getElementById('description'),
      infoCardSingle: document.getElementById('info-card-single'),
      infoCardCompare: document.getElementById('info-card-compare'),
      compareDescA: document.getElementById('compare-desc-a'),
      compareDescB: document.getElementById('compare-desc-b'),
      comparePagesA: document.getElementById('compare-pages-a'),
      comparePagesB: document.getElementById('compare-pages-b'),
      legendStandard: document.getElementById('legend-standard'),
      legendDiff: document.getElementById('legend-diff'),
      legendGradient: document.getElementById('legend-gradient'),
      legendGradientDiff: document.getElementById('legend-gradient-diff'),
    };
    
    Heatmap.init(elements.canvas, 'primary');
    Heatmap.init(elements.canvasB, 'secondary');
    Heatmap.setHoverCallback(handleHover);
    
    setupEventListeners();
    
    state.settings.useVoynichFont = elements.voynichFont.checked;
    state.settings.useLogScale = elements.logScale.checked;
    state.settings.colorScale = elements.colorScale.value;
    
    updateLegendGradient();
    updateDiffLegendGradient();
    
    try {
      await document.fonts.load('14px Voynich');
    } catch (e) {
      console.warn('Could not load Voynich font:', e);
    }
    
    await loadManifest();
  }
  
  /**
   * Set up event listeners.
   */
  function setupEventListeners() {
    elements.viewMode.addEventListener('change', (e) => {
      setViewMode(e.target.value);
    });
    
    elements.aggregationSelect.addEventListener('change', (e) => {
      loadAggregation(e.target.value);
    });
    
    elements.aggregationSelectB.addEventListener('change', (e) => {
      loadAggregationB(e.target.value);
    });
    
    elements.ngramType.addEventListener('change', (e) => {
      state.settings.ngramType = e.target.value;
      renderVisualization();
      updateTopNgrams();
    });
    
    elements.displayMode.forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.displayMode = e.target.value;
        renderVisualization();
      });
    });
    
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      renderVisualization();
      updateTopNgrams();
    });
    
    elements.logScale.addEventListener('change', (e) => {
      state.settings.useLogScale = e.target.checked;
      renderVisualization();
    });
    
    elements.colorScale.addEventListener('change', (e) => {
      state.settings.colorScale = e.target.value;
      updateLegendGradient();
      renderVisualization();
    });
  }
  
  /**
   * Set view mode.
   */
  function setViewMode(mode) {
    state.viewMode = mode;
    
    const isCompareOrDiff = mode === 'compare' || mode === 'diff';
    const isCompare = mode === 'compare';
    const isDiff = mode === 'diff';
    
    elements.aggregationBGroup.style.display = isCompareOrDiff ? '' : 'none';
    elements.aggregationLabel.textContent = isCompareOrDiff ? 'A' : 'Aggregation';
    elements.vizContainerB.style.display = isCompare ? '' : 'none';
    elements.vizArea.classList.toggle('compare-mode', isCompare);
    
    elements.infoCardSingle.style.display = isCompareOrDiff ? 'none' : '';
    elements.infoCardCompare.style.display = isCompareOrDiff ? '' : 'none';
    
    elements.legendStandard.style.display = isDiff ? 'none' : '';
    elements.legendDiff.style.display = isDiff ? '' : 'none';
    
    if (isCompare) {
      elements.vizLabelA.textContent = 'A: ' + (state.currentData?.description || '');
      elements.vizLabelB.textContent = 'B: ' + (state.currentDataB?.description || '');
    } else {
      elements.vizLabelA.textContent = '';
    }
    
    if (isCompareOrDiff && !state.currentDataB) {
      const defaultB = state.currentAggregation === 'language_a' ? 'language_b' : 'language_a';
      loadAggregationB(defaultB);
    } else {
      renderVisualization();
    }
    
    updateInfoPanel();
  }
  
  /**
   * Load the transcription config and manifest.
   */
  async function loadManifest() {
    showLoading(true);
    
    try {
      // Load transcription config first (initializes Config module)
      await DataLoader.loadTranscriptionConfig();
      
      state.manifest = await DataLoader.loadManifest();
      
      const select = elements.aggregationSelect;
      const selectB = elements.aggregationSelectB;
      select.innerHTML = '';
      selectB.innerHTML = '';
      
      for (const agg of state.manifest.aggregations) {
        if (agg.page_count === 0) continue;
        
        const option = document.createElement('option');
        option.value = agg.name;
        option.textContent = `${agg.description} (${agg.page_count} pages)`;
        select.appendChild(option);
        
        const optionB = option.cloneNode(true);
        selectB.appendChild(optionB);
      }
      
      selectB.value = 'language_b';
      
      await loadAggregation(state.settings.aggregation);
      
      requestAnimationFrame(() => {
        renderVisualization();
      });
      
    } catch (error) {
      showError(`Failed to load data: ${error.message}`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Load aggregation A.
   */
  async function loadAggregation(name) {
    showLoading(true);
    
    try {
      state.currentAggregation = name;
      state.currentData = await DataLoader.loadAggregation(name);
      
      if (state.viewMode === 'diff' && state.currentDataB) {
        state.diffData = DataLoader.computeDiff(state.currentData, state.currentDataB);
      }
      
      updateInfoPanel();
      renderVisualization();
      updateTopNgrams();
      
      elements.aggregationSelect.value = name;
      
      if (state.viewMode === 'compare') {
        elements.vizLabelA.textContent = 'A: ' + state.currentData.description;
      }
      
    } catch (error) {
      showError(`Failed to load aggregation: ${error.message}`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Load aggregation B.
   */
  async function loadAggregationB(name) {
    showLoading(true);
    
    try {
      state.currentAggregationB = name;
      state.currentDataB = await DataLoader.loadAggregation(name);
      
      if (state.viewMode === 'diff' && state.currentData) {
        state.diffData = DataLoader.computeDiff(state.currentData, state.currentDataB);
      }
      
      updateInfoPanel();
      renderVisualization();
      
      elements.aggregationSelectB.value = name;
      
      if (state.viewMode === 'compare') {
        elements.vizLabelB.textContent = 'B: ' + state.currentDataB.description;
      }
      
    } catch (error) {
      showError(`Failed to load aggregation B: ${error.message}`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Render the visualization.
   */
  function renderVisualization() {
    if (!state.currentData) return;
    
    const settings = { ...state.settings };
    
    if (state.viewMode === 'single') {
      Heatmap.render(state.currentData, settings, 'primary');
    } else if (state.viewMode === 'compare') {
      Heatmap.render(state.currentData, settings, 'primary');
      if (state.currentDataB) {
        Heatmap.render(state.currentDataB, settings, 'secondary');
      }
    } else if (state.viewMode === 'diff') {
      if (state.currentData && state.currentDataB) {
        if (!state.diffData) {
          state.diffData = DataLoader.computeDiff(state.currentData, state.currentDataB);
        }
        Heatmap.renderDiff(state.diffData, settings, 'primary');
      }
    }
  }
  
  /**
   * Handle hover.
   */
  function handleHover(info) {
    if (!info) {
      elements.hoverInfo.innerHTML = '<span class="placeholder">Hover over a cell to see details</span>';
      return;
    }
    
    const voynichClass = state.settings.useVoynichFont ? ' voynich-text' : '';
    let html = `<span class="ngram-display${voynichClass}">${escapeHtml(info.ngramDisplay)}</span>`;
    
    if (info.isDiff) {
      const sign = info.diff >= 0 ? '+' : '';
      const diffClass = info.diff > 0.001 ? 'diff-positive' : (info.diff < -0.001 ? 'diff-negative' : 'diff-neutral');
      
      html += `
        <div class="detail-row">
          <span>Difference:</span>
          <span class="${diffClass}">${sign}${(info.diff * 100).toFixed(3)}%</span>
        </div>
        <div class="detail-row">
          <span>A frequency:</span>
          <span>${(info.freqA * 100).toFixed(3)}%</span>
        </div>
        <div class="detail-row">
          <span>B frequency:</span>
          <span>${(info.freqB * 100).toFixed(3)}%</span>
        </div>
      `;
    } else {
      html += `
        <div class="detail-row">
          <span>Frequency:</span>
          <span>${(info.frequency * 100).toFixed(3)}%</span>
        </div>
        <div class="detail-row">
          <span>Count:</span>
          <span>${info.count.toLocaleString()}</span>
        </div>
      `;
    }
    
    elements.hoverInfo.innerHTML = html;
  }
  
  /**
   * Update top n-grams list.
   */
  function updateTopNgrams() {
    if (!state.currentData) {
      elements.topNgrams.innerHTML = '<span class="placeholder">Loading...</span>';
      return;
    }
    
    const ngramType = state.settings.ngramType;
    let ngrams = {};
    let title = '';
    
    if (ngramType === 'unigram') {
      ngrams = state.currentData.unigrams?.frequencies || {};
      title = 'Top Unigrams';
    } else if (ngramType === 'bigram') {
      ngrams = state.currentData.bigrams?.frequencies || {};
      title = 'Top Bigrams';
    } else {
      ngrams = state.currentData.trigrams?.frequencies || {};
      title = 'Top Trigrams';
    }
    
    const sorted = Object.entries(ngrams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    if (sorted.length === 0) {
      elements.topNgrams.innerHTML = '<span class="placeholder">No data</span>';
      return;
    }
    
    const voynichClass = state.settings.useVoynichFont ? ' voynich-text' : '';
    let html = '<ul class="ngram-list">';
    for (const [ngram, freq] of sorted) {
      const display = Config.getNgramDisplay(ngram, state.settings.useVoynichFont);
      html += `<li><span class="ngram${voynichClass}">${escapeHtml(display)}</span><span class="freq">${(freq * 100).toFixed(2)}%</span></li>`;
    }
    html += '</ul>';
    
    elements.topNgrams.innerHTML = html;
  }
  
  /**
   * Update the info panel.
   */
  function updateInfoPanel() {
    if (!state.currentData) return;
    
    if (state.viewMode === 'single') {
      elements.pageCount.textContent = state.currentData.page_count;
      elements.wordCount.textContent = state.currentData.total_words?.toLocaleString() || '-';
      elements.description.textContent = state.currentData.description;
    } else {
      elements.compareDescA.textContent = state.currentData.description;
      elements.comparePagesA.textContent = state.currentData.page_count;
      
      if (state.currentDataB) {
        elements.compareDescB.textContent = state.currentDataB.description;
        elements.comparePagesB.textContent = state.currentDataB.page_count;
      }
    }
  }
  
  /**
   * Update legend gradient.
   */
  function updateLegendGradient() {
    const scaleName = state.settings.colorScale || 'viridis';
    const scale = Config.COLOR_SCALES[scaleName] || Config.COLOR_SCALES.viridis;
    const stops = scale.stops.map(stop => {
      const [r, g, b] = stop.color;
      return `rgb(${r}, ${g}, ${b}) ${stop.pos * 100}%`;
    });
    elements.legendGradient.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  }
  
  /**
   * Update diff legend gradient.
   */
  function updateDiffLegendGradient() {
    const stops = Config.DIFF_COLOR_SCALE.stops.map(stop => {
      const [r, g, b] = stop.color;
      return `rgb(${r}, ${g}, ${b}) ${stop.pos * 100}%`;
    });
    elements.legendGradientDiff.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  }
  
  /**
   * Show/hide loading.
   */
  function showLoading(show) {
    state.loading = show;
    elements.loadingOverlay.classList.toggle('visible', show);
  }
  
  /**
   * Show error.
   */
  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.add('visible');
    setTimeout(() => {
      elements.errorMessage.classList.remove('visible');
    }, 5000);
  }
  
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  return {
    init,
    loadAggregation,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
