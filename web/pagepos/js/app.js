/**
 * Main application module for Voynich page position visualizer.
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
    selectedChar: null,
    resolution: 'coarse',
    normalization: 'page',
    settings: { ...Config.DEFAULTS },
    loading: false,
    error: null,
  };
  
  let elements = {};
  
  /**
   * Initialize the application.
   */
  async function init() {
    elements = {
      canvas: document.getElementById('heatmap-canvas'),
      canvasB: document.getElementById('heatmap-canvas-b'),
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
      resolutionSelect: document.getElementById('resolution-select'),
      normalizationSelect: document.getElementById('normalization-select'),
      voynichFont: document.getElementById('voynich-font'),
      colorScale: document.getElementById('color-scale'),
      charGrid: document.getElementById('char-grid'),
      selectedCharDisplay: document.getElementById('selected-char-display'),
      infoPanel: document.getElementById('info-panel'),
      hoverInfo: document.getElementById('hover-info'),
      loadingOverlay: document.getElementById('loading-overlay'),
      errorMessage: document.getElementById('error-message'),
      pageCount: document.getElementById('page-count'),
      description: document.getElementById('description'),
      charTotal: document.getElementById('char-total'),
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
    };
    
    Heatmap.init(elements.canvas, 'primary');
    Heatmap.init(elements.canvasB, 'secondary');
    
    setupEventListeners();
    
    state.settings.useVoynichFont = elements.voynichFont.checked;
    state.resolution = elements.resolutionSelect?.value || 'coarse';
    state.normalization = elements.normalizationSelect?.value || 'page';
    
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
    
    if (elements.resolutionSelect) {
      elements.resolutionSelect.addEventListener('change', (e) => {
        state.resolution = e.target.value;
        renderHeatmap();
      });
    }
    
    if (elements.normalizationSelect) {
      elements.normalizationSelect.addEventListener('change', (e) => {
        state.normalization = e.target.value;
        renderHeatmap();
      });
    }
    
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      updateCharGrid();
      updateSelectedCharDisplay();
    });
    
    elements.colorScale.addEventListener('change', (e) => {
      state.settings.colorScale = e.target.value;
      updateLegendGradient();
      renderHeatmap();
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
      loadAggregationB(defaultB);
    } else {
      renderHeatmap();
    }
    
    updateInfoPanel();
  }
  
  /**
   * Load manifest and initialize.
   */
  async function loadManifest() {
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
      
      selectB.value = 'language_b';
      
      // Populate resolution dropdown from manifest
      if (elements.resolutionSelect && state.manifest.grid_resolutions) {
        elements.resolutionSelect.innerHTML = '';
        for (const [resName, resInfo] of Object.entries(state.manifest.grid_resolutions)) {
          const option = document.createElement('option');
          option.value = resName;
          option.textContent = Config.RESOLUTION_DISPLAY[resName] || `${resInfo.cols}×${resInfo.rows}`;
          if (resName === state.resolution) {
            option.selected = true;
          }
          elements.resolutionSelect.appendChild(option);
        }
      }
      
      // Populate normalization dropdown from manifest
      if (elements.normalizationSelect && state.manifest.normalization_modes) {
        elements.normalizationSelect.innerHTML = '';
        for (const [modeName, modeInfo] of Object.entries(state.manifest.normalization_modes)) {
          const option = document.createElement('option');
          option.value = modeName;
          option.textContent = Config.NORMALIZATION_DISPLAY[modeName] || modeInfo.name || modeName;
          option.title = modeInfo.description || '';
          if (modeName === state.normalization) {
            option.selected = true;
          }
          elements.normalizationSelect.appendChild(option);
        }
      }
      
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
      
      await loadAggregation(state.settings.aggregation);
      
      requestAnimationFrame(() => {
        renderHeatmap();
      });
      
    } catch (error) {
      showError(`Failed to load data: ${error.message}`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Get character data for validation from the current normalization/resolution.
   */
  function getCharacterData(data, char) {
    if (!data) return null;
    
    // New format with normalization_modes
    if (data.normalization_modes) {
      const modeData = data.normalization_modes[state.normalization];
      if (!modeData) return null;
      const resData = modeData[state.resolution];
      if (!resData) return null;
      return resData.characters?.[char];
    }
    
    // Legacy format
    if (data.grids) {
      const resData = data.grids[state.resolution];
      if (!resData) return null;
      return resData.characters?.[char];
    }
    
    return null;
  }
  
  /**
   * Load aggregation A.
   */
  async function loadAggregation(name) {
    showLoading(true);
    
    try {
      state.currentAggregation = name;
      state.currentData = await DataLoader.loadAggregation(name);
      
      // Update character grid
      updateCharGrid();
      
      // Select default character if not set or invalid
      if (!state.selectedChar || !getCharacterData(state.currentData, state.selectedChar)) {
        const chars = Config.sortCharacters(state.currentData.charset || []);
        state.selectedChar = chars.includes('o') ? 'o' : chars[0];
      }
      
      updateSelectedCharDisplay();
      updateInfoPanel();
      renderHeatmap();
      
      elements.aggregationSelect.value = name;
      
      if (state.viewMode === 'compare') {
        elements.heatmapLabelA.textContent = 'A: ' + state.currentData.description;
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
      
      updateInfoPanel();
      renderHeatmap();
      
      elements.aggregationSelectB.value = name;
      
      if (state.viewMode === 'compare') {
        elements.heatmapLabelB.textContent = 'B: ' + state.currentDataB.description;
      }
      
    } catch (error) {
      showError(`Failed to load aggregation B: ${error.message}`);
    } finally {
      showLoading(false);
    }
  }
  
  /**
   * Update the character selection grid.
   */
  function updateCharGrid() {
    if (!state.currentData) return;
    
    const chars = Config.sortCharacters(state.currentData.charset || []);
    elements.charGrid.innerHTML = '';
    
    for (const char of chars) {
      const btn = document.createElement('button');
      btn.className = 'char-btn';
      if (char === state.selectedChar) {
        btn.classList.add('selected');
      }
      
      if (state.settings.useVoynichFont) {
        btn.textContent = Config.getCharDisplay(char, true);
      } else {
        btn.textContent = Config.getCharDisplay(char, false);
        btn.classList.add('no-voynich');
      }
      
      btn.addEventListener('click', () => selectChar(char));
      elements.charGrid.appendChild(btn);
    }
  }
  
  /**
   * Select a character.
   */
  function selectChar(char) {
    state.selectedChar = char;
    
    // Update button states
    const buttons = elements.charGrid.querySelectorAll('.char-btn');
    const chars = Config.sortCharacters(state.currentData?.charset || []);
    buttons.forEach((btn, i) => {
      btn.classList.toggle('selected', chars[i] === char);
    });
    
    updateSelectedCharDisplay();
    updateInfoPanel();
    renderHeatmap();
  }
  
  /**
   * Update the selected character display.
   */
  function updateSelectedCharDisplay() {
    if (!state.selectedChar) return;
    
    const display = elements.selectedCharDisplay;
    if (state.settings.useVoynichFont) {
      display.textContent = Config.getCharDisplay(state.selectedChar, true);
      display.classList.remove('no-voynich');
    } else {
      display.textContent = Config.getCharDisplay(state.selectedChar, false);
      display.classList.add('no-voynich');
    }
  }
  
  /**
   * Render the heatmap.
   */
  function renderHeatmap() {
    if (!state.currentData || !state.selectedChar) return;
    
    const settings = {
      ...state.settings,
      viewMode: state.viewMode,
      resolution: state.resolution,
      normalization: state.normalization,
      onHover: handleHover,
    };
    
    if (state.viewMode === 'single') {
      const gridData = DataLoader.getCharGrid(
        state.currentData, 
        state.selectedChar, 
        state.resolution, 
        state.normalization
      );
      Heatmap.render(gridData, settings, 'primary');
    } else if (state.viewMode === 'compare') {
      const gridDataA = DataLoader.getCharGrid(
        state.currentData, 
        state.selectedChar, 
        state.resolution, 
        state.normalization
      );
      Heatmap.render(gridDataA, settings, 'primary');
      if (state.currentDataB) {
        const gridDataB = DataLoader.getCharGrid(
          state.currentDataB, 
          state.selectedChar, 
          state.resolution, 
          state.normalization
        );
        Heatmap.render(gridDataB, settings, 'secondary');
      }
    } else if (state.viewMode === 'diff') {
      if (state.currentData && state.currentDataB) {
        const diffData = DataLoader.computeDiff(
          state.currentData, 
          state.currentDataB, 
          state.selectedChar, 
          state.resolution,
          state.normalization
        );
        Heatmap.renderDiff(diffData, settings, 'primary');
      }
    }
  }
  
  /**
   * Handle hover events.
   */
  function handleHover(info) {
    if (!info) {
      elements.hoverInfo.innerHTML = '<span class="placeholder">Hover over a cell to see details</span>';
      return;
    }
    
    let valueHtml = '';
    
    if (info.isDiff) {
      const diffPercent = (info.diff * 100).toFixed(2);
      const sign = info.diff >= 0 ? '+' : '';
      const diffClass = info.diff > 0 ? 'diff-positive' : (info.diff < 0 ? 'diff-negative' : 'diff-neutral');
      valueHtml = `
        <span class="values">
          <span class="diff-value ${diffClass}">${sign}${diffPercent}%</span>
          <span class="diff-detail">A: ${(info.distA * 100).toFixed(2)}% | B: ${(info.distB * 100).toFixed(2)}%</span>
        </span>
      `;
    } else {
      const distPercent = (info.distribution * 100).toFixed(2);
      valueHtml = `
        <span class="values">
          <span class="distribution">${distPercent}%</span>
          <span class="count">(${info.count.toLocaleString()} of ${info.total.toLocaleString()})</span>
        </span>
      `;
    }
    
    elements.hoverInfo.innerHTML = `
      <span class="cell-position">
        <span class="region">${info.region}</span>
      </span>
      ${valueHtml}
    `;
  }
  
  /**
   * Update the info panel.
   */
  function updateInfoPanel() {
    if (!state.currentData) return;
    
    // Get character total from the current normalization/resolution
    const charData = getCharacterData(state.currentData, state.selectedChar);
    const charTotal = charData?.total || 0;
    
    if (state.viewMode === 'single') {
      elements.pageCount.textContent = state.currentData.page_count;
      elements.description.textContent = state.currentData.description;
      elements.charTotal.textContent = `${charTotal.toLocaleString()} occurrences`;
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
   * Update diff legend gradient.
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
  
  /**
   * Show/hide loading overlay.
   */
  function showLoading(show) {
    state.loading = show;
    elements.loadingOverlay.classList.toggle('visible', show);
  }
  
  /**
   * Show error message.
   */
  function showError(message) {
    state.error = message;
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.add('visible');
    
    setTimeout(() => {
      elements.errorMessage.classList.remove('visible');
    }, 5000);
  }
  
  /**
   * Export current visualization.
   */
  function exportImage() {
    const dataUrl = Heatmap.exportAsImage();
    if (!dataUrl) return;
    
    const link = document.createElement('a');
    link.download = `voynich-pagepos-${state.selectedChar}-${state.normalization}-${state.resolution}-${state.currentAggregation}.png`;
    link.href = dataUrl;
    link.click();
  }
  
  /**
   * Get current state (for debugging).
   */
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
