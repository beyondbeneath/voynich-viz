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
  
  let isInitializing = true;
  
  /**
   * Read state from URL hash parameters.
   */
  function readUrlState() {
    const params = UrlState.parse();
    const urlState = {};
    
    if (params.mode && ['single', 'compare', 'diff'].includes(params.mode)) {
      urlState.viewMode = params.mode;
    }
    if (params.agg) {
      urlState.aggregation = params.agg;
    }
    if (params.aggB) {
      urlState.aggregationB = params.aggB;
    }
    if (params.ngram && ['bigram', 'unigram', 'trigram'].includes(params.ngram)) {
      urlState.ngramType = params.ngram;
    }
    if (params.display && ['frequencies', 'counts'].includes(params.display)) {
      urlState.displayMode = params.display;
    }
    if (params.color) {
      urlState.colorScale = params.color;
    }
    if (params.log !== undefined) {
      urlState.useLogScale = UrlState.toBool(params.log);
    }
    if (params.font !== undefined) {
      urlState.useVoynichFont = UrlState.toBool(params.font, true);
    }
    
    return urlState;
  }
  
  /**
   * Update URL hash with current state.
   */
  function updateUrl() {
    if (isInitializing) return;
    
    const params = {
      mode: state.viewMode,
      agg: state.currentAggregation,
      ngram: state.settings.ngramType,
      display: state.settings.displayMode,
      color: state.settings.colorScale,
      log: UrlState.fromBool(state.settings.useLogScale),
      font: UrlState.fromBool(state.settings.useVoynichFont),
    };
    
    if (state.viewMode !== 'single' && state.currentAggregationB) {
      params.aggB = state.currentAggregationB;
    }
    
    UrlState.update(params, true);
    UrlState.notifyParent(params);
  }
  
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
    
    // Read URL state before setting up
    const urlState = readUrlState();
    
    Heatmap.init(elements.canvas, 'primary');
    Heatmap.init(elements.canvasB, 'secondary');
    Heatmap.setHoverCallback(handleHover);
    
    setupEventListeners();
    
    // Apply URL state to settings
    if (urlState.ngramType) {
      state.settings.ngramType = urlState.ngramType;
      elements.ngramType.value = urlState.ngramType;
    }
    if (urlState.displayMode) {
      state.settings.displayMode = urlState.displayMode;
      elements.displayMode.forEach(radio => {
        radio.checked = radio.value === urlState.displayMode;
      });
    }
    if (urlState.colorScale) {
      state.settings.colorScale = urlState.colorScale;
      elements.colorScale.value = urlState.colorScale;
    }
    if (urlState.useLogScale !== undefined) {
      state.settings.useLogScale = urlState.useLogScale;
      elements.logScale.checked = urlState.useLogScale;
    }
    if (urlState.useVoynichFont !== undefined) {
      state.settings.useVoynichFont = urlState.useVoynichFont;
      elements.voynichFont.checked = urlState.useVoynichFont;
    }
    
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
    
    await loadManifest(urlState);
  }
  
  /**
   * Set up event listeners.
   */
  function setupEventListeners() {
    elements.viewMode.addEventListener('change', (e) => {
      setViewMode(e.target.value, false);
    });
    
    elements.aggregationSelect.addEventListener('change', (e) => {
      loadAggregation(e.target.value, false);
    });
    
    elements.aggregationSelectB.addEventListener('change', (e) => {
      loadAggregationB(e.target.value, false);
    });
    
    elements.ngramType.addEventListener('change', (e) => {
      state.settings.ngramType = e.target.value;
      renderVisualization();
      updateTopNgrams();
      updateUrl();
    });
    
    elements.displayMode.forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.displayMode = e.target.value;
        renderVisualization();
        updateUrl();
      });
    });
    
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      renderVisualization();
      updateTopNgrams();
      updateUrl();
    });
    
    elements.logScale.addEventListener('change', (e) => {
      state.settings.useLogScale = e.target.checked;
      renderVisualization();
      updateUrl();
    });
    
    elements.colorScale.addEventListener('change', (e) => {
      state.settings.colorScale = e.target.value;
      updateLegendGradient();
      renderVisualization();
      updateUrl();
    });
  }
  
  /**
   * Set view mode.
   * @param {boolean} [skipUrlUpdate=false] - Skip URL update
   */
  function setViewMode(mode, skipUrlUpdate = false) {
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
      loadAggregationB(defaultB, skipUrlUpdate);
    } else {
      renderVisualization();
    }
    
    updateInfoPanel();
    
    if (!skipUrlUpdate) {
      updateUrl();
    }
  }
  
  /**
   * Load the transcription config and manifest.
   * @param {Object} [urlState] - State from URL to apply
   */
  async function loadManifest(urlState = {}) {
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
      
      selectB.value = urlState.aggregationB || 'language_b';
      
      // Load aggregation from URL state or default
      const initialAggregation = urlState.aggregation || state.settings.aggregation;
      await loadAggregation(initialAggregation, true);
      
      // Apply view mode from URL state
      if (urlState.viewMode) {
        elements.viewMode.value = urlState.viewMode;
        setViewMode(urlState.viewMode, true);
        
        if (urlState.aggregationB && (urlState.viewMode === 'compare' || urlState.viewMode === 'diff')) {
          await loadAggregationB(urlState.aggregationB, true);
        }
      }
      
      // Mark initialization complete and update URL
      isInitializing = false;
      updateUrl();
      
      requestAnimationFrame(() => {
        renderVisualization();
      });
      
    } catch (error) {
      showError(`Failed to load data: ${error.message}`);
      isInitializing = false;
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Load aggregation A.
   * @param {boolean} [skipUrlUpdate=false] - Skip URL update
   */
  async function loadAggregation(name, skipUrlUpdate = false) {
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
      
      if (!skipUrlUpdate) {
        updateUrl();
      }
      
    } catch (error) {
      showError(`Failed to load aggregation: ${error.message}`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Load aggregation B.
   * @param {boolean} [skipUrlUpdate=false] - Skip URL update
   */
  async function loadAggregationB(name, skipUrlUpdate = false) {
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
      
      if (!skipUrlUpdate) {
        updateUrl();
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
