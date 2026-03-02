/**
 * Heatmap rendering module for Voynich transition visualizer.
 * Uses Canvas for efficient rendering of the transition matrix.
 */

const Heatmap = (function() {
  // Support multiple canvas instances
  const canvases = {
    primary: { canvas: null, ctx: null, data: null },
    secondary: { canvas: null, ctx: null, data: null },
  };
  
  let currentSettings = null;
  let hoveredCell = null;
  let activeCanvasId = 'primary';
  
  // Dimensions
  let cellSize = 28;
  let labelWidth = 60;
  let labelHeight = 36;
  let separatorWidth = 10;
  
  /**
   * Initialize a heatmap with a canvas element.
   * @param {HTMLCanvasElement} canvasEl - Canvas element to render to
   * @param {string} id - Canvas identifier ('primary' or 'secondary')
   */
  function init(canvasEl, id = 'primary') {
    if (!canvasEl) return;
    
    canvases[id] = {
      canvas: canvasEl,
      ctx: canvasEl.getContext('2d'),
      data: null,
    };
    
    // Set up mouse tracking for hover
    canvasEl.addEventListener('mousemove', (e) => handleMouseMove(e, id));
    canvasEl.addEventListener('mouseleave', () => handleMouseLeave(id));
  }
  
  /**
   * Render the heatmap with the given data and settings.
   * @param {Object} data - Aggregation data with transitionMatrix
   * @param {Object} settings - Render settings
   * @param {string} canvasId - Which canvas to render to ('primary' or 'secondary')
   */
  function render(data, settings, canvasId = 'primary') {
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
    
    // Get characters to display - use full CHAR_ORDER for consistent layout
    let chars = [...Config.CHAR_ORDER];
    
    // Filter out boundaries if not showing them
    if (!settings.showBoundaries) {
      chars = chars.filter(c => !Config.isBoundaryChar(c));
    }
    
    // Split into regular chars and boundaries
    const regularChars = chars.filter(c => !Config.isBoundaryChar(c));
    const boundaryChars = chars.filter(c => Config.isBoundaryChar(c));
    
    // Calculate dimensions
    const numRegular = regularChars.length;
    const numBoundary = boundaryChars.length;
    const hasBoundaries = settings.showBoundaries && numBoundary > 0;
    
    const totalCols = numRegular + (hasBoundaries ? numBoundary + 1 : 0);  // +1 for separator
    const totalRows = numRegular + (hasBoundaries ? numBoundary + 1 : 0);
    
    const width = labelWidth + totalCols * cellSize + 20;
    const height = labelHeight + totalRows * cellSize + 20;
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
    
    // Clear
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    // Get max value for normalization
    const matrix = data.transitionMatrix;
    const dataType = settings.displayMode;
    let maxValue = 0;
    
    for (const from of chars) {
      for (const to of chars) {
        const val = DataLoader.getTransition(matrix, from, to, dataType);
        if (val > maxValue) maxValue = val;
      }
    }
    
    // Store layout info for hover detection
    canvasInfo.data._layout = {
      chars,
      regularChars,
      boundaryChars,
      hasBoundaries,
      labelWidth,
      labelHeight,
      cellSize,
      separatorWidth,
      maxValue,
    };
    
    // Draw cells
    let col = 0;
    for (let j = 0; j < chars.length; j++) {
      const toChar = chars[j];
      const isBoundaryCol = Config.isBoundaryChar(toChar);
      
      // Add separator before boundaries
      if (hasBoundaries && isBoundaryCol && j === regularChars.length) {
        col++;  // Skip separator column
      }
      
      let row = 0;
      for (let i = 0; i < chars.length; i++) {
        const fromChar = chars[i];
        const isBoundaryRow = Config.isBoundaryChar(fromChar);
        
        // Add separator before boundaries
        if (hasBoundaries && isBoundaryRow && i === regularChars.length) {
          row++;  // Skip separator row
        }
        
        const x = labelWidth + col * cellSize;
        const y = labelHeight + row * cellSize;
        
        // Get value
        const value = DataLoader.getTransition(matrix, fromChar, toChar, dataType);
        
        // Normalize
        let normalized = 0;
        if (maxValue > 0) {
          normalized = settings.useLogScale 
            ? Config.logScale(value, maxValue)
            : value / maxValue;
        }
        
        // Draw cell
        ctx.fillStyle = Config.getColor(normalized, settings.colorScale);
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
        
        row++;
      }
      col++;
    }
    
    // Draw separator lines if showing boundaries
    if (hasBoundaries) {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      
      const sepCol = labelWidth + regularChars.length * cellSize + separatorWidth / 2;
      const sepRow = labelHeight + regularChars.length * cellSize + separatorWidth / 2;
      
      // Vertical separator
      ctx.beginPath();
      ctx.moveTo(sepCol, labelHeight);
      ctx.lineTo(sepCol, height - 10);
      ctx.stroke();
      
      // Horizontal separator  
      ctx.beginPath();
      ctx.moveTo(labelWidth, sepRow);
      ctx.lineTo(width - 10, sepRow);
      ctx.stroke();
    }
    
    // Draw column labels (top)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    col = 0;
    for (let j = 0; j < chars.length; j++) {
      const char = chars[j];
      const isBoundary = Config.isBoundaryChar(char);
      
      if (hasBoundaries && isBoundary && j === regularChars.length) {
        col++;
      }
      
      const x = labelWidth + col * cellSize + cellSize / 2;
      const y = labelHeight - 4;
      
      drawLabel(char, x, y, settings, 'column');
      col++;
    }
    
    // Draw row labels (left)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    let row = 0;
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const isBoundary = Config.isBoundaryChar(char);
      
      if (hasBoundaries && isBoundary && i === regularChars.length) {
        row++;
      }
      
      const x = labelWidth - 4;
      const y = labelHeight + row * cellSize + cellSize / 2;
      
      drawLabel(char, x, y, settings, 'row');
      row++;
    }
    
    // Draw axis labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('To →', labelWidth + (totalCols * cellSize) / 2, 12);
    
    ctx.save();
    ctx.translate(12, labelHeight + (totalRows * cellSize) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('From →', 0, 0);
    ctx.restore();
  }
  
  /**
   * Render a diff heatmap showing the difference between two aggregations.
   * @param {Object} diffData - Diff data from DataLoader.computeDiff
   * @param {Object} settings - Render settings
   * @param {string} canvasId - Which canvas to render to
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
    
    // Get characters to display
    let chars = [...Config.CHAR_ORDER];
    
    if (!settings.showBoundaries) {
      chars = chars.filter(c => !Config.isBoundaryChar(c));
    }
    
    const regularChars = chars.filter(c => !Config.isBoundaryChar(c));
    const boundaryChars = chars.filter(c => Config.isBoundaryChar(c));
    
    const numRegular = regularChars.length;
    const numBoundary = boundaryChars.length;
    const hasBoundaries = settings.showBoundaries && numBoundary > 0;
    
    const totalCols = numRegular + (hasBoundaries ? numBoundary + 1 : 0);
    const totalRows = numRegular + (hasBoundaries ? numBoundary + 1 : 0);
    
    const width = labelWidth + totalCols * cellSize + 20;
    const height = labelHeight + totalRows * cellSize + 20;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    const maxAbsDiff = diffData.maxAbsDiff || 0.3;
    
    // Store layout info
    canvasInfo.data._layout = {
      chars,
      regularChars,
      boundaryChars,
      hasBoundaries,
      labelWidth,
      labelHeight,
      cellSize,
      separatorWidth,
      maxAbsDiff,
    };
    
    // Draw cells
    let col = 0;
    for (let j = 0; j < chars.length; j++) {
      const toChar = chars[j];
      const isBoundaryCol = Config.isBoundaryChar(toChar);
      
      if (hasBoundaries && isBoundaryCol && j === regularChars.length) {
        col++;
      }
      
      let row = 0;
      for (let i = 0; i < chars.length; i++) {
        const fromChar = chars[i];
        const isBoundaryRow = Config.isBoundaryChar(fromChar);
        
        if (hasBoundaries && isBoundaryRow && i === regularChars.length) {
          row++;
        }
        
        const x = labelWidth + col * cellSize;
        const y = labelHeight + row * cellSize;
        
        const diff = DataLoader.getDiff(diffData.diffMatrix, fromChar, toChar);
        
        // Normalize to -1 to 1 range
        const normalizedDiff = maxAbsDiff > 0 ? diff / maxAbsDiff : 0;
        const clampedDiff = Math.max(-1, Math.min(1, normalizedDiff));
        
        ctx.fillStyle = Config.getDiffColor(clampedDiff);
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
        
        row++;
      }
      col++;
    }
    
    // Draw separator lines if showing boundaries
    if (hasBoundaries) {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      
      const sepCol = labelWidth + regularChars.length * cellSize + separatorWidth / 2;
      const sepRow = labelHeight + regularChars.length * cellSize + separatorWidth / 2;
      
      ctx.beginPath();
      ctx.moveTo(sepCol, labelHeight);
      ctx.lineTo(sepCol, height - 10);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(labelWidth, sepRow);
      ctx.lineTo(width - 10, sepRow);
      ctx.stroke();
    }
    
    // Draw column labels (top)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    col = 0;
    for (let j = 0; j < chars.length; j++) {
      const char = chars[j];
      const isBoundary = Config.isBoundaryChar(char);
      
      if (hasBoundaries && isBoundary && j === regularChars.length) {
        col++;
      }
      
      const x = labelWidth + col * cellSize + cellSize / 2;
      const y = labelHeight - 4;
      
      drawLabelOnCtx(ctx, char, x, y, settings, 'column');
      col++;
    }
    
    // Draw row labels (left)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    let row = 0;
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const isBoundary = Config.isBoundaryChar(char);
      
      if (hasBoundaries && isBoundary && i === regularChars.length) {
        row++;
      }
      
      const x = labelWidth - 4;
      const y = labelHeight + row * cellSize + cellSize / 2;
      
      drawLabelOnCtx(ctx, char, x, y, settings, 'row');
      row++;
    }
    
    // Draw axis labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('To →', labelWidth + (totalCols * cellSize) / 2, 12);
    
    ctx.save();
    ctx.translate(12, labelHeight + (totalRows * cellSize) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('From →', 0, 0);
    ctx.restore();
  }

  /**
   * Draw a character label with auto-scaling for long strings.
   */
  function drawLabel(char, x, y, settings, type) {
    const canvasInfo = canvases[activeCanvasId];
    if (!canvasInfo || !canvasInfo.ctx) return;
    drawLabelOnCtx(canvasInfo.ctx, char, x, y, settings, type);
  }
  
  /**
   * Draw a character label on a specific context.
   */
  function drawLabelOnCtx(ctx, char, x, y, settings, type) {
    const isBoundary = Config.isBoundaryChar(char);
    const label = Config.getCharDisplay(char, settings.useVoynichFont && !isBoundary, true);
    
    // Base font size
    let fontSize = settings.fontSize || 14;
    const maxWidth = cellSize - 4;  // Leave some padding
    
    // Determine font family
    const fontFamily = (settings.useVoynichFont && !isBoundary) ? 'Voynich, monospace' : 'sans-serif';
    
    // For boundaries, use smaller font
    if (isBoundary) {
      fontSize = 9;
    }
    
    // Measure text and scale down if needed
    ctx.font = `${fontSize}px ${fontFamily}`;
    let textWidth = ctx.measureText(label).width;
    
    // Scale down long labels to fit in cell
    if (textWidth > maxWidth && !isBoundary) {
      const scale = maxWidth / textWidth;
      fontSize = Math.max(8, Math.floor(fontSize * scale));
      ctx.font = `${fontSize}px ${fontFamily}`;
    }
    
    ctx.fillStyle = isBoundary ? '#666' : '#333';
    
    if (type === 'column') {
      // Horizontal column labels (no rotation)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, x, y);
    } else {
      // Row labels
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);
    }
  }
  
  /**
   * Handle mouse move for hover effects.
   * @param {MouseEvent} event
   * @param {string} canvasId - Which canvas triggered the event
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
    const { chars, regularChars, hasBoundaries, labelWidth, labelHeight, cellSize } = layout;
    
    if (x < labelWidth || y < labelHeight) {
      updateHover(null, canvasId);
      return;
    }
    
    let col = Math.floor((x - labelWidth) / cellSize);
    let row = Math.floor((y - labelHeight) / cellSize);
    
    if (hasBoundaries) {
      const sepCol = regularChars.length;
      const sepRow = regularChars.length;
      
      if (col === sepCol || row === sepRow) {
        updateHover(null, canvasId);
        return;
      }
      
      if (col > sepCol) col--;
      if (row > sepRow) row--;
    }
    
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
   * @param {string} canvasId
   */
  function handleMouseLeave(canvasId = 'primary') {
    updateHover(null, canvasId);
  }
  
  /**
   * Update hover state and trigger callback.
   * @param {Object|null} cell
   * @param {string} canvasId
   */
  function updateHover(cell, canvasId = 'primary') {
    const changed = JSON.stringify(cell) !== JSON.stringify(hoveredCell);
    hoveredCell = cell;
    
    if (changed && currentSettings && currentSettings.onHover) {
      const canvasInfo = canvases[canvasId];
      const currentData = canvasInfo?.data;
      
      if (cell && currentData) {
        // Check if this is diff data
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
  
  /**
   * Get the current hovered cell info.
   */
  function getHoveredCell() {
    return hoveredCell;
  }
  
  /**
   * Export the current canvas as an image.
   * @param {string} canvasId - Which canvas to export
   * @returns {string} Data URL of the image
   */
  function exportAsImage(canvasId = 'primary') {
    const canvasInfo = canvases[canvasId];
    if (!canvasInfo || !canvasInfo.canvas) return null;
    return canvasInfo.canvas.toDataURL('image/png');
  }
  
  // Public API
  return {
    init,
    render,
    renderDiff,
    getHoveredCell,
    exportAsImage,
  };
})();
