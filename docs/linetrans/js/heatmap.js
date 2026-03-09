/**
 * Heatmap rendering module for Voynich line transition visualizer.
 * Uses Canvas for efficient rendering of the transition matrix.
 */

const Heatmap = (function() {
  const canvases = {
    primary: { canvas: null, ctx: null, data: null },
    secondary: { canvas: null, ctx: null, data: null },
  };
  
  let currentSettings = null;
  let hoveredCell = null;
  let activeCanvasId = 'primary';
  
  let cellSize = 28;
  let labelWidth = 60;
  let labelHeight = 36;
  
  /**
   * Initialize a heatmap with a canvas element.
   */
  function init(canvasEl, id = 'primary') {
    if (!canvasEl) return;
    
    canvases[id] = {
      canvas: canvasEl,
      ctx: canvasEl.getContext('2d'),
      data: null,
    };
    
    canvasEl.addEventListener('mousemove', (e) => handleMouseMove(e, id));
    canvasEl.addEventListener('mouseleave', () => handleMouseLeave(id));
  }
  
  /**
   * Render the heatmap with the given data and settings.
   * @param {Object} data - Aggregation data
   * @param {Object} settings - Render settings
   * @param {string} canvasId - Canvas identifier
   * @param {Array} [unifiedCharset] - Optional unified charset for compare mode alignment
   */
  function render(data, settings, canvasId = 'primary', unifiedCharset = null) {
    const canvasInfo = canvases[canvasId];
    if (!canvasInfo || !canvasInfo.canvas || !canvasInfo.ctx) {
      console.error(`Heatmap ${canvasId} not initialized`);
      return;
    }
    
    const canvas = canvasInfo.canvas;
    const ctx = canvasInfo.ctx;
    canvasInfo.data = data;
    currentSettings = settings;
    activeCanvasId = canvasId;
    
    cellSize = settings.cellSize || 20;
    
    // Get characters to display - use unified charset if provided, else data's charset
    let chars = unifiedCharset 
      ? Config.sortCharacters(unifiedCharset) 
      : Config.sortCharacters(data.charset || []);
    
    const numChars = chars.length;
    const width = labelWidth + numChars * cellSize + 20;
    const height = labelHeight + numChars * cellSize + 20;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    const matrix = data.transitionMatrix;
    const dataType = settings.displayMode;
    let maxValue = 0;
    
    for (const from of chars) {
      for (const to of chars) {
        const val = DataLoader.getTransition(matrix, from, to, dataType);
        if (val > maxValue) maxValue = val;
      }
    }
    
    canvasInfo.data._layout = {
      chars,
      labelWidth,
      labelHeight,
      cellSize,
      maxValue,
    };
    
    // Draw cells
    for (let j = 0; j < chars.length; j++) {
      const toChar = chars[j];
      
      for (let i = 0; i < chars.length; i++) {
        const fromChar = chars[i];
        
        const x = labelWidth + j * cellSize;
        const y = labelHeight + i * cellSize;
        
        const value = DataLoader.getTransition(matrix, fromChar, toChar, dataType);
        
        let normalized = 0;
        if (maxValue > 0) {
          normalized = settings.useLogScale 
            ? Config.logScale(value, maxValue)
            : value / maxValue;
        }
        
        ctx.fillStyle = Config.getColor(normalized, settings.colorScale);
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
      }
    }
    
    // Draw column labels (top) - these are line-start chars
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    for (let j = 0; j < chars.length; j++) {
      const char = chars[j];
      const x = labelWidth + j * cellSize + cellSize / 2;
      const y = labelHeight - 4;
      
      drawLabelOnCtx(ctx, char, x, y, settings, 'column');
    }
    
    // Draw row labels (left) - these are line-end chars
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const x = labelWidth - 4;
      const y = labelHeight + i * cellSize + cellSize / 2;
      
      drawLabelOnCtx(ctx, char, x, y, settings, 'row');
    }
    
    // Draw axis labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Line Start →', labelWidth + (numChars * cellSize) / 2, 12);
    
    ctx.save();
    ctx.translate(12, labelHeight + (numChars * cellSize) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Line End →', 0, 0);
    ctx.restore();
  }
  
  /**
   * Render a diff heatmap showing the difference between two aggregations.
   */
  function renderDiff(diffData, settings, canvasId = 'primary') {
    const canvasInfo = canvases[canvasId];
    if (!canvasInfo || !canvasInfo.canvas || !canvasInfo.ctx) {
      console.error(`Heatmap ${canvasId} not initialized`);
      return;
    }
    
    const canvas = canvasInfo.canvas;
    const ctx = canvasInfo.ctx;
    canvasInfo.data = diffData;
    canvasInfo.data._isDiff = true;
    currentSettings = settings;
    activeCanvasId = canvasId;
    
    cellSize = settings.cellSize || 20;
    
    let chars = Config.sortCharacters(diffData.charset || []);
    
    const numChars = chars.length;
    const width = labelWidth + numChars * cellSize + 20;
    const height = labelHeight + numChars * cellSize + 20;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    const maxAbsDiff = diffData.maxAbsDiff || 0.3;
    
    canvasInfo.data._layout = {
      chars,
      labelWidth,
      labelHeight,
      cellSize,
      maxAbsDiff,
    };
    
    // Draw cells
    for (let j = 0; j < chars.length; j++) {
      const toChar = chars[j];
      
      for (let i = 0; i < chars.length; i++) {
        const fromChar = chars[i];
        
        const x = labelWidth + j * cellSize;
        const y = labelHeight + i * cellSize;
        
        const diff = DataLoader.getDiff(diffData.diffMatrix, fromChar, toChar);
        
        const normalizedDiff = maxAbsDiff > 0 ? diff / maxAbsDiff : 0;
        const clampedDiff = Math.max(-1, Math.min(1, normalizedDiff));
        
        ctx.fillStyle = Config.getDiffColor(clampedDiff);
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
      }
    }
    
    // Draw column labels (top)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    for (let j = 0; j < chars.length; j++) {
      const char = chars[j];
      const x = labelWidth + j * cellSize + cellSize / 2;
      const y = labelHeight - 4;
      
      drawLabelOnCtx(ctx, char, x, y, settings, 'column');
    }
    
    // Draw row labels (left)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const x = labelWidth - 4;
      const y = labelHeight + i * cellSize + cellSize / 2;
      
      drawLabelOnCtx(ctx, char, x, y, settings, 'row');
    }
    
    // Draw axis labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Line Start →', labelWidth + (numChars * cellSize) / 2, 12);
    
    ctx.save();
    ctx.translate(12, labelHeight + (numChars * cellSize) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Line End →', 0, 0);
    ctx.restore();
  }
  
  /**
   * Draw a character label on a specific context.
   */
  function drawLabelOnCtx(ctx, char, x, y, settings, type) {
    const label = Config.getCharDisplay(char, settings.useVoynichFont, true);
    
    let fontSize = settings.fontSize || 14;
    const maxWidth = cellSize - 4;
    
    const fontFamily = settings.useVoynichFont ? 'Voynich, monospace' : 'sans-serif';
    
    ctx.font = `${fontSize}px ${fontFamily}`;
    let textWidth = ctx.measureText(label).width;
    
    if (textWidth > maxWidth) {
      const scale = maxWidth / textWidth;
      fontSize = Math.max(8, Math.floor(fontSize * scale));
      ctx.font = `${fontSize}px ${fontFamily}`;
    }
    
    ctx.fillStyle = '#333';
    
    if (type === 'column') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, x, y);
    } else {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);
    }
  }
  
  /**
   * Handle mouse move for hover effects.
   */
  function handleMouseMove(event, canvasId = 'primary') {
    const canvasInfo = canvases[canvasId];
    if (!canvasInfo || !canvasInfo.data || !canvasInfo.data._layout) return;
    
    const canvas = canvasInfo.canvas;
    const currentData = canvasInfo.data;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const layout = currentData._layout;
    const { chars, labelWidth, labelHeight, cellSize } = layout;
    
    if (x < labelWidth || y < labelHeight) {
      updateHover(null, canvasId);
      return;
    }
    
    const col = Math.floor((x - labelWidth) / cellSize);
    const row = Math.floor((y - labelHeight) / cellSize);
    
    if (col < 0 || col >= chars.length || row < 0 || row >= chars.length) {
      updateHover(null, canvasId);
      return;
    }
    
    const fromChar = chars[row];
    const toChar = chars[col];
    
    updateHover({ from: fromChar, to: toChar, row, col }, canvasId);
  }
  
  /**
   * Handle mouse leave.
   */
  function handleMouseLeave(canvasId = 'primary') {
    updateHover(null, canvasId);
  }
  
  /**
   * Update hover state and trigger callback.
   */
  function updateHover(cell, canvasId = 'primary') {
    const changed = JSON.stringify(cell) !== JSON.stringify(hoveredCell);
    hoveredCell = cell;
    
    if (changed && currentSettings && currentSettings.onHover) {
      const canvasInfo = canvases[canvasId];
      const currentData = canvasInfo?.data;
      
      if (cell && currentData) {
        if (currentData._isDiff) {
          const diff = DataLoader.getDiff(currentData.diffMatrix, cell.from, cell.to);
          const matrixA = currentData.dataA.transitionMatrix;
          const matrixB = currentData.dataB.transitionMatrix;
          const probA = DataLoader.getTransition(matrixA, cell.from, cell.to, 'probabilities');
          const probB = DataLoader.getTransition(matrixB, cell.from, cell.to, 'probabilities');
          
          currentSettings.onHover({
            from: cell.from,
            to: cell.to,
            fromDisplay: Config.getCharTooltip(cell.from),
            toDisplay: Config.getCharTooltip(cell.to),
            diff,
            probA,
            probB,
          });
        } else {
          const matrix = currentData.transitionMatrix;
          const count = DataLoader.getTransition(matrix, cell.from, cell.to, 'counts');
          const prob = DataLoader.getTransition(matrix, cell.from, cell.to, 'probabilities');
          
          currentSettings.onHover({
            from: cell.from,
            to: cell.to,
            fromDisplay: Config.getCharTooltip(cell.from),
            toDisplay: Config.getCharTooltip(cell.to),
            count,
            probability: prob,
          });
        }
      } else {
        currentSettings.onHover(null);
      }
    }
  }
  
  function getHoveredCell() {
    return hoveredCell;
  }
  
  function exportAsImage(canvasId = 'primary') {
    const canvasInfo = canvases[canvasId];
    if (!canvasInfo || !canvasInfo.canvas) return null;
    return canvasInfo.canvas.toDataURL('image/png');
  }
  
  return {
    init,
    render,
    renderDiff,
    getHoveredCell,
    exportAsImage,
  };
})();
