/**
 * Main application module for Voynich word position visualizer.
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
    if (params.sort && ['start', 'position', 'total', 'middle', 'end', 'alpha'].includes(params.sort)) {
      urlState.sortBy = params.sort;
    }
    if (params.font !== undefined) {
      urlState.useVoynichFont = UrlState.toBool(params.font, true);
    }
    if (params.only !== undefined) {
      urlState.showOnly = UrlState.toBool(params.only, true);
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
      sort: state.settings.sortBy,
      font: UrlState.fromBool(state.settings.useVoynichFont),
      only: UrlState.fromBool(state.settings.showOnly),
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
      canvas: document.getElementById('chart-canvas'),
      canvasB: document.getElementById('chart-canvas-b'),
      chartArea: document.getElementById('chart-area'),
      chartContainerA: document.getElementById('chart-container-a'),
      chartContainerB: document.getElementById('chart-container-b'),
      chartLabelA: document.getElementById('chart-label-a'),
      chartLabelB: document.getElementById('chart-label-b'),
      viewMode: document.getElementById('view-mode'),
      aggregationSelect: document.getElementById('aggregation-select'),
      aggregationSelectB: document.getElementById('aggregation-select-b'),
      aggregationBGroup: document.getElementById('aggregation-b-group'),
      aggregationLabel: document.getElementById('aggregation-label'),
      sortBy: document.getElementById('sort-by'),
      voynichFont: document.getElementById('voynich-font'),
      showOnly: document.getElementById('show-only'),
      hoverInfo: document.getElementById('hover-info'),
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
      compareWordsA: document.getElementById('compare-words-a'),
      compareWordsB: document.getElementById('compare-words-b'),
      legendStandard: document.getElementById('legend-standard'),
      legendDiff: document.getElementById('legend-diff'),
      legendOnlyItem: document.getElementById('legend-only-item'),
    };
    
    // Read URL state before setting up
    const urlState = readUrlState();
    
    Chart.init(elements.canvas, 'primary');
    Chart.init(elements.canvasB, 'secondary');
    Chart.setHoverCallback(handleHover);
    
    setupEventListeners();
    
    // Apply URL state to settings
    if (urlState.sortBy) {
      state.settings.sortBy = urlState.sortBy;
      elements.sortBy.value = urlState.sortBy;
    }
    if (urlState.useVoynichFont !== undefined) {
      state.settings.useVoynichFont = urlState.useVoynichFont;
      elements.voynichFont.checked = urlState.useVoynichFont;
    }
    if (urlState.showOnly !== undefined) {
      state.settings.showOnly = urlState.showOnly;
      elements.showOnly.checked = urlState.showOnly;
      elements.legendOnlyItem.style.display = urlState.showOnly ? '' : 'none';
    }
    
    state.settings.useVoynichFont = elements.voynichFont.checked;
    state.settings.showOnly = elements.showOnly.checked;
    
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
    
    elements.sortBy.addEventListener('change', (e) => {
      state.settings.sortBy = e.target.value;
      renderChart();
      updateUrl();
    });
    
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      renderChart();
      updateUrl();
    });
    
    elements.showOnly.addEventListener('change', (e) => {
      state.settings.showOnly = e.target.checked;
      elements.legendOnlyItem.style.display = e.target.checked ? '' : 'none';
      renderChart();
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
    elements.chartContainerB.style.display = isCompare ? '' : 'none';
    elements.chartArea.classList.toggle('compare-mode', isCompare);
    
    elements.infoCardSingle.style.display = isCompareOrDiff ? 'none' : '';
    elements.infoCardCompare.style.display = isCompareOrDiff ? '' : 'none';
    
    elements.legendStandard.style.display = isDiff ? 'none' : '';
    elements.legendDiff.style.display = isDiff ? '' : 'none';
    
    if (isCompare) {
      elements.chartLabelA.textContent = 'A: ' + (state.currentData?.description || '');
      elements.chartLabelB.textContent = 'B: ' + (state.currentDataB?.description || '');
    } else {
      elements.chartLabelA.textContent = '';
    }
    
    if (isCompareOrDiff && !state.currentDataB) {
      const defaultB = state.currentAggregation === 'language_a' ? 'language_b' : 'language_a';
      loadAggregationB(defaultB, skipUrlUpdate);
    } else {
      renderChart();
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
        renderChart();
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
      renderChart();
      
      elements.aggregationSelect.value = name;
      
      if (state.viewMode === 'compare') {
        elements.chartLabelA.textContent = 'A: ' + state.currentData.description;
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
      renderChart();
      
      elements.aggregationSelectB.value = name;
      
      if (state.viewMode === 'compare') {
        elements.chartLabelB.textContent = 'B: ' + state.currentDataB.description;
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
   * Render the chart.
   */
  function renderChart() {
    if (!state.currentData) return;
    
    const settings = { ...state.settings };
    
    if (state.viewMode === 'single') {
      Chart.render(state.currentData, settings, 'primary');
    } else if (state.viewMode === 'compare') {
      // Compute order from dataset A
      const sortedChars = Config.sortCharactersBy(state.currentData.characters, settings.sortBy);
      const fixedOrder = sortedChars.filter(c => state.currentData.characters[c] && state.currentData.characters[c].total > 0);
      
      Chart.render(state.currentData, settings, 'primary');
      if (state.currentDataB) {
        // Use the same order from A for B
        const settingsB = { ...settings, fixedOrder };
        Chart.render(state.currentDataB, settingsB, 'secondary');
      }
    } else if (state.viewMode === 'diff') {
      if (state.currentData && state.currentDataB) {
        if (!state.diffData) {
          state.diffData = DataLoader.computeDiff(state.currentData, state.currentDataB);
        }
        Chart.renderDiff(state.diffData, settings, 'primary');
      }
    }
  }
  
  /**
   * Handle hover.
   */
  function handleHover(info) {
    if (!info) {
      elements.hoverInfo.innerHTML = '<span class="placeholder">Hover over a bar to see details</span>';
      return;
    }
    
    const voynichClass = state.settings.useVoynichFont ? ' voynich-text' : '';
    let html = `<span class="char-display${voynichClass}">${escapeHtml(info.charDisplay)}</span>`;
    
    if (info.isDiff) {
      const positions = ['start', 'middle', 'end'];
      if (state.settings.showOnly) positions.push('only');
      
      for (const pos of positions) {
        const diff = info.diff[pos];
        const sign = diff >= 0 ? '+' : '';
        const diffClass = diff > 0.01 ? 'diff-positive' : (diff < -0.01 ? 'diff-negative' : 'diff-neutral');
        
        html += `
          <div class="position-row">
            <span class="position-label">${capitalize(pos)}:</span>
            <span class="position-value ${diffClass}">${sign}${(diff * 100).toFixed(1)}%</span>
          </div>
          <div style="font-size: 11px; color: #888; margin-bottom: 4px;">
            A: ${(info.ratiosA[pos] * 100).toFixed(1)}% | B: ${(info.ratiosB[pos] * 100).toFixed(1)}%
          </div>
        `;
      }
    } else {
      html += `<div style="margin-bottom: 6px; font-size: 12px; color: #666;">Total: ${info.total.toLocaleString()}</div>`;
      
      const positions = ['start', 'middle', 'end'];
      if (state.settings.showOnly) positions.push('only');
      
      for (const pos of positions) {
        const ratio = info.ratios[pos];
        const count = info.counts[pos];
        const color = Config.POSITION_COLORS[pos];
        
        html += `
          <div class="position-row">
            <span class="position-label">${capitalize(pos)}:</span>
            <span class="position-value">${(ratio * 100).toFixed(1)}% (${count.toLocaleString()})</span>
          </div>
          <div class="position-bar">
            <div class="position-fill" style="width: ${ratio * 100}%; background: ${color};"></div>
          </div>
        `;
      }
    }
    
    elements.hoverInfo.innerHTML = html;
  }
  
  /**
   * Update the info panel.
   */
  function updateInfoPanel() {
    if (!state.currentData) return;
    
    if (state.viewMode === 'single') {
      elements.pageCount.textContent = state.currentData.page_count;
      elements.wordCount.textContent = state.currentData.word_count?.toLocaleString() || '-';
      elements.description.textContent = state.currentData.description;
    } else {
      elements.compareDescA.textContent = state.currentData.description;
      elements.comparePagesA.textContent = state.currentData.page_count;
      elements.compareWordsA.textContent = state.currentData.word_count?.toLocaleString() || '-';
      
      if (state.currentDataB) {
        elements.compareDescB.textContent = state.currentDataB.description;
        elements.comparePagesB.textContent = state.currentDataB.page_count;
        elements.compareWordsB.textContent = state.currentDataB.word_count?.toLocaleString() || '-';
      }
    }
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
  
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  return {
    init,
    loadAggregation,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
