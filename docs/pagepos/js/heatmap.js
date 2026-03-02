/**
 * Heatmap rendering module for Voynich page position visualizer.
 * Renders position grid as a heatmap on HTML5 canvas.
 */

const Heatmap = (function() {
  const instances = {};
  
  /**
   * Initialize a heatmap instance.
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {string} id - Instance identifier
   */
  function init(canvas, id = 'primary') {
    instances[id] = {
      canvas,
      ctx: canvas.getContext('2d'),
      layout: null,
    };
    
    // Set up mouse events
    canvas.addEventListener('mousemove', (e) => handleMouseMove(e, id));
    canvas.addEventListener('mouseleave', () => handleMouseLeave(id));
  }
  
  /**
   * Apply gaussian-like blur to a grid by spreading values to neighbors.
   * @param {Array} distribution - 2D array of values
   * @param {number} rows - Number of rows
   * @param {number} cols - Number of columns
   * @returns {Array} Blurred distribution
   */
  function applyBlur(distribution, rows, cols) {
    const blurred = Array(rows).fill().map(() => Array(cols).fill(0));
    
    // 3x3 gaussian-like kernel (normalized)
    const kernel = [
      [0.05, 0.1, 0.05],
      [0.1,  0.4, 0.1],
      [0.05, 0.1, 0.05],
    ];
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = distribution[r]?.[c] || 0;
        if (val === 0) continue;
        
        // Spread value to neighbors using kernel
        for (let kr = -1; kr <= 1; kr++) {
          for (let kc = -1; kc <= 1; kc++) {
            const nr = r + kr;
            const nc = c + kc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              blurred[nr][nc] += val * kernel[kr + 1][kc + 1];
            }
          }
        }
      }
    }
    
    return blurred;
  }
  
  /**
   * Render the position grid heatmap.
   * @param {Object} gridData - Grid data from DataLoader.getCharGrid()
   * @param {Object} settings - Render settings
   * @param {string} id - Instance identifier
   */
  function render(gridData, settings, id = 'primary') {
    const instance = instances[id];
    if (!instance) return;
    
    const { canvas, ctx } = instance;
    const { grid, distribution, total, grid_cols, grid_rows } = gridData;
    
    if (!grid || grid_rows === 0 || grid_cols === 0) return;
    
    const isRawMode = settings.resolution === 'raw';
    
    // For raw mode, use smaller cells and apply blur
    let cellSize = settings.cellSize || 40;
    if (isRawMode) {
      // Scale cell size for the high-res grid to fit in reasonable space
      cellSize = Math.max(3, Math.min(8, 400 / grid_cols));
    }
    
    const padding = 10;
    
    const width = grid_cols * cellSize + padding * 2;
    const height = grid_rows * cellSize + padding * 2;
    
    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    // Clear canvas
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    // Apply blur for raw mode
    let renderDistribution = distribution;
    if (isRawMode) {
      renderDistribution = applyBlur(distribution, grid_rows, grid_cols);
    }
    
    // Find max for normalization
    let maxValue = 0;
    for (const row of renderDistribution) {
      for (const val of row) {
        if (val > maxValue) maxValue = val;
      }
    }
    
    // Store layout for hover detection
    const cells = [];
    
    // Draw cells
    for (let r = 0; r < grid_rows; r++) {
      for (let c = 0; c < grid_cols; c++) {
        const value = renderDistribution[r]?.[c] || 0;
        const normalized = maxValue > 0 ? value / maxValue : 0;
        
        const x = padding + c * cellSize;
        const y = padding + r * cellSize;
        
        // Fill cell
        ctx.fillStyle = Config.getColor(normalized, settings.colorScale);
        ctx.fillRect(x, y, cellSize, cellSize);
        
        // Draw border (lighter for raw mode since cells are small)
        if (!isRawMode || cellSize >= 6) {
          ctx.strokeStyle = 'rgba(0,0,0,0.05)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cellSize, cellSize);
        }
        
        // Store for hover (but use original distribution for accurate values)
        cells.push({
          x, y, width: cellSize, height: cellSize,
          row: r, col: c,
          count: grid[r]?.[c] || 0,
          distribution: distribution[r]?.[c] || 0,
          normalized,
        });
      }
    }
    
    instance.layout = {
      cells,
      rows: grid_rows,
      cols: grid_cols,
      cellSize,
      padding,
      total,
      settings,
      isRawMode,
    };
  }
  
  /**
   * Render diff mode heatmap.
   * @param {Object} diffData - Diff data from DataLoader.computeDiff()
   * @param {Object} settings - Render settings
   * @param {string} id - Instance identifier
   */
  function renderDiff(diffData, settings, id = 'primary') {
    const instance = instances[id];
    if (!instance) return;
    
    const { canvas, ctx } = instance;
    const { diffGrid, maxAbsDiff, gridA, gridB, grid_cols, grid_rows } = diffData;
    
    if (!diffGrid || grid_rows === 0 || grid_cols === 0) return;
    
    const isRawMode = settings.resolution === 'raw';
    
    let cellSize = settings.cellSize || 40;
    if (isRawMode) {
      cellSize = Math.max(3, Math.min(8, 400 / grid_cols));
    }
    
    const padding = 10;
    
    const width = grid_cols * cellSize + padding * 2;
    const height = grid_rows * cellSize + padding * 2;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    // Apply blur for raw mode
    let renderDiffGrid = diffGrid;
    if (isRawMode) {
      renderDiffGrid = applyBlur(diffGrid, grid_rows, grid_cols);
    }
    
    // Find max abs diff after blur
    let maxVal = 0;
    for (const row of renderDiffGrid) {
      for (const val of row) {
        if (Math.abs(val) > maxVal) maxVal = Math.abs(val);
      }
    }
    
    const cells = [];
    
    for (let r = 0; r < grid_rows; r++) {
      for (let c = 0; c < grid_cols; c++) {
        const diff = renderDiffGrid[r]?.[c] || 0;
        const normalizedDiff = maxVal > 0 ? diff / maxVal : 0;
        
        const x = padding + c * cellSize;
        const y = padding + r * cellSize;
        
        ctx.fillStyle = Config.getDiffColor(normalizedDiff);
        ctx.fillRect(x, y, cellSize, cellSize);
        
        if (!isRawMode || cellSize >= 6) {
          ctx.strokeStyle = 'rgba(0,0,0,0.05)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cellSize, cellSize);
        }
        
        cells.push({
          x, y, width: cellSize, height: cellSize,
          row: r, col: c,
          diff: diffGrid[r]?.[c] || 0,  // Use original for hover
          normalizedDiff,
          distA: gridA.distribution[r]?.[c] || 0,
          distB: gridB.distribution[r]?.[c] || 0,
          countA: gridA.grid[r]?.[c] || 0,
          countB: gridB.grid[r]?.[c] || 0,
        });
      }
    }
    
    instance.layout = {
      cells,
      rows: grid_rows,
      cols: grid_cols,
      cellSize,
      padding,
      settings,
      isDiff: true,
      isRawMode,
    };
  }
  
  /**
   * Handle mouse move for hover detection.
   */
  function handleMouseMove(event, id) {
    const instance = instances[id];
    if (!instance || !instance.layout) return;
    
    const rect = instance.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const { cells, settings, isRawMode } = instance.layout;
    
    let hoverInfo = null;
    for (const cell of cells) {
      if (x >= cell.x && x < cell.x + cell.width &&
          y >= cell.y && y < cell.y + cell.height) {
        
        const regionLabel = Config.getRegionLabel(
          cell.col, cell.row,
          instance.layout.cols, instance.layout.rows
        );
        
        if (instance.layout.isDiff) {
          hoverInfo = {
            row: cell.row,
            col: cell.col,
            region: regionLabel,
            diff: cell.diff,
            distA: cell.distA,
            distB: cell.distB,
            countA: cell.countA,
            countB: cell.countB,
            isDiff: true,
            isRawMode,
          };
        } else {
          hoverInfo = {
            row: cell.row,
            col: cell.col,
            region: regionLabel,
            count: cell.count,
            distribution: cell.distribution,
            total: instance.layout.total,
            isRawMode,
          };
        }
        break;
      }
    }
    
    if (settings.onHover) {
      settings.onHover(hoverInfo);
    }
  }
  
  /**
   * Handle mouse leave.
   */
  function handleMouseLeave(id) {
    const instance = instances[id];
    if (!instance || !instance.layout) return;
    
    const { settings } = instance.layout;
    if (settings.onHover) {
      settings.onHover(null);
    }
  }
  
  /**
   * Export canvas as image.
   * @param {string} id - Instance identifier
   * @returns {string|null} Data URL or null
   */
  function exportAsImage(id = 'primary') {
    const instance = instances[id];
    if (!instance) return null;
    return instance.canvas.toDataURL('image/png');
  }
  
  // Public API
  return {
    init,
    render,
    renderDiff,
    exportAsImage,
  };
})();
