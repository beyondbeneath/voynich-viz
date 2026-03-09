/**
 * Bar chart module for asymmetry visualization.
 * Shows first word vs last word asymmetry for all glyphs.
 */

const BarChart = (function() {
  let canvas = null;
  let ctx = null;
  
  // Chart dimensions
  const BAR_HEIGHT = 18;
  const BAR_GAP = 4;
  const LABEL_WIDTH = 35;
  const VALUE_WIDTH = 65;
  const CHART_PADDING = 20;
  const BAR_AREA_WIDTH = 400;
  
  /**
   * Initialize the bar chart canvas.
   * @param {HTMLCanvasElement} canvasElement - Canvas element
   */
  function init(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
  }
  
  /**
   * Render the asymmetry bar chart.
   * Asymmetry is INVERTED for display: line-start preference = negative (left), line-end = positive (right)
   * @param {Object} data - Aggregation data with asymmetry values
   * @param {Object} settings - Rendering settings
   * @param {Object} [dataB] - Second dataset for compare mode
   */
  function render(data, settings, dataB = null) {
    if (!canvas || !ctx) return;
    
    const isDiff = data.isDiff;
    const isCompare = dataB !== null;
    
    // Get asymmetry data sorted by absolute value
    // INVERT: negate asymmetry so line-start preference (originally positive) becomes negative
    let ranking = [];
    
    if (isDiff) {
      // For diff mode, use the diff asymmetry values (inverted)
      const asymmetry = data.asymmetry || {};
      for (const glyph of Object.keys(asymmetry)) {
        ranking.push({
          glyph,
          asymmetry: -asymmetry[glyph], // Invert
        });
      }
    } else if (isCompare) {
      // For compare mode, show both A and B side by side (inverted)
      const asymA = data.asymmetry || {};
      const asymB = dataB.asymmetry || {};
      const allGlyphs = new Set([...Object.keys(asymA), ...Object.keys(asymB)]);
      
      for (const glyph of allGlyphs) {
        ranking.push({
          glyph,
          asymmetryA: -(asymA[glyph] || 0), // Invert
          asymmetryB: -(asymB[glyph] || 0), // Invert
        });
      }
    } else {
      // Single mode - use ranking from data (inverted)
      ranking = (data.asymmetry_ranking || []).map(item => ({
        ...item,
        asymmetry: -item.asymmetry, // Invert
      }));
    }
    
    // Sort by absolute value of asymmetry
    if (isCompare) {
      ranking.sort((a, b) => Math.abs(b.asymmetryA) - Math.abs(a.asymmetryA));
    } else {
      ranking.sort((a, b) => Math.abs(b.asymmetry) - Math.abs(a.asymmetry));
    }
    
    // Take top glyphs to fit in view
    const maxGlyphs = 20;
    ranking = ranking.slice(0, maxGlyphs);
    
    if (ranking.length === 0) {
      canvas.width = 400;
      canvas.height = 100;
      ctx.fillStyle = '#666';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', 200, 50);
      return;
    }
    
    // Find max absolute value for scaling
    let maxAbs = 0;
    for (const item of ranking) {
      if (isCompare) {
        maxAbs = Math.max(maxAbs, Math.abs(item.asymmetryA), Math.abs(item.asymmetryB));
      } else {
        maxAbs = Math.max(maxAbs, Math.abs(item.asymmetry));
      }
    }
    maxAbs = Math.max(maxAbs, 0.01); // Minimum scale
    
    // Calculate canvas size
    const rowHeight = isCompare ? BAR_HEIGHT * 2 + BAR_GAP : BAR_HEIGHT;
    const chartHeight = ranking.length * (rowHeight + BAR_GAP) + CHART_PADDING * 2;
    const chartWidth = LABEL_WIDTH + BAR_AREA_WIDTH + VALUE_WIDTH + CHART_PADDING * 2;
    
    canvas.width = chartWidth;
    canvas.height = chartHeight;
    
    // Clear canvas
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, chartWidth, chartHeight);
    
    // Draw center line (zero)
    const centerX = CHART_PADDING + LABEL_WIDTH + BAR_AREA_WIDTH / 2;
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, CHART_PADDING);
    ctx.lineTo(centerX, chartHeight - CHART_PADDING);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw bars
    const barStart = CHART_PADDING + LABEL_WIDTH;
    const barWidth = BAR_AREA_WIDTH / 2;
    
    ranking.forEach((item, index) => {
      const baseY = CHART_PADDING + index * (rowHeight + BAR_GAP);
      
      if (isCompare) {
        // Draw A bar
        drawSingleBar(
          ctx, item.glyph, item.asymmetryA, maxAbs,
          barStart, baseY, barWidth, BAR_HEIGHT,
          centerX, settings, true, 'A'
        );
        
        // Draw B bar (offset)
        drawSingleBar(
          ctx, null, item.asymmetryB, maxAbs,
          barStart, baseY + BAR_HEIGHT + 2, barWidth, BAR_HEIGHT,
          centerX, settings, false, 'B'
        );
      } else {
        drawSingleBar(
          ctx, item.glyph, item.asymmetry, maxAbs,
          barStart, baseY, barWidth, BAR_HEIGHT,
          centerX, settings, true, null
        );
      }
    });
    
    // Draw scale labels
    ctx.fillStyle = '#666';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    
    const scaleY = chartHeight - 8;
    const maxLabel = `${(maxAbs * 100).toFixed(0)}pp`;
    ctx.fillText(`-${maxLabel}`, barStart, scaleY);
    ctx.fillText('0', centerX, scaleY);
    ctx.fillText(`+${maxLabel}`, barStart + BAR_AREA_WIDTH, scaleY);
    
    // Draw side labels (inverted: line-start on left, line-end on right)
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#e74c3c';
    ctx.fillText('← Line-start', barStart + 30, scaleY - 12);
    ctx.fillStyle = '#3498db';
    ctx.textAlign = 'right';
    ctx.fillText('Line-end →', barStart + BAR_AREA_WIDTH - 30, scaleY - 12);
  }
  
  /**
   * Draw a single bar.
   * After inversion: positive = line-END (right, blue), negative = line-START (left, red)
   */
  function drawSingleBar(ctx, glyph, value, maxAbs, barStart, y, barWidth, height, centerX, settings, showLabel, suffix) {
    // Draw glyph label
    if (showLabel && glyph) {
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '14px Voynich' : '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = Config.getCharDisplay(glyph, settings.useVoynichFont);
      ctx.fillText(label, barStart - 8, y + height / 2);
    }
    
    // Draw bar (inverted colors: positive=blue/line-end, negative=red/line-start)
    const barWidthPixels = Math.abs(value / maxAbs) * barWidth;
    const isPositive = value >= 0;
    
    if (isPositive) {
      ctx.fillStyle = '#3498db'; // Blue for line-end preference (positive after inversion)
    } else {
      ctx.fillStyle = '#e74c3c'; // Red for line-start preference (negative after inversion)
    }
    
    if (isPositive) {
      ctx.fillRect(centerX, y, barWidthPixels, height);
    } else {
      ctx.fillRect(centerX - barWidthPixels, y, barWidthPixels, height);
    }
    
    // Draw value label
    ctx.fillStyle = isPositive ? '#2980b9' : '#c0392b';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    let valueLabel = `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}pp`;
    if (suffix) {
      valueLabel = `${suffix}: ${valueLabel}`;
    }
    
    ctx.fillText(valueLabel, barStart + barWidth * 2 + 8, y + height / 2);
  }
  
  /**
   * Get bar item at canvas coordinates.
   * @param {number} canvasX - X coordinate
   * @param {number} canvasY - Y coordinate
   * @param {Object} data - Current data
   * @returns {Object|null} Bar info or null
   */
  function getBarAt(canvasX, canvasY, data) {
    if (!canvas) return null;
    
    const ranking = (data.asymmetry_ranking || []).slice(0, 20);
    const rowHeight = BAR_HEIGHT;
    
    for (let i = 0; i < ranking.length; i++) {
      const y = CHART_PADDING + i * (rowHeight + BAR_GAP);
      if (canvasY >= y && canvasY <= y + rowHeight) {
        return ranking[i];
      }
    }
    
    return null;
  }
  
  // Public API
  return {
    init,
    render,
    getBarAt,
  };
})();
