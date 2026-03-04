/**
 * Heatmap rendering module for Voynich physical page position visualizer.
 * Renders position grid as a heatmap on HTML5 canvas.
 * 
 * Key difference from text-based pagepos: uses page-like aspect ratio
 * since we're dealing with actual pixel coordinates.
 */

const Heatmap = (function() {
  const instances = {};
  
  // Approximate aspect ratio of Voynich manuscript pages (width:height ≈ 0.73)
  const PAGE_ASPECT_RATIO = 0.73;
  
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
   * Generate a Gaussian kernel of the specified size.
   * @param {number} size - Kernel size (must be odd: 3, 5, 7, etc.)
   * @returns {Array} 2D kernel array, normalized to sum to 1
   */
  function generateGaussianKernel(size) {
    const kernel = [];
    const sigma = size / 2.5;  // Wider spread for more visible blur
    const center = Math.floor(size / 2);
    let sum = 0;
    
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        row.push(value);
        sum += value;
      }
      kernel.push(row);
    }
    
    // Normalize
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        kernel[y][x] /= sum;
      }
    }
    
    return kernel;
  }
  
  /**
   * Apply gaussian-like blur to a grid by spreading values to neighbors.
   * @param {Array} distribution - 2D array of values
   * @param {number} rows - Number of rows
   * @param {number} cols - Number of columns
   * @param {number} [kernelSize=3] - Size of the blur kernel (3, 5, 7, etc.)
   * @returns {Array} Blurred distribution
   */
  function applyBlur(distribution, rows, cols, kernelSize = 3) {
    const blurred = Array(rows).fill().map(() => Array(cols).fill(0));
    const kernel = generateGaussianKernel(kernelSize);
    const offset = Math.floor(kernelSize / 2);
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = distribution[r]?.[c] || 0;
        if (val === 0) continue;
        
        // Spread value to neighbors using kernel
        for (let kr = -offset; kr <= offset; kr++) {
          for (let kc = -offset; kc <= offset; kc++) {
            const nr = r + kr;
            const nc = c + kc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              blurred[nr][nc] += val * kernel[kr + offset][kc + offset];
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
    const { grid, distribution, total } = gridData;
    let { grid_cols, grid_rows } = gridData;
    
    if (!grid || grid_rows === 0 || grid_cols === 0) return;
    
    const isRawMode = settings.resolution === 'raw';
    
    // Apply clipping for raw mode
    let displayCols = grid_cols;
    let displayRows = grid_rows;
    if (isRawMode) {
      displayCols = Math.min(grid_cols, settings.clipWidth || 80);
      displayRows = Math.min(grid_rows, settings.clipHeight || 100);
    }
    
    // Calculate cell size to maintain page-like proportions
    // Target a reasonable canvas size (around 400px wide)
    const targetWidth = 350;
    let cellWidth = settings.cellSize || 30;
    let cellHeight = cellWidth / PAGE_ASPECT_RATIO;
    
    if (isRawMode) {
      // For raw mode, fit to target width
      cellWidth = Math.max(3, targetWidth / displayCols);
      cellHeight = cellWidth / PAGE_ASPECT_RATIO;
    }
    
    const padding = 10;
    
    const width = displayCols * cellWidth + padding * 2;
    const height = displayRows * cellHeight + padding * 2;
    
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
    
    // Apply blur for raw mode (on clipped region)
    let renderDistribution = distribution;
    if (isRawMode) {
      const blurSize = settings.blurSize || 3;
      renderDistribution = applyBlur(distribution, displayRows, displayCols, blurSize);
    }
    
    // Find max for normalization (only in displayed region)
    let maxValue = 0;
    for (let r = 0; r < displayRows; r++) {
      for (let c = 0; c < displayCols; c++) {
        const val = renderDistribution[r]?.[c] || 0;
        if (val > maxValue) maxValue = val;
      }
    }
    
    // Store layout for hover detection
    const cells = [];
    
    // Draw cells (only up to clipped dimensions)
    for (let r = 0; r < displayRows; r++) {
      for (let c = 0; c < displayCols; c++) {
        const value = renderDistribution[r]?.[c] || 0;
        const normalized = maxValue > 0 ? value / maxValue : 0;
        
        const x = padding + c * cellWidth;
        const y = padding + r * cellHeight;
        
        // Fill cell
        ctx.fillStyle = Config.getColor(normalized, settings.colorScale);
        ctx.fillRect(x, y, cellWidth, cellHeight);
        
        // Draw border (lighter for raw mode since cells are small)
        if (!isRawMode || cellWidth >= 6) {
          ctx.strokeStyle = 'rgba(0,0,0,0.05)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
        }
        
        // Store for hover (but use original distribution for accurate values)
        cells.push({
          x, y, width: cellWidth, height: cellHeight,
          row: r, col: c,
          count: grid[r]?.[c] || 0,
          distribution: distribution[r]?.[c] || 0,
          normalized,
        });
      }
    }
    
    instance.layout = {
      cells,
      rows: displayRows,
      cols: displayCols,
      cellWidth,
      cellHeight,
      padding,
      total,
      settings,
      isRawMode,
      isAbsolute: gridData.absolute || false,
      max_x: gridData.max_x,
      max_y: gridData.max_y,
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
    const { diffGrid, maxAbsDiff, gridA, gridB } = diffData;
    let { grid_cols, grid_rows } = diffData;
    
    if (!diffGrid || grid_rows === 0 || grid_cols === 0) return;
    
    const isRawMode = settings.resolution === 'raw';
    
    // Apply clipping for raw mode
    let displayCols = grid_cols;
    let displayRows = grid_rows;
    if (isRawMode) {
      displayCols = Math.min(grid_cols, settings.clipWidth || 80);
      displayRows = Math.min(grid_rows, settings.clipHeight || 100);
    }
    
    const targetWidth = 350;
    let cellWidth = settings.cellSize || 30;
    let cellHeight = cellWidth / PAGE_ASPECT_RATIO;
    
    if (isRawMode) {
      cellWidth = Math.max(3, targetWidth / displayCols);
      cellHeight = cellWidth / PAGE_ASPECT_RATIO;
    }
    
    const padding = 10;
    
    const width = displayCols * cellWidth + padding * 2;
    const height = displayRows * cellHeight + padding * 2;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    // Apply blur for raw mode (on clipped region)
    let renderDiffGrid = diffGrid;
    if (isRawMode) {
      const blurSize = settings.blurSize || 3;
      renderDiffGrid = applyBlur(diffGrid, displayRows, displayCols, blurSize);
    }
    
    // Find max abs diff after blur (only in displayed region)
    let maxVal = 0;
    for (let r = 0; r < displayRows; r++) {
      for (let c = 0; c < displayCols; c++) {
        const val = Math.abs(renderDiffGrid[r]?.[c] || 0);
        if (val > maxVal) maxVal = val;
      }
    }
    
    const cells = [];
    
    for (let r = 0; r < displayRows; r++) {
      for (let c = 0; c < displayCols; c++) {
        const diff = renderDiffGrid[r]?.[c] || 0;
        const normalizedDiff = maxVal > 0 ? diff / maxVal : 0;
        
        const x = padding + c * cellWidth;
        const y = padding + r * cellHeight;
        
        ctx.fillStyle = Config.getDiffColor(normalizedDiff);
        ctx.fillRect(x, y, cellWidth, cellHeight);
        
        if (!isRawMode || cellWidth >= 6) {
          ctx.strokeStyle = 'rgba(0,0,0,0.05)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cellWidth, cellHeight);
        }
        
        cells.push({
          x, y, width: cellWidth, height: cellHeight,
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
      rows: displayRows,
      cols: displayCols,
      cellWidth,
      cellHeight,
      padding,
      settings,
      isDiff: true,
      isRawMode,
      isAbsolute: diffData.gridA?.absolute || false,
      max_x: diffData.gridA?.max_x,
      max_y: diffData.gridA?.max_y,
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
    
    const { cells, settings, isRawMode, isAbsolute, max_x, max_y, cols, rows } = instance.layout;
    
    let hoverInfo = null;
    for (const cell of cells) {
      if (x >= cell.x && x < cell.x + cell.width &&
          y >= cell.y && y < cell.y + cell.height) {
        
        const regionLabel = Config.getRegionLabel(
          cell.col, cell.row,
          instance.layout.cols, instance.layout.rows
        );
        
        // Calculate approximate pixel position for raw mode
        let pixelX = null, pixelY = null;
        if (isRawMode && isAbsolute && max_x && max_y) {
          pixelX = Math.round((cell.col / cols) * max_x);
          pixelY = Math.round((cell.row / rows) * max_y);
        }
        
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
            isAbsolute,
            pixelX,
            pixelY,
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
            isAbsolute,
            pixelX,
            pixelY,
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
