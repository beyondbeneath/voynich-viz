/**
 * Main application module for Voynich line position effects visualizer.
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
    selectedGlyphs: ['m'],
    chartType: 'from_start',
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
    if (params.chart && ['from_start', 'from_end'].includes(params.chart)) {
      urlState.chartType = params.chart;
    }
    if (params.font !== undefined) {
      urlState.useVoynichFont = UrlState.toBool(params.font, true);
    }
    if (params.glyphs) {
      urlState.selectedGlyphs = params.glyphs.split(',').filter(g => g.length > 0);
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
      chart: state.chartType,
      font: UrlState.fromBool(state.settings.useVoynichFont),
      glyphs: state.selectedGlyphs.join(','),
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
      lineChart: document.getElementById('line-chart'),
      lineChartB: document.getElementById('line-chart-b'),
      asymmetryChart: document.getElementById('asymmetry-chart'),
      chartsArea: document.getElementById('charts-area'),
      chartContainerA: document.getElementById('chart-container-a'),
      chartContainerB: document.getElementById('chart-container-b'),
      chartLabelA: document.getElementById('chart-label-a'),
      chartLabelB: document.getElementById('chart-label-b'),
      viewMode: document.getElementById('view-mode'),
      aggregationSelect: document.getElementById('aggregation-select'),
      aggregationSelectB: document.getElementById('aggregation-select-b'),
      aggregationBGroup: document.getElementById('aggregation-b-group'),
      aggregationLabel: document.getElementById('aggregation-label'),
      chartType: document.getElementById('chart-type'),
      voynichFont: document.getElementById('voynich-font'),
      charGrid: document.getElementById('char-grid'),
      selectedCharDisplay: document.getElementById('selected-char-display'),
      clearAllBtn: document.getElementById('clear-all-btn'),
      top5Btn: document.getElementById('top-5-btn'),
      infoPanel: document.getElementById('info-panel'),
      hoverInfo: document.getElementById('hover-info'),
      loadingOverlay: document.getElementById('loading-overlay'),
      errorMessage: document.getElementById('error-message'),
      pageCount: document.getElementById('page-count'),
      description: document.getElementById('description'),
      wordTotal: document.getElementById('word-total'),
      infoCardSingle: document.getElementById('info-card-single'),
      infoCardCompare: document.getElementById('info-card-compare'),
      compareDescA: document.getElementById('compare-desc-a'),
      compareDescB: document.getElementById('compare-desc-b'),
      comparePagesA: document.getElementById('compare-pages-a'),
      comparePagesB: document.getElementById('compare-pages-b'),
      topStartGlyphs: document.getElementById('top-start-glyphs'),
      topEndGlyphs: document.getElementById('top-end-glyphs'),
      pagesPanelSingle: document.getElementById('pages-panel-single'),
      pagesPanelCompare: document.getElementById('pages-panel-compare'),
    };
    
    const urlState = readUrlState();
    
    LineChart.init(elements.lineChart, 'primary');
    LineChart.init(elements.lineChartB, 'secondary');
    BarChart.init(elements.asymmetryChart);
    
    setupEventListeners();
    
    if (urlState.chartType) {
      state.chartType = urlState.chartType;
      elements.chartType.value = state.chartType;
    }
    if (urlState.useVoynichFont !== undefined) {
      state.settings.useVoynichFont = urlState.useVoynichFont;
      elements.voynichFont.checked = urlState.useVoynichFont;
    }
    if (urlState.selectedGlyphs && urlState.selectedGlyphs.length > 0) {
      state.selectedGlyphs = urlState.selectedGlyphs;
    }
    
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
    
    elements.chartType.addEventListener('change', (e) => {
      state.chartType = e.target.value;
      renderCharts();
      updateUrl();
    });
    
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      updateCharGrid();
      updateSelectedCharDisplay();
      updateTopGlyphsLists();
      renderCharts();
      updateUrl();
    });
    
    elements.clearAllBtn.addEventListener('click', () => {
      state.selectedGlyphs = [];
      updateCharGrid();
      updateSelectedCharDisplay();
      renderCharts();
      updateUrl();
    });
    
    elements.top5Btn.addEventListener('click', () => {
      selectTop5Glyphs();
    });
    
    // Hover handlers for line chart
    elements.lineChart.addEventListener('mousemove', (e) => {
      handleChartHover(e, 'primary');
    });
    
    elements.lineChart.addEventListener('mouseleave', () => {
      handleChartLeave('primary');
    });
    
    elements.lineChartB.addEventListener('mousemove', (e) => {
      handleChartHover(e, 'secondary');
    });
    
    elements.lineChartB.addEventListener('mouseleave', () => {
      handleChartLeave('secondary');
    });
  }
  
  // Track current hover state
  let currentHover = { primary: null, secondary: null };
  
  /**
   * Handle hover over line chart.
   */
  function handleChartHover(event, canvasId) {
    const canvas = canvasId === 'primary' ? elements.lineChart : elements.lineChartB;
    const data = canvasId === 'primary' ? getCurrentDataForRender() : state.currentDataB;
    
    if (!data) return;
    
    const coords = LineChart.getCanvasCoords(canvas, event);
    const point = LineChart.getPointAt(
      coords.x, coords.y,
      data, state.selectedGlyphs,
      state.chartType, canvasId
    );
    
    // Only re-render if hover state changed
    const prevHover = currentHover[canvasId];
    const hoverChanged = !prevHover !== !point || 
      (prevHover && point && (prevHover.glyph !== point.glyph || prevHover.k !== point.k));
    
    if (hoverChanged) {
      currentHover[canvasId] = point;
      
      if (point) {
        LineChart.renderWithHighlight(canvasId, point);
        showPointInfo(point);
      } else {
        LineChart.clearHighlight(canvasId);
        clearHoverInfo();
      }
    }
  }
  
  /**
   * Get the data to render (handles diff mode).
   */
  function getCurrentDataForRender() {
    if (state.viewMode === 'diff' && state.currentDataB) {
      return DataLoader.computeDiff(state.currentData, state.currentDataB);
    }
    return state.currentData;
  }
  
  /**
   * Show point info in hover panel.
   */
  function showPointInfo(point) {
    const useVoynich = state.settings.useVoynichFont;
    const glyphDisplay = Config.getCharDisplay(point.glyph, useVoynich);
    const fontClass = useVoynich ? '' : ' no-voynich';
    
    const posLabel = point.chartType === 'from_start' ? 'from line start' : 'from line end';
    
    let html = `
      <div class="point-info">
        <div style="margin-bottom: 8px;">
          <strong>Glyph:</strong> <span class="char-display${fontClass}">${glyphDisplay}</span>
          <span style="display: inline-block; width: 12px; height: 12px; background: ${point.color}; border-radius: 2px; margin-left: 4px; vertical-align: middle;"></span>
        </div>
        <div><strong>Position:</strong> k = ${point.k} ${posLabel}</div>
        <div><strong>Probability:</strong> ${(point.probability * 100).toFixed(2)}%</div>
      </div>
    `;
    
    elements.hoverInfo.innerHTML = html;
  }
  
  /**
   * Clear hover info and chart highlights.
   */
  function clearHoverInfo() {
    elements.hoverInfo.innerHTML = '<span class="placeholder">Hover over a point to see details</span>';
  }
  
  /**
   * Handle mouse leave on chart.
   */
  function handleChartLeave(canvasId) {
    if (currentHover[canvasId]) {
      currentHover[canvasId] = null;
      LineChart.clearHighlight(canvasId);
      clearHoverInfo();
    }
  }
  
  /**
   * Select top 5 glyphs by asymmetry.
   */
  function selectTop5Glyphs() {
    if (!state.currentData) return;
    
    const ranking = state.currentData.asymmetry_ranking || [];
    state.selectedGlyphs = ranking.slice(0, 5).map(item => item.glyph);
    
    updateCharGrid();
    updateSelectedCharDisplay();
    renderCharts();
    updateUrl();
  }
  
  /**
   * Set view mode.
   */
  async function setViewMode(mode, skipUrlUpdate = false) {
    state.viewMode = mode;
    
    const isCompareOrDiff = mode === 'compare' || mode === 'diff';
    const isCompare = mode === 'compare';
    
    elements.aggregationBGroup.style.display = isCompareOrDiff ? '' : 'none';
    elements.aggregationLabel.textContent = isCompareOrDiff ? 'A' : 'Aggregation';
    elements.chartContainerB.style.display = isCompare ? '' : 'none';
    elements.chartsArea.classList.toggle('compare-mode', isCompare);
    elements.infoCardSingle.style.display = isCompareOrDiff ? 'none' : '';
    elements.infoCardCompare.style.display = isCompareOrDiff ? '' : 'none';
    
    if (isCompare) {
      elements.chartLabelA.textContent = 'A: ' + (state.currentData?.description || '');
      elements.chartLabelB.textContent = 'B: ' + (state.currentDataB?.description || '');
    } else {
      elements.chartLabelA.textContent = '';
    }
    
    if (isCompareOrDiff && !state.currentDataB) {
      const defaultB = state.currentAggregation === 'language_a' ? 'language_b' : 'language_a';
      await loadAggregationB(defaultB, skipUrlUpdate);
    } else {
      renderCharts();
    }
    
    updateInfoPanel();
    
    if (!skipUrlUpdate) {
      updateUrl();
    }
  }
  
  /**
   * Load manifest and initialize.
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
      
      const initialAggregation = urlState.aggregation || Config.DEFAULTS.aggregation;
      await loadAggregation(initialAggregation, true);
      
      if (urlState.viewMode && urlState.viewMode !== 'single') {
        elements.viewMode.value = urlState.viewMode;
        await setViewMode(urlState.viewMode, true);
        
        if (urlState.aggregationB) {
          await loadAggregationB(urlState.aggregationB, true);
        }
      }
      
      isInitializing = false;
      updateUrl();
      
    } catch (e) {
      console.error('Failed to load manifest:', e);
      showError('Failed to load data. Please refresh the page.');
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Load aggregation data.
   */
  async function loadAggregation(name, skipUrlUpdate = false) {
    showLoading(true);
    
    try {
      state.currentData = await DataLoader.loadAggregation(name);
      state.currentAggregation = name;
      elements.aggregationSelect.value = name;
      
      // Validate selected glyphs against available charset
      const charset = new Set(state.currentData.charset || []);
      state.selectedGlyphs = state.selectedGlyphs.filter(g => charset.has(g));
      
      // If no valid glyphs selected, pick default or first available
      if (state.selectedGlyphs.length === 0) {
        if (charset.has('m')) {
          state.selectedGlyphs = ['m'];
        } else if (state.currentData.charset && state.currentData.charset.length > 0) {
          state.selectedGlyphs = [state.currentData.charset[0]];
        }
      }
      
      // Update char grid with available chars
      updateCharGrid();
      updateSelectedCharDisplay();
      updateInfoPanel();
      updateTopGlyphsLists();
      renderCharts();
      
      if (!skipUrlUpdate) {
        updateUrl();
      }
      
    } catch (e) {
      console.error(`Failed to load aggregation '${name}':`, e);
      showError(`Failed to load data for '${name}'.`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Load aggregation B data.
   */
  async function loadAggregationB(name, skipUrlUpdate = false) {
    showLoading(true);
    
    try {
      state.currentDataB = await DataLoader.loadAggregation(name);
      state.currentAggregationB = name;
      elements.aggregationSelectB.value = name;
      
      updateInfoPanel();
      renderCharts();
      
      if (!skipUrlUpdate) {
        updateUrl();
      }
      
    } catch (e) {
      console.error(`Failed to load aggregation B '${name}':`, e);
      showError(`Failed to load data for '${name}'.`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Render all charts.
   */
  function renderCharts() {
    if (!state.currentData) return;
    
    const isDiff = state.viewMode === 'diff';
    const isCompare = state.viewMode === 'compare';
    
    let dataToRender = state.currentData;
    
    if (isDiff && state.currentDataB) {
      dataToRender = DataLoader.computeDiff(state.currentData, state.currentDataB);
    }
    
    // Render primary line chart
    LineChart.render(
      dataToRender,
      state.selectedGlyphs,
      state.settings,
      'primary',
      state.chartType
    );
    
    // Render secondary line chart (compare mode only)
    if (isCompare && state.currentDataB) {
      elements.chartLabelA.textContent = 'A: ' + state.currentData.description;
      elements.chartLabelB.textContent = 'B: ' + state.currentDataB.description;
      
      LineChart.render(
        state.currentDataB,
        state.selectedGlyphs,
        state.settings,
        'secondary',
        state.chartType
      );
    }
    
    // Render asymmetry bar chart
    if (isDiff) {
      BarChart.render(dataToRender, state.settings, null);
    } else if (isCompare) {
      BarChart.render(state.currentData, state.settings, state.currentDataB);
    } else {
      BarChart.render(state.currentData, state.settings, null);
    }
  }
  
  /**
   * Update character grid.
   */
  function updateCharGrid() {
    if (!state.currentData) return;
    
    const charset = Config.sortCharacters(state.currentData.charset || []);
    const useVoynich = state.settings.useVoynichFont;
    
    elements.charGrid.innerHTML = '';
    
    charset.forEach((char, index) => {
      const btn = document.createElement('button');
      btn.className = 'char-btn';
      if (!useVoynich) {
        btn.classList.add('no-voynich');
      }
      
      if (state.selectedGlyphs.includes(char)) {
        btn.classList.add('selected');
        const colorIndex = state.selectedGlyphs.indexOf(char);
        btn.style.backgroundColor = Config.getLineColor(colorIndex);
        btn.style.color = '#fff';
        btn.style.borderColor = Config.getLineColor(colorIndex);
      }
      
      btn.textContent = Config.getCharDisplay(char, useVoynich);
      btn.title = `Glyph: ${char}`;
      
      btn.addEventListener('click', () => {
        toggleGlyph(char);
      });
      
      elements.charGrid.appendChild(btn);
    });
  }
  
  /**
   * Toggle glyph selection.
   */
  function toggleGlyph(char) {
    const index = state.selectedGlyphs.indexOf(char);
    if (index >= 0) {
      state.selectedGlyphs.splice(index, 1);
    } else {
      state.selectedGlyphs.push(char);
    }
    
    updateCharGrid();
    updateSelectedCharDisplay();
    renderCharts();
    updateUrl();
  }
  
  /**
   * Update selected character display.
   */
  function updateSelectedCharDisplay() {
    const useVoynich = state.settings.useVoynichFont;
    
    if (state.selectedGlyphs.length === 0) {
      elements.selectedCharDisplay.textContent = 'None';
      elements.selectedCharDisplay.className = 'selected-char-value';
    } else {
      const labels = state.selectedGlyphs.map(g => Config.getCharDisplay(g, useVoynich));
      elements.selectedCharDisplay.textContent = labels.join(', ');
      elements.selectedCharDisplay.className = useVoynich ? 'selected-char-value' : 'selected-char-value no-voynich';
    }
  }
  
  /**
   * Update info panel.
   */
  function updateInfoPanel() {
    if (!state.currentData) return;
    
    const data = state.currentData;
    
    if (state.viewMode === 'single') {
      elements.pageCount.textContent = data.page_count;
      elements.description.textContent = data.description;
      
      const totalWords = Object.values(data.glyph_totals || {}).reduce((a, b) => a + b, 0);
      elements.wordTotal.textContent = totalWords.toLocaleString();
      
      // Update pages panel using PagesPanel.updatePanel
      PagesPanel.updatePanel(elements.pagesPanelSingle, data);
      
      elements.pagesPanelSingle.style.display = '';
      elements.pagesPanelCompare.style.display = 'none';
      
    } else {
      elements.compareDescA.textContent = data.description;
      elements.comparePagesA.textContent = data.page_count;
      
      if (state.currentDataB) {
        elements.compareDescB.textContent = state.currentDataB.description;
        elements.comparePagesB.textContent = state.currentDataB.page_count;
      }
      
      // Update pages panels for compare mode using PagesPanel.updateComparePanel
      PagesPanel.updateComparePanel(elements.pagesPanelCompare, data, state.currentDataB);
      
      elements.pagesPanelSingle.style.display = 'none';
      elements.pagesPanelCompare.style.display = '';
    }
    
    updateTopGlyphsLists();
  }
  
  /**
   * Update top glyphs lists.
   * Display values are inverted to match bar chart: line-start = negative (red), line-end = positive (blue)
   */
  function updateTopGlyphsLists() {
    if (!state.currentData) return;
    
    const useVoynich = state.settings.useVoynichFont;
    const fontClass = useVoynich ? '' : ' no-voynich';
    
    // Top line-start glyphs (display as negative/red to match bar chart)
    const topStart = state.currentData.top_line_start_glyphs || [];
    let startHtml = '';
    
    for (const item of topStart.slice(0, 5)) {
      const label = Config.getCharDisplay(item.glyph, useVoynich);
      const asym = -item.asymmetry * 100; // Invert for display
      const barWidth = Math.min(Math.abs(asym) / 15 * 100, 100);
      
      startHtml += `
        <div class="top-glyph-item">
          <span class="top-glyph-char${fontClass}">${label}</span>
          <div class="top-glyph-bar">
            <div class="top-glyph-fill negative" style="width: ${barWidth}%"></div>
          </div>
          <span class="top-glyph-value negative">${asym.toFixed(1)}pp</span>
        </div>
      `;
    }
    
    elements.topStartGlyphs.innerHTML = startHtml || '<span class="placeholder">No data</span>';
    
    // Top line-end glyphs (display as positive/blue to match bar chart)
    const topEnd = state.currentData.top_line_end_glyphs || [];
    let endHtml = '';
    
    for (const item of topEnd.slice(0, 5)) {
      const label = Config.getCharDisplay(item.glyph, useVoynich);
      const asym = -item.asymmetry * 100; // Invert for display (negative becomes positive)
      const barWidth = Math.min(Math.abs(asym) / 15 * 100, 100);
      
      endHtml += `
        <div class="top-glyph-item">
          <span class="top-glyph-char${fontClass}">${label}</span>
          <div class="top-glyph-bar">
            <div class="top-glyph-fill positive" style="width: ${barWidth}%"></div>
          </div>
          <span class="top-glyph-value positive">+${asym.toFixed(1)}pp</span>
        </div>
      `;
    }
    
    elements.topEndGlyphs.innerHTML = endHtml || '<span class="placeholder">No data</span>';
  }
  
  /**
   * Show/hide loading overlay.
   */
  function showLoading(show) {
    state.loading = show;
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
  }
  
  /**
   * Show error message.
   */
  function showError(message) {
    state.error = message;
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
    setTimeout(() => {
      elements.errorMessage.style.display = 'none';
    }, 5000);
  }
  
  /**
   * Export current view as PNG.
   */
  function exportImage() {
    const chartCanvas = elements.lineChart;
    
    const link = document.createElement('a');
    link.download = `linepos-${state.currentAggregation}-${state.chartType}.png`;
    link.href = chartCanvas.toDataURL('image/png');
    link.click();
  }
  
  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', init);
  
  // Public API
  return {
    exportImage,
  };
})();
