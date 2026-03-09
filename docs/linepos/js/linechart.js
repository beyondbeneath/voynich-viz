/**
 * Line chart module for line position effects visualizer.
 * Renders interactive probability curves for multiple glyphs on a canvas.
 */

const LineChart = (function() {
  const canvases = {};
  const contexts = {};
  
  // Store last render state for re-rendering with highlights
  const renderState = {};
  
  // Chart dimensions
  const MARGIN = { top: 40, right: 30, bottom: 50, left: 60 };
  const CANVAS_WIDTH = 650;
  const CANVAS_HEIGHT = 350;
  const CHART_WIDTH = CANVAS_WIDTH - MARGIN.left - MARGIN.right;
  const CHART_HEIGHT = CANVAS_HEIGHT - MARGIN.top - MARGIN.bottom;
  
  // Visual settings
  const GRID_COLOR = '#e0e0e0';
  const AXIS_COLOR = '#666';
  const LINE_WIDTH = 2.5;
  const POINT_RADIUS = 4;
  const HOVER_RADIUS = 7;
  
  /**
   * Initialize a canvas for rendering.
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {string} id - Canvas identifier ('primary' or 'secondary')
   */
  function init(canvas, id = 'primary') {
    canvases[id] = canvas;
    contexts[id] = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    canvas.style.cursor = 'crosshair';
    
    // Initialize render state
    renderState[id] = null;
  }
  
  /**
   * Render the line chart.
   * @param {Object} data - Aggregation data
   * @param {string[]} selectedGlyphs - Array of selected glyph characters
   * @param {Object} settings - Rendering settings
   * @param {string} canvasId - Canvas identifier
   * @param {string} chartType - 'from_start' or 'from_end'
   * @param {Object} [highlight] - Optional point to highlight {glyph, k}
   */
  function render(data, selectedGlyphs, settings, canvasId = 'primary', chartType = 'from_start', highlight = null) {
    const canvas = canvases[canvasId];
    const ctx = contexts[canvasId];
    
    if (!canvas || !ctx) {
      console.error(`Canvas '${canvasId}' not initialized`);
      return;
    }
    
    // Store render state for re-rendering with highlights
    renderState[canvasId] = { data, selectedGlyphs, settings, chartType };
    
    // Clear canvas
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Show message if no glyphs selected
    if (!selectedGlyphs || selectedGlyphs.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Select one or more glyphs from the left panel', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      return;
    }
    
    const maxK = data.max_word_position || 10;
    const probKey = chartType === 'from_start' ? 'prob_from_start' : 'prob_from_end';
    const probs = data[probKey] || {};
    
    // Find max probability for Y scale
    let maxProb = 0;
    for (const glyph of selectedGlyphs) {
      if (probs[glyph]) {
        for (let k = 0; k <= maxK; k++) {
          const p = probs[glyph][String(k)] || 0;
          maxProb = Math.max(maxProb, Math.abs(p));
        }
      }
    }
    
    // Handle diff mode where values can be negative
    const isDiff = data.isDiff;
    let minProb = 0;
    if (isDiff) {
      for (const glyph of selectedGlyphs) {
        if (probs[glyph]) {
          for (let k = 0; k <= maxK; k++) {
            const p = probs[glyph][String(k)] || 0;
            minProb = Math.min(minProb, p);
          }
        }
      }
    }
    
    // Add padding to max
    maxProb = Math.max(maxProb * 1.1, 0.05);
    if (isDiff) {
      minProb = Math.min(minProb * 1.1, -0.05);
    }
    
    const yRange = maxProb - minProb;
    
    // Draw grid
    drawGrid(ctx, maxK, minProb, maxProb, isDiff);
    
    // Draw axes
    drawAxes(ctx, maxK, minProb, maxProb, chartType, isDiff);
    
    // Draw lines for each selected glyph
    selectedGlyphs.forEach((glyph, index) => {
      if (probs[glyph]) {
        const color = Config.getLineColor(index);
        const isHighlighted = highlight && highlight.glyph === glyph;
        drawLine(ctx, probs[glyph], maxK, minProb, yRange, color, settings.useVoynichFont, glyph, highlight, index);
      }
    });
    
    // Draw legend
    drawLegend(ctx, selectedGlyphs, settings.useVoynichFont);
    
    // Draw title
    drawTitle(ctx, chartType, isDiff);
    
    // Draw tooltip if highlighting a point
    if (highlight) {
      drawTooltip(ctx, highlight, probs, maxK, minProb, yRange, settings);
    }
  }
  
  /**
   * Re-render with highlight (for hover effects).
   */
  function renderWithHighlight(canvasId, highlight) {
    const state = renderState[canvasId];
    if (!state) return;
    
    render(state.data, state.selectedGlyphs, state.settings, canvasId, state.chartType, highlight);
  }
  
  /**
   * Clear highlight and re-render.
   */
  function clearHighlight(canvasId) {
    const state = renderState[canvasId];
    if (!state) return;
    
    render(state.data, state.selectedGlyphs, state.settings, canvasId, state.chartType, null);
  }
  
  /**
   * Draw grid lines.
   */
  function drawGrid(ctx, maxK, minProb, maxProb, isDiff) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    
    // Vertical grid lines (for each k)
    for (let k = 0; k <= maxK; k++) {
      const x = MARGIN.left + (k / maxK) * CHART_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, MARGIN.top);
      ctx.lineTo(x, MARGIN.top + CHART_HEIGHT);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    const yRange = maxProb - minProb;
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = minProb + (i / yTicks) * yRange;
      const y = MARGIN.top + CHART_HEIGHT - ((yVal - minProb) / yRange) * CHART_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(MARGIN.left + CHART_WIDTH, y);
      ctx.stroke();
    }
    
    // Draw zero line for diff mode
    if (isDiff && minProb < 0 && maxProb > 0) {
      const yZero = MARGIN.top + CHART_HEIGHT - ((0 - minProb) / yRange) * CHART_HEIGHT;
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, yZero);
      ctx.lineTo(MARGIN.left + CHART_WIDTH, yZero);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  
  /**
   * Draw axes and labels.
   */
  function drawAxes(ctx, maxK, minProb, maxProb, chartType, isDiff) {
    ctx.strokeStyle = AXIS_COLOR;
    ctx.fillStyle = AXIS_COLOR;
    ctx.lineWidth = 2;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    // Y axis
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left, MARGIN.top + CHART_HEIGHT);
    ctx.stroke();
    
    // X axis
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top + CHART_HEIGHT);
    ctx.lineTo(MARGIN.left + CHART_WIDTH, MARGIN.top + CHART_HEIGHT);
    ctx.stroke();
    
    // Y axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yRange = maxProb - minProb;
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = minProb + (i / yTicks) * yRange;
      const y = MARGIN.top + CHART_HEIGHT - ((yVal - minProb) / yRange) * CHART_HEIGHT;
      const label = isDiff ? `${(yVal * 100).toFixed(1)}pp` : `${(yVal * 100).toFixed(0)}%`;
      ctx.fillText(label, MARGIN.left - 8, y);
    }
    
    // X axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let k = 0; k <= maxK; k++) {
      const x = MARGIN.left + (k / maxK) * CHART_WIDTH;
      ctx.fillText(String(k), x, MARGIN.top + CHART_HEIGHT + 8);
    }
    
    // Axis titles
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    // X axis title
    const xTitle = chartType === 'from_start' ? 'Word Position from Line Start (k)' : 'Word Position from Line End (k)';
    ctx.fillText(xTitle, MARGIN.left + CHART_WIDTH / 2, MARGIN.top + CHART_HEIGHT + 30);
    
    // Y axis title - different for each chart type
    ctx.save();
    ctx.translate(20, MARGIN.top + CHART_HEIGHT / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    let yTitle;
    if (isDiff) {
      yTitle = 'Probability Difference (pp)';
    } else if (chartType === 'from_start') {
      yTitle = 'P(word starts with glyph)';
    } else {
      yTitle = 'P(word ends with glyph)';
    }
    ctx.fillText(yTitle, 0, 0);
    ctx.restore();
  }
  
  /**
   * Draw a line for a single glyph.
   */
  function drawLine(ctx, probData, maxK, minProb, yRange, color, useVoynichFont, glyph, highlight, glyphIndex) {
    const points = [];
    
    for (let k = 0; k <= maxK; k++) {
      const p = probData[String(k)] || 0;
      const x = MARGIN.left + (k / maxK) * CHART_WIDTH;
      const y = MARGIN.top + CHART_HEIGHT - ((p - minProb) / yRange) * CHART_HEIGHT;
      points.push({ x, y, k, p });
    }
    
    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    });
    ctx.stroke();
    
    // Draw points
    points.forEach(pt => {
      const isHovered = highlight && highlight.glyph === glyph && highlight.k === pt.k;
      const radius = isHovered ? HOVER_RADIUS : POINT_RADIUS;
      
      // Draw white outline for visibility
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius + 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw colored point
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw highlight ring
      if (isHovered) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
  
  /**
   * Draw tooltip at highlighted point.
   */
  function drawTooltip(ctx, highlight, probs, maxK, minProb, yRange, settings) {
    const probData = probs[highlight.glyph];
    if (!probData) return;
    
    const p = probData[String(highlight.k)] || 0;
    const x = MARGIN.left + (highlight.k / maxK) * CHART_WIDTH;
    const y = MARGIN.top + CHART_HEIGHT - ((p - minProb) / yRange) * CHART_HEIGHT;
    
    // Tooltip content
    const glyphLabel = Config.getCharDisplay(highlight.glyph, settings.useVoynichFont);
    const probText = `${(p * 100).toFixed(2)}%`;
    const posText = `k = ${highlight.k}`;
    
    // Tooltip dimensions
    const padding = 8;
    const lineHeight = 16;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textWidth = Math.max(
      ctx.measureText(probText).width,
      ctx.measureText(posText).width,
      40
    );
    const tooltipWidth = textWidth + padding * 2 + 20;
    const tooltipHeight = lineHeight * 2 + padding * 2;
    
    // Position tooltip (avoid edges)
    let tooltipX = x + 15;
    let tooltipY = y - tooltipHeight / 2;
    
    if (tooltipX + tooltipWidth > CANVAS_WIDTH - 10) {
      tooltipX = x - tooltipWidth - 15;
    }
    if (tooltipY < 10) {
      tooltipY = 10;
    }
    if (tooltipY + tooltipHeight > CANVAS_HEIGHT - 10) {
      tooltipY = CANVAS_HEIGHT - tooltipHeight - 10;
    }
    
    // Draw tooltip background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = highlight.color;
    ctx.lineWidth = 2;
    
    // Rounded rectangle
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(tooltipX + radius, tooltipY);
    ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
    ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
    ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
    ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
    ctx.lineTo(tooltipX, tooltipY + radius);
    ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw color indicator
    ctx.fillStyle = highlight.color;
    ctx.beginPath();
    ctx.arc(tooltipX + padding + 6, tooltipY + padding + lineHeight / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw glyph label
    ctx.fillStyle = '#333';
    ctx.font = settings.useVoynichFont ? '14px Voynich' : '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyphLabel, tooltipX + padding + 18, tooltipY + padding + lineHeight / 2);
    
    // Draw probability
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(probText, tooltipX + padding + 40, tooltipY + padding + lineHeight / 2);
    
    // Draw position
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText(posText, tooltipX + padding, tooltipY + padding + lineHeight * 1.5);
  }
  
  /**
   * Draw legend.
   */
  function drawLegend(ctx, selectedGlyphs, useVoynichFont) {
    if (selectedGlyphs.length === 0) return;
    
    const legendY = 18;
    const itemWidth = 50;
    const totalWidth = selectedGlyphs.length * itemWidth;
    let startX = (CANVAS_WIDTH - totalWidth) / 2;
    
    ctx.font = useVoynichFont ? '14px Voynich' : '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    
    selectedGlyphs.forEach((glyph, index) => {
      const color = Config.getLineColor(index);
      const x = startX + index * itemWidth;
      
      // Draw line sample
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, legendY);
      ctx.lineTo(x + 20, legendY);
      ctx.stroke();
      
      // Draw point
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 10, legendY, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw label
      ctx.fillStyle = '#333';
      const label = Config.getCharDisplay(glyph, useVoynichFont);
      ctx.fillText(label, x + 26, legendY);
    });
  }
  
  /**
   * Draw chart title.
   */
  function drawTitle(ctx, chartType, isDiff) {
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    
    let title = chartType === 'from_start' ? 'From Line Start' : 'From Line End';
    if (isDiff) {
      title += ' (Difference)';
    }
    ctx.fillText(title, MARGIN.left + CHART_WIDTH, 8);
  }
  
  /**
   * Get data point at canvas coordinates.
   * @param {number} canvasX - X coordinate on canvas
   * @param {number} canvasY - Y coordinate on canvas  
   * @param {Object} data - Current data
   * @param {string[]} selectedGlyphs - Selected glyphs
   * @param {string} chartType - 'from_start' or 'from_end'
   * @param {string} canvasId - Canvas identifier
   * @returns {Object|null} Point info or null if not near a point
   */
  function getPointAt(canvasX, canvasY, data, selectedGlyphs, chartType, canvasId = 'primary') {
    const canvas = canvases[canvasId];
    if (!canvas || !selectedGlyphs || selectedGlyphs.length === 0) return null;
    
    const maxK = data.max_word_position || 10;
    const probKey = chartType === 'from_start' ? 'prob_from_start' : 'prob_from_end';
    const probs = data[probKey] || {};
    
    // Find max/min for Y scale
    let maxProb = 0;
    let minProb = 0;
    const isDiff = data.isDiff;
    
    for (const glyph of selectedGlyphs) {
      if (probs[glyph]) {
        for (let k = 0; k <= maxK; k++) {
          const p = probs[glyph][String(k)] || 0;
          maxProb = Math.max(maxProb, p);
          if (isDiff) {
            minProb = Math.min(minProb, p);
          }
        }
      }
    }
    
    maxProb = Math.max(maxProb * 1.1, 0.05);
    if (isDiff) {
      minProb = Math.min(minProb * 1.1, -0.05);
    }
    const yRange = maxProb - minProb;
    
    // Check each point
    const hitRadius = 20;
    
    for (let gi = 0; gi < selectedGlyphs.length; gi++) {
      const glyph = selectedGlyphs[gi];
      if (!probs[glyph]) continue;
      
      for (let k = 0; k <= maxK; k++) {
        const p = probs[glyph][String(k)] || 0;
        const x = MARGIN.left + (k / maxK) * CHART_WIDTH;
        const y = MARGIN.top + CHART_HEIGHT - ((p - minProb) / yRange) * CHART_HEIGHT;
        
        const dist = Math.sqrt(Math.pow(canvasX - x, 2) + Math.pow(canvasY - y, 2));
        if (dist <= hitRadius) {
          return {
            glyph,
            k,
            probability: p,
            color: Config.getLineColor(gi),
            chartType,
            x,
            y,
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Get canvas coordinates from mouse event.
   */
  function getCanvasCoords(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }
  
  // Public API
  return {
    init,
    render,
    renderWithHighlight,
    clearHighlight,
    getPointAt,
    getCanvasCoords,
  };
})();
