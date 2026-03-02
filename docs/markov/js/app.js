/**
 * Main application module for Voynich transition visualizer.
 * Handles state management, UI updates, and event coordination.
 */

const App = (function() {
  // Application state
  let state = {
    manifest: null,
    viewMode: 'single',  // 'single', 'compare', 'diff'
    currentAggregation: null,
    currentAggregationB: null,
    currentData: null,
    currentDataB: null,
    diffData: null,
    settings: { ...Config.DEFAULTS },
    loading: false,
    error: null,
  };
  
  // DOM elements
  let elements = {};
  
  /**
   * Initialize the application.
   */
  async function init() {
    // Cache DOM elements
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
      displayMode: document.getElementsByName('display-mode'),
      voynichFont: document.getElementById('voynich-font'),
      showBoundaries: document.getElementById('show-boundaries'),
      colorScale: document.getElementById('color-scale'),
      logScale: document.getElementById('log-scale'),
      infoPanel: document.getElementById('info-panel'),
      hoverInfo: document.getElementById('hover-info'),
      loadingOverlay: document.getElementById('loading-overlay'),
      errorMessage: document.getElementById('error-message'),
      pageCount: document.getElementById('page-count'),
      description: document.getElementById('description'),
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
    
    // Initialize heatmaps (primary and secondary for compare mode)
    Heatmap.init(elements.canvas, 'primary');
    Heatmap.init(elements.canvasB, 'secondary');
    
    // Set up event listeners
    setupEventListeners();
    
    // Sync state with actual checkbox values
    state.settings.useVoynichFont = elements.voynichFont.checked;
    state.settings.showBoundaries = elements.showBoundaries.checked;
    state.settings.useLogScale = elements.logScale.checked;
    
    // Initialize diff legend gradient
    updateDiffLegendGradient();
    
    // Explicitly load Voynich font before rendering
    try {
      await document.fonts.load('14px Voynich');
    } catch (e) {
      console.warn('Could not load Voynich font:', e);
    }
    
    // Load manifest and initial data
    await loadManifest();
  }
  
  /**
   * Set up event listeners for controls.
   */
  function setupEventListeners() {
    // View mode selector
    elements.viewMode.addEventListener('change', (e) => {
      setViewMode(e.target.value);
    });
    
    // Aggregation selector (A)
    elements.aggregationSelect.addEventListener('change', (e) => {
      loadAggregation(e.target.value);
    });
    
    // Aggregation selector (B)
    elements.aggregationSelectB.addEventListener('change', (e) => {
      loadAggregationB(e.target.value);
    });
    
    // Display mode radio buttons
    elements.displayMode.forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.settings.displayMode = e.target.value;
        renderHeatmap();
      });
    });
    
    // Voynich font toggle
    elements.voynichFont.addEventListener('change', (e) => {
      state.settings.useVoynichFont = e.target.checked;
      renderHeatmap();
    });
    
    // Show boundaries toggle
    elements.showBoundaries.addEventListener('change', (e) => {
      state.settings.showBoundaries = e.target.checked;
      renderHeatmap();
    });
    
    // Color scale selector
    elements.colorScale.addEventListener('change', (e) => {
      state.settings.colorScale = e.target.value;
      updateLegendGradient();
      renderHeatmap();
    });
    
    // Log scale toggle
    elements.logScale.addEventListener('change', (e) => {
      state.settings.useLogScale = e.target.checked;
      renderHeatmap();
    });
  }
  
  /**
   * Set the view mode and update UI accordingly.
   * @param {string} mode - 'single', 'compare', or 'diff'
   */
  function setViewMode(mode) {
    state.viewMode = mode;
    
    const isCompareOrDiff = mode === 'compare' || mode === 'diff';
    const isCompare = mode === 'compare';
    const isDiff = mode === 'diff';
    
    // Show/hide aggregation B selector
    elements.aggregationBGroup.style.display = isCompareOrDiff ? '' : 'none';
    
    // Update aggregation A label
    elements.aggregationLabel.textContent = isCompareOrDiff ? 'A' : 'Aggregation';
    
    // Show/hide second heatmap container (only for compare mode)
    elements.heatmapContainerB.style.display = isCompare ? '' : 'none';
    
    // Toggle heatmap area layout
    elements.heatmapArea.classList.toggle('compare-mode', isCompare);
    
    // Show/hide appropriate info cards
    elements.infoCardSingle.style.display = isCompareOrDiff ? 'none' : '';
    elements.infoCardCompare.style.display = isCompareOrDiff ? '' : 'none';
    
    // Show/hide appropriate legends
    elements.legendStandard.style.display = isDiff ? 'none' : '';
    elements.legendDiff.style.display = isDiff ? '' : 'none';
    
    // Update heatmap labels
    if (isCompare) {
      elements.heatmapLabelA.textContent = 'A: ' + (state.currentData?.description || '');
      elements.heatmapLabelB.textContent = 'B: ' + (state.currentDataB?.description || '');
    } else {
      elements.heatmapLabelA.textContent = '';
    }
    
    // If switching to compare/diff mode and B not loaded, load default
    if (isCompareOrDiff && !state.currentDataB) {
      const defaultB = state.currentAggregation === 'language_a' ? 'language_b' : 'language_a';
      loadAggregationB(defaultB);
    } else {
      renderHeatmap();
    }
    
    updateInfoPanel();
  }
  
  /**
   * Load the transcription config and manifest file, then populate selectors.
   */
  async function loadManifest() {
    showLoading(true);
    
    try {
      // Load transcription config first (initializes Config module)
      await DataLoader.loadTranscriptionConfig();
      
      state.manifest = await DataLoader.loadManifest();
      
      // Populate aggregation dropdowns (A and B)
      const select = elements.aggregationSelect;
      const selectB = elements.aggregationSelectB;
      select.innerHTML = '';
      selectB.innerHTML = '';
      
      for (const agg of state.manifest.aggregations) {
        if (agg.page_count === 0) continue;  // Skip empty aggregations
        
        const option = document.createElement('option');
        option.value = agg.name;
        option.textContent = `${agg.description} (${agg.page_count} pages)`;
        select.appendChild(option);
        
        // Clone for B dropdown
        const optionB = option.cloneNode(true);
        selectB.appendChild(optionB);
      }
      
      // Set default for B to language_b (useful default for comparison)
      selectB.value = 'language_b';
      
      // Populate color scale dropdown
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
      
      // Set initial legend gradient
      updateLegendGradient();
      
      // Load default aggregation
      await loadAggregation(state.settings.aggregation);
      
      // Re-render after a frame to ensure font is fully available
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
   * Load a specific aggregation (A).
   * @param {string} name - Aggregation name
   */
  async function loadAggregation(name) {
    showLoading(true);
    
    try {
      state.currentAggregation = name;
      state.currentData = await DataLoader.loadAggregation(name);
      
      // Recompute diff if in diff mode
      if (state.viewMode === 'diff' && state.currentDataB) {
        state.diffData = DataLoader.computeDiff(state.currentData, state.currentDataB);
      }
      
      // Update info panel
      updateInfoPanel();
      
      // Render heatmap
      renderHeatmap();
      
      // Update dropdown selection
      elements.aggregationSelect.value = name;
      
      // Update heatmap label in compare mode
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
   * Load a specific aggregation (B) for compare/diff modes.
   * @param {string} name - Aggregation name
   */
  async function loadAggregationB(name) {
    showLoading(true);
    
    try {
      state.currentAggregationB = name;
      state.currentDataB = await DataLoader.loadAggregation(name);
      
      // Compute diff if in diff mode
      if (state.viewMode === 'diff' && state.currentData) {
        state.diffData = DataLoader.computeDiff(state.currentData, state.currentDataB);
      }
      
      // Update info panel
      updateInfoPanel();
      
      // Render heatmap
      renderHeatmap();
      
      // Update dropdown selection
      elements.aggregationSelectB.value = name;
      
      // Update heatmap label in compare mode
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
   * Handle hover events from the heatmap.
   * @param {Object|null} info - Hover info or null if not hovering
   */
  function handleHover(info) {
    if (!info) {
      elements.hoverInfo.innerHTML = '<span class="placeholder">Hover over a cell to see details</span>';
      return;
    }
    
    // Check if characters are boundaries - don't use Voynich font for those
    const fromIsBoundary = Config.isBoundaryChar(info.from);
    const toIsBoundary = Config.isBoundaryChar(info.to);
    const fromClass = fromIsBoundary ? 'char from boundary' : 'char from';
    const toClass = toIsBoundary ? 'char to boundary' : 'char to';
    
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
    } else {
      // Compare or diff mode
      elements.compareDescA.textContent = state.currentData.description;
      elements.comparePagesA.textContent = state.currentData.page_count;
      
      if (state.currentDataB) {
        elements.compareDescB.textContent = state.currentDataB.description;
        elements.comparePagesB.textContent = state.currentDataB.page_count;
      }
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
   * Update the diff legend gradient (called once on init).
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
   * Show or hide the loading overlay.
   * @param {boolean} show
   */
  function showLoading(show) {
    state.loading = show;
    elements.loadingOverlay.classList.toggle('visible', show);
  }
  
  /**
   * Show an error message.
   * @param {string} message
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
   * Escape HTML entities.
   * @param {string} str
   * @returns {string}
   */
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
    link.download = `voynich-transitions-${state.currentAggregation}.png`;
    link.href = dataUrl;
    link.click();
  }
  
  /**
   * Get current application state (for debugging).
   */
  function getState() {
    return { ...state };
  }
  
  // Public API
  return {
    init,
    loadAggregation,
    exportImage,
    getState,
  };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
