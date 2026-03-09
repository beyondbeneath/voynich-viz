/**
 * Main application module for Voynich line transition visualizer.
 * Handles state management, UI updates, and event coordination.
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
    error: null,
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
    if (params.display && ['probabilities', 'counts'].includes(params.display)) {
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
      canvas: document.getElementById('heatmap-canvas'),
      canvasB: document.getElementById('heatmap-canvas-b'),
      barChartCanvas: document.getElementById('bar-chart-canvas'),
      heatmapArea: document.getElementById('heatmap-area'),
      heatmapContainerA: document.getElementById('heatmap-container-a'),
      heatmapContainerB: document.getElementById('heatmap-container-b'),
      heatmapLabelA: document.getElementById('heatmap-label-a'),
      heatmapLabelB: document.getElementById('heatmap-label-b'),
      viewMode: document.getElementById('view-mode'),
      aggregationSelect: document.getElementById('aggregation-select'),
      aggregationSelectB: document.getElementById('aggregation-select-b'),
      aggregationBGroup: document.getElementById('aggregation-b-group'),
      aggregationLabel: document.getElementById('aggregation-label'),
      displayMode: document.getElementsByName('display-mode'),
      voynichFont: document.getElementById('voynich-font'),
      colorScale: document.getElementById('color-scale'),
      logScale: document.getElementById('log-scale'),
      infoPanel: document.getElementById('info-panel'),
      hoverInfo: document.getElementById('hover-info'),
      loadingOverlay: document.getElementById('loading-overlay'),
      errorMessage: document.getElementById('error-message'),
      pageCount: document.getElementById('page-count'),
      description: document.getElementById('description'),
      totalTransitions: document.getElementById('total-transitions'),
      infoCardSingle: document.getElementById('info-card-single'),
      infoCardCompare: document.getElementById('info-card-compare'),
      compareDescA: document.getElementById('compare-desc-a'),
      compareDescB: document.getElementById('compare-desc-b'),
      comparePagesA: document.getElementById('compare-pages-a'),
      comparePagesB: document.getElementById('compare-pages-b'),
      legendStandard: document.getElementById('legend-standard'),
      legendDiff: document.getElementById('legend-diff'),
      legendGradientStandard: document.getElementById('legend-gradient-standard'),
      legendGradientDiff: document.getElementById('legend-gradient-diff'),
      pagesPanelSingle: document.getElementById('pages-panel-single'),
      pagesPanelCompare: document.getElementById('pages-panel-compare'),
    };
    
    const urlState = readUrlState();
    
    Heatmap.init(elements.canvas, 'primary');
    Heatmap.init(elements.canvasB, 'secondary');
    BarChart.init(elements.barChartCanvas);
    
    setupEventListeners();
    
    if (urlState.displayMode) {
      state.settings.displayMode = urlState.displayMode;
      elements.displayMode.forEach(radio => {
        radio.checked = radio.value === urlState.displayMode;
      });
    }
    if (urlState.colorScale) {
      state.settings.colorScale = urlState.colorScale;
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
    
    updateDiffLegendGradient();
    
    try {
      await document.fonts.load('14px Voynich');
    } catch (e) {
      console.warn('Could not load Voynich font:', e);
    }
    
    await loadManifest(urlState);
  }
  
  /**
   * Set up event listeners for controls.
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
    
    elements.displayMode.forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.displayMode = e.target.value;
        renderAll();
        updateUrl();
      });
    });
    
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      renderAll();
      updateUrl();
    });
    
    elements.colorScale.addEventListener('change', (e) => {
      state.settings.colorScale = e.target.value;
      updateLegendGradient();
      renderAll();
      updateUrl();
    });
    
    elements.logScale.addEventListener('change', (e) => {
      state.settings.useLogScale = e.target.checked;
      renderAll();
      updateUrl();
    });
  }
  
  /**
   * Set the view mode and update UI accordingly.
   */
  function setViewMode(mode, skipUrlUpdate = false) {
    state.viewMode = mode;
    
    const isCompareOrDiff = mode === 'compare' || mode === 'diff';
    const isCompare = mode === 'compare';
    const isDiff = mode === 'diff';
    
    elements.aggregationBGroup.style.display = isCompareOrDiff ? '' : 'none';
    elements.aggregationLabel.textContent = isCompareOrDiff ? 'A' : 'Aggregation';
    elements.heatmapContainerB.style.display = isCompare ? '' : 'none';
    elements.heatmapArea.classList.toggle('compare-mode', isCompare);
    elements.infoCardSingle.style.display = isCompareOrDiff ? 'none' : '';
    elements.infoCardCompare.style.display = isCompareOrDiff ? '' : 'none';
    elements.legendStandard.style.display = isDiff ? 'none' : '';
    elements.legendDiff.style.display = isDiff ? '' : 'none';
    
    if (isCompare) {
      elements.heatmapLabelA.textContent = 'A: ' + (state.currentData?.description || '');
      elements.heatmapLabelB.textContent = 'B: ' + (state.currentDataB?.description || '');
    } else {
      elements.heatmapLabelA.textContent = '';
    }
    
    if (isCompareOrDiff && !state.currentDataB) {
      const defaultB = state.currentAggregation === 'language_a' ? 'language_b' : 'language_a';
      loadAggregationB(defaultB, skipUrlUpdate);
    } else {
      renderAll();
    }
    
    updateInfoPanel();
    
    if (!skipUrlUpdate) {
      updateUrl();
    }
  }
  
  /**
   * Load the transcription config and manifest file.
   */
  async function loadManifest(urlState = {}) {
    showLoading(true);
    
    try {
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
      
      const colorSelect = elements.colorScale;
      colorSelect.innerHTML = '';
      for (const [key, scale] of Object.entries(Config.COLOR_SCALES)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = scale.name;
        if (key === state.settings.colorScale) {
          option.selected = true;
        }
        colorSelect.appendChild(option);
      }
      
      updateLegendGradient();
      
      const initialAggregation = urlState.aggregation || state.settings.aggregation;
      await loadAggregation(initialAggregation, true);
      
      if (urlState.viewMode) {
        elements.viewMode.value = urlState.viewMode;
        setViewMode(urlState.viewMode, true);
        
        if (urlState.aggregationB && (urlState.viewMode === 'compare' || urlState.viewMode === 'diff')) {
          await loadAggregationB(urlState.aggregationB, true);
        }
      }
      
      isInitializing = false;
      updateUrl();
      
      requestAnimationFrame(() => {
        renderAll();
      });
      
    } catch (error) {
      showError(`Failed to load data: ${error.message}`);
      isInitializing = false;
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Load a specific aggregation (A).
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
      renderAll();
      
      elements.aggregationSelect.value = name;
      
      if (state.viewMode === 'compare') {
        elements.heatmapLabelA.textContent = 'A: ' + state.currentData.description;
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
   * Load a specific aggregation (B) for compare/diff modes.
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
      renderAll();
      
      elements.aggregationSelectB.value = name;
      
      if (state.viewMode === 'compare') {
        elements.heatmapLabelB.textContent = 'B: ' + state.currentDataB.description;
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
   * Render all visualizations.
   */
  function renderAll() {
    renderHeatmap();
    renderBarChart();
  }
  
  /**
   * Compute the unified charset from two datasets (superset of both).
   */
  function getUnifiedCharset(dataA, dataB) {
    const charsA = new Set(dataA.charset || []);
    const charsB = new Set(dataB.charset || []);
    return [...new Set([...charsA, ...charsB])];
  }
  
  /**
   * Render the heatmap with current data and settings.
   */
  function renderHeatmap() {
    if (!state.currentData) return;
    
    const settings = {
      ...state.settings,
      viewMode: state.viewMode,
      onHover: handleHover,
    };
    
    if (state.viewMode === 'single') {
      Heatmap.render(state.currentData, settings, 'primary');
    } else if (state.viewMode === 'compare') {
      // In compare mode, use unified charset so both matrices align
      const unifiedCharset = state.currentDataB 
        ? getUnifiedCharset(state.currentData, state.currentDataB)
        : null;
      Heatmap.render(state.currentData, settings, 'primary', unifiedCharset);
      if (state.currentDataB) {
        Heatmap.render(state.currentDataB, settings, 'secondary', unifiedCharset);
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
   * Render the bar chart.
   */
  function renderBarChart() {
    if (!state.currentData) return;
    
    const settings = {
      ...state.settings,
    };
    
    if (state.viewMode === 'single' || state.viewMode === 'diff') {
      BarChart.render(state.currentData, settings);
    } else if (state.viewMode === 'compare' && state.currentDataB) {
      BarChart.renderCompare(state.currentData, state.currentDataB, settings);
    }
  }
  
  /**
   * Handle hover events from the heatmap.
   */
  function handleHover(info) {
    if (!info) {
      elements.hoverInfo.innerHTML = '<span class="placeholder">Hover over a cell to see details</span>';
      return;
    }
    
    const fromClass = 'char from';
    const toClass = 'char to';
    
    let valueHtml = '';
    
    if (state.viewMode === 'diff' && info.diff !== undefined) {
      const diffPercent = (info.diff * 100).toFixed(2);
      const sign = info.diff >= 0 ? '+' : '';
      const diffClass = info.diff > 0 ? 'diff-positive' : (info.diff < 0 ? 'diff-negative' : 'diff-neutral');
      valueHtml = `
        <span class="values">
          <span class="diff-value ${diffClass}">${sign}${diffPercent}%</span>
          <span class="diff-detail">A: ${(info.probA * 100).toFixed(2)}% | B: ${(info.probB * 100).toFixed(2)}%</span>
        </span>
      `;
    } else {
      const probPercent = (info.probability * 100).toFixed(2);
      valueHtml = `
        <span class="values">
          <span class="probability">${probPercent}%</span>
          <span class="count">(${info.count.toLocaleString()} occurrences)</span>
        </span>
      `;
    }
    
    elements.hoverInfo.innerHTML = `
      <span class="transition">
        <span class="${fromClass}">${escapeHtml(info.fromDisplay)}</span>
        <span class="arrow">→</span>
        <span class="${toClass}">${escapeHtml(info.toDisplay)}</span>
      </span>
      ${valueHtml}
    `;
  }
  
  /**
   * Update the info panel with current aggregation details.
   */
  function updateInfoPanel() {
    if (!state.currentData) return;
    
    if (state.viewMode === 'single') {
      elements.pageCount.textContent = state.currentData.page_count;
      elements.description.textContent = state.currentData.description;
      elements.totalTransitions.textContent = (state.currentData.total_transitions || 0).toLocaleString();
      
      elements.pagesPanelSingle.style.display = '';
      elements.pagesPanelCompare.style.display = 'none';
      PagesPanel.updatePanel(elements.pagesPanelSingle, state.currentData);
    } else {
      elements.compareDescA.textContent = state.currentData.description;
      elements.comparePagesA.textContent = state.currentData.page_count;
      
      if (state.currentDataB) {
        elements.compareDescB.textContent = state.currentDataB.description;
        elements.comparePagesB.textContent = state.currentDataB.page_count;
      }
      
      elements.pagesPanelSingle.style.display = 'none';
      elements.pagesPanelCompare.style.display = '';
      PagesPanel.updateComparePanel(elements.pagesPanelCompare, state.currentData, state.currentDataB);
    }
  }
  
  /**
   * Update the legend gradient to match the current color scale.
   */
  function updateLegendGradient() {
    if (!elements.legendGradientStandard) return;
    
    const scale = Config.COLOR_SCALES[state.settings.colorScale];
    if (!scale) return;
    
    const stops = scale.stops.map(stop => {
      const [r, g, b] = stop.color;
      return `rgb(${r}, ${g}, ${b}) ${stop.pos * 100}%`;
    });
    
    elements.legendGradientStandard.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  }
  
  /**
   * Update the diff legend gradient.
   */
  function updateDiffLegendGradient() {
    if (!elements.legendGradientDiff) return;
    
    const scale = Config.DIFF_COLOR_SCALE;
    const stops = scale.stops.map(stop => {
      const [r, g, b] = stop.color;
      return `rgb(${r}, ${g}, ${b}) ${stop.pos * 100}%`;
    });
    
    elements.legendGradientDiff.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  }
  
  function showLoading(show) {
    state.loading = show;
    elements.loadingOverlay.classList.toggle('visible', show);
  }
  
  function showError(message) {
    state.error = message;
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
  
  /**
   * Export the current visualization.
   */
  function exportImage() {
    const dataUrl = Heatmap.exportAsImage();
    if (!dataUrl) return;
    
    const link = document.createElement('a');
    link.download = `voynich-line-transitions-${state.currentAggregation}.png`;
    link.href = dataUrl;
    link.click();
  }
  
  function getState() {
    return { ...state };
  }
  
  return {
    init,
    loadAggregation,
    exportImage,
    getState,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
