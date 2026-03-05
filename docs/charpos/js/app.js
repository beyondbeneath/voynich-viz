/**
 * Main application module for Voynich character position heatmap visualizer.
 */

const App = (function() {
  let state = {
    manifest: null,
    viewMode: 'single',
    positionMode: 'word',
    currentAggregation: null,
    currentAggregationB: null,
    currentData: null,
    currentDataB: null,
    settings: { ...Config.DEFAULTS },
    loading: false,
    enabledGlyphs: new Set(),  // Glyphs currently enabled for display
    allGlyphs: [],             // All available glyphs
  };
  
  let elements = {};
  let isInitializing = true;
  
  /**
   * Read state from URL hash parameters.
   */
  function readUrlState() {
    const params = UrlState.parse();
    const urlState = {};
    
    if (params.mode && ['single', 'compare'].includes(params.mode)) {
      urlState.viewMode = params.mode;
    }
    if (params.pos && ['word', 'line'].includes(params.pos)) {
      urlState.positionMode = params.pos;
    }
    if (params.agg) {
      urlState.aggregation = params.agg;
    }
    if (params.aggB) {
      urlState.aggregationB = params.aggB;
    }
    if (params.sort && ['position', 'start', 'end', 'total', 'alpha'].includes(params.sort)) {
      urlState.sortBy = params.sort;
    }
    if (params.scale && ['linear', 'sqrt', 'log'].includes(params.scale)) {
      urlState.scaling = params.scale;
    }
    if (params.color && ['blue', 'viridis', 'magma', 'plasma', 'hot', 'greyscale'].includes(params.color)) {
      urlState.colormap = params.color;
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
      pos: state.positionMode,
      agg: state.currentAggregation,
      sort: state.settings.sortBy,
      scale: state.settings.scaling,
      color: state.settings.colormap,
      font: UrlState.fromBool(state.settings.useVoynichFont),
    };
    
    if (state.viewMode === 'compare' && state.currentAggregationB) {
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
      // Single mode elements
      canvas: document.getElementById('chart-canvas'),
      chartContainerA: document.getElementById('chart-container-a'),
      chartLabelA: document.getElementById('chart-label-a'),
      // Compare mode elements
      compareWrapper: document.getElementById('compare-wrapper'),
      canvasCompareA: document.getElementById('chart-canvas-compare'),
      canvasB: document.getElementById('chart-canvas-b'),
      chartContainerACompare: document.getElementById('chart-container-a-compare'),
      chartContainerB: document.getElementById('chart-container-b'),
      chartLabelACompare: document.getElementById('chart-label-a-compare'),
      chartLabelB: document.getElementById('chart-label-b'),
      // Common elements
      chartArea: document.getElementById('chart-area'),
      viewMode: document.getElementById('view-mode'),
      positionMode: document.getElementById('position-mode'),
      aggregationSelect: document.getElementById('aggregation-select'),
      aggregationSelectB: document.getElementById('aggregation-select-b'),
      aggregationBGroup: document.getElementById('aggregation-b-group'),
      aggregationLabel: document.getElementById('aggregation-label'),
      sortBy: document.getElementById('sort-by'),
      scaling: document.getElementById('scaling'),
      colormap: document.getElementById('colormap'),
      voynichFont: document.getElementById('voynich-font'),
      hoverInfo: document.getElementById('hover-info'),
      loadingOverlay: document.getElementById('loading-overlay'),
      errorMessage: document.getElementById('error-message'),
      pageCount: document.getElementById('page-count'),
      wordCount: document.getElementById('word-count'),
      lineCount: document.getElementById('line-count'),
      description: document.getElementById('description'),
      infoCardSingle: document.getElementById('info-card-single'),
      infoCardCompare: document.getElementById('info-card-compare'),
      compareDescA: document.getElementById('compare-desc-a'),
      compareDescB: document.getElementById('compare-desc-b'),
      comparePagesA: document.getElementById('compare-pages-a'),
      comparePagesB: document.getElementById('compare-pages-b'),
      pagesPanelSingle: document.getElementById('pages-panel-single'),
      pagesPanelCompare: document.getElementById('pages-panel-compare'),
      legendScale: document.getElementById('legend-scale'),
      // Glyph selector
      glyphGrid: document.getElementById('glyph-grid'),
      glyphCount: document.getElementById('glyph-count'),
      glyphTotal: document.getElementById('glyph-total'),
      selectAllBtn: document.getElementById('select-all-btn'),
      selectNoneBtn: document.getElementById('select-none-btn'),
    };
    
    const urlState = readUrlState();
    
    // Initialize all canvases
    Heatmap.init(elements.canvas, 'primary');
    Heatmap.init(elements.canvasCompareA, 'compareA');
    Heatmap.init(elements.canvasB, 'compareB');
    Heatmap.setHoverCallback(handleHover);
    
    setupEventListeners();
    
    // Apply URL state to settings
    if (urlState.sortBy) {
      state.settings.sortBy = urlState.sortBy;
      elements.sortBy.value = urlState.sortBy;
    }
    if (urlState.scaling) {
      state.settings.scaling = urlState.scaling;
      elements.scaling.value = urlState.scaling;
    }
    if (urlState.colormap) {
      state.settings.colormap = urlState.colormap;
      elements.colormap.value = urlState.colormap;
      Config.setColormap(urlState.colormap);
    }
    if (urlState.useVoynichFont !== undefined) {
      state.settings.useVoynichFont = urlState.useVoynichFont;
      elements.voynichFont.checked = urlState.useVoynichFont;
    }
    if (urlState.positionMode) {
      state.positionMode = urlState.positionMode;
      state.settings.positionMode = urlState.positionMode;
      elements.positionMode.value = urlState.positionMode;
    }
    
    state.settings.useVoynichFont = elements.voynichFont.checked;
    state.settings.positionMode = elements.positionMode.value;
    state.settings.scaling = elements.scaling.value;
    state.settings.colormap = elements.colormap.value;
    
    // Render legend with initial colormap
    renderLegend();
    
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
    
    elements.positionMode.addEventListener('change', (e) => {
      state.positionMode = e.target.value;
      state.settings.positionMode = e.target.value;
      renderChart();
      updateUrl();
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
    
    elements.scaling.addEventListener('change', (e) => {
      state.settings.scaling = e.target.value;
      renderChart();
      updateUrl();
    });
    
    elements.colormap.addEventListener('change', (e) => {
      state.settings.colormap = e.target.value;
      Config.setColormap(e.target.value);
      renderLegend();
      renderChart();
      updateUrl();
    });
    
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      updateGlyphGrid();
      renderChart();
      updateUrl();
    });
    
    // Glyph selector controls
    elements.selectAllBtn.addEventListener('click', () => {
      state.enabledGlyphs = new Set(state.allGlyphs);
      updateGlyphGridState();
      renderChart();
    });
    
    elements.selectNoneBtn.addEventListener('click', () => {
      state.enabledGlyphs = new Set();
      updateGlyphGridState();
      renderChart();
    });
  }
  
  /**
   * Set view mode.
   */
  function setViewMode(mode, skipUrlUpdate = false) {
    state.viewMode = mode;
    
    const isCompare = mode === 'compare';
    
    elements.aggregationBGroup.style.display = isCompare ? '' : 'none';
    elements.aggregationLabel.textContent = isCompare ? 'A' : 'Aggregation';
    elements.chartArea.classList.toggle('compare-mode', isCompare);
    
    // Toggle between single and compare layouts
    elements.chartContainerA.style.display = isCompare ? 'none' : '';
    elements.compareWrapper.style.display = isCompare ? '' : 'none';
    
    elements.infoCardSingle.style.display = isCompare ? 'none' : '';
    elements.infoCardCompare.style.display = isCompare ? '' : 'none';
    
    if (isCompare) {
      elements.chartLabelACompare.textContent = 'A: ' + (state.currentData?.description || '');
      elements.chartLabelB.textContent = 'B: ' + (state.currentDataB?.description || '');
    } else {
      elements.chartLabelA.textContent = '';
    }
    
    if (isCompare && !state.currentDataB) {
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
      
      const initialAggregation = urlState.aggregation || state.settings.aggregation;
      await loadAggregation(initialAggregation, true);
      
      if (urlState.viewMode) {
        elements.viewMode.value = urlState.viewMode;
        setViewMode(urlState.viewMode, true);
        
        if (urlState.aggregationB && urlState.viewMode === 'compare') {
          await loadAggregationB(urlState.aggregationB, true);
        }
      }
      
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
   */
  async function loadAggregation(name, skipUrlUpdate = false) {
    showLoading(true);

    try {
      state.currentAggregation = name;
      state.currentData = await DataLoader.loadAggregation(name);

      populateGlyphGrid();
      updateInfoPanel();
      renderChart();

      elements.aggregationSelect.value = name;

      if (state.viewMode === 'compare') {
        elements.chartLabelACompare.textContent = 'A: ' + state.currentData.description;
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
   */
  async function loadAggregationB(name, skipUrlUpdate = false) {
    showLoading(true);
    
    try {
      state.currentAggregationB = name;
      state.currentDataB = await DataLoader.loadAggregation(name);
      
      // Update glyph grid to include any new characters from B
      populateGlyphGrid();
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
   * Populate the glyph selection grid with all available characters.
   */
  function populateGlyphGrid() {
    if (!state.currentData) return;
    
    // Get all characters from current data (and B if in compare mode)
    const charsA = Object.keys(state.currentData.characters).filter(c => state.currentData.characters[c]?.total > 0);
    const charsB = state.currentDataB 
      ? Object.keys(state.currentDataB.characters).filter(c => state.currentDataB.characters[c]?.total > 0)
      : [];
    
    // Get union and sort
    const allCharsSet = new Set([...charsA, ...charsB]);
    const newAllGlyphs = Config.sortCharacters([...allCharsSet]);
    
    const previousAllGlyphs = new Set(state.allGlyphs);
    const previousEnabled = new Set(state.enabledGlyphs);
    
    state.allGlyphs = newAllGlyphs;
    
    // Build new enabled set
    state.enabledGlyphs = new Set();
    for (const c of newAllGlyphs) {
      if (previousAllGlyphs.has(c)) {
        // Existing glyph - preserve its enabled state
        if (previousEnabled.has(c)) {
          state.enabledGlyphs.add(c);
        }
      } else {
        // New glyph - enable by default
        state.enabledGlyphs.add(c);
      }
    }
    
    updateGlyphGrid();
  }
  
  /**
   * Update the glyph grid buttons (rebuild DOM).
   */
  function updateGlyphGrid() {
    elements.glyphGrid.innerHTML = '';
    
    for (const char of state.allGlyphs) {
      const btn = document.createElement('button');
      btn.className = 'glyph-btn';
      btn.dataset.char = char;
      
      if (state.enabledGlyphs.has(char)) {
        btn.classList.add('enabled');
      } else {
        btn.classList.add('disabled');
      }
      
      if (state.settings.useVoynichFont) {
        btn.textContent = Config.getCharDisplay(char, true);
      } else {
        btn.textContent = Config.getCharDisplay(char, false);
        btn.classList.add('no-voynich');
      }
      
      btn.addEventListener('click', () => toggleGlyph(char));
      elements.glyphGrid.appendChild(btn);
    }
    
    updateGlyphCount();
  }
  
  /**
   * Update glyph grid button states without rebuilding DOM.
   */
  function updateGlyphGridState() {
    const buttons = elements.glyphGrid.querySelectorAll('.glyph-btn');
    buttons.forEach(btn => {
      const char = btn.dataset.char;
      if (state.enabledGlyphs.has(char)) {
        btn.classList.remove('disabled');
        btn.classList.add('enabled');
      } else {
        btn.classList.remove('enabled');
        btn.classList.add('disabled');
      }
    });
    updateGlyphCount();
  }
  
  /**
   * Toggle a glyph's enabled state.
   */
  function toggleGlyph(char) {
    if (state.enabledGlyphs.has(char)) {
      state.enabledGlyphs.delete(char);
    } else {
      state.enabledGlyphs.add(char);
    }
    updateGlyphGridState();
    renderChart();
  }
  
  /**
   * Update the glyph count display.
   */
  function updateGlyphCount() {
    elements.glyphCount.textContent = state.enabledGlyphs.size;
    elements.glyphTotal.textContent = state.allGlyphs.length;
  }
  
  /**
   * Render the legend scale bar with current colormap.
   */
  function renderLegend() {
    const canvas = elements.legendScale;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Draw gradient using current colormap
    for (let x = 0; x < width; x++) {
      const value = x / (width - 1);
      ctx.fillStyle = Config.getHeatmapColor(value);
      ctx.fillRect(x, 0, 1, height);
    }
  }
  
  /**
   * Render the chart.
   */
  function renderChart() {
    if (!state.currentData) return;
    
    const settings = { 
      ...state.settings,
      enabledGlyphs: state.enabledGlyphs,
    };
    
    if (state.viewMode === 'single') {
      Heatmap.render(state.currentData, settings, 'primary');
    } else if (state.viewMode === 'compare') {
      // Compute union of characters from both datasets
      const charsA = new Set(Object.keys(state.currentData.characters).filter(c => state.currentData.characters[c]?.total > 0));
      const charsB = state.currentDataB 
        ? new Set(Object.keys(state.currentDataB.characters).filter(c => state.currentDataB.characters[c]?.total > 0))
        : new Set();
      
      // Merge both datasets for sorting
      const mergedCharacters = {};
      for (const c of charsA) {
        mergedCharacters[c] = state.currentData.characters[c];
      }
      for (const c of charsB) {
        if (!mergedCharacters[c]) {
          mergedCharacters[c] = state.currentDataB.characters[c];
        }
      }
      
      // Sort based on merged data, prioritizing A's data for sorting values
      const sortedChars = Config.sortCharactersBy(mergedCharacters, settings.sortBy, settings.positionMode);
      const fixedOrder = sortedChars.filter(c => charsA.has(c) || charsB.has(c));
      
      const settingsA = { ...settings, fixedOrder };
      const settingsB = { ...settings, fixedOrder };
      
      Heatmap.render(state.currentData, settingsA, 'compareA');
      if (state.currentDataB) {
        Heatmap.render(state.currentDataB, settingsB, 'compareB');
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
    
    let html = `<span class="char-display${voynichClass}">${escapeHtml(info.charDisplay)}</span>`;
    
    // If no data for this character, show message
    if (info.hasData === false) {
      html += `<div style="font-size: 12px; color: #999; margin-bottom: 8px; font-style: italic;">No data in this dataset</div>`;
      elements.hoverInfo.innerHTML = html;
      return;
    }
    
    html += `<div style="font-size: 12px; color: #666; margin-bottom: 8px;">Total: ${info.total.toLocaleString()}</div>`;
    
    // If hovering over label only, just show character info
    if (info.isLabel) {
      elements.hoverInfo.innerHTML = html;
      return;
    }
    
    const lengthLabel = info.positionMode === 'word' ? 'Word length' : 'Line length';
    
    html += `<div class="position-info">`;
    html += `<div class="position-row">
      <span class="position-label">${lengthLabel}:</span>
      <span class="position-value">${info.wordLength}</span>
    </div>`;
    html += `<div class="position-row">
      <span class="position-label">Position:</span>
      <span class="position-value">${info.position} of ${info.wordLength}</span>
    </div>`;
    html += `<div class="position-row">
      <span class="position-label">Preference:</span>
      <span class="position-value">${(info.ratio * 100).toFixed(1)}%</span>
    </div>`;
    html += `</div>`;
    
    // Show all positions for this word length
    if (info.allRatios && info.allRatios.length > 0) {
      html += `<div style="margin-top: 10px; font-size: 11px; color: #666;">`;
      html += `All positions: `;
      html += info.allRatios.map((r, i) => {
        const isHighlighted = i === info.position - 1;
        return `<span style="font-weight: ${isHighlighted ? 'bold' : 'normal'}">${(r * 100).toFixed(0)}%</span>`;
      }).join(' | ');
      html += `</div>`;
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
      elements.lineCount.textContent = state.currentData.line_count?.toLocaleString() || '-';
      elements.description.textContent = state.currentData.description;
      
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
