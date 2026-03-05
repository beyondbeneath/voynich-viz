/**
 * Heatmap rendering module for Voynich character position visualizer.
 * Renders characters in rows with position heatmap bands to the right.
 */

const Heatmap = (function() {
  const canvases = {};
  const contexts = {};
  let hoverCallback = null;
  let currentHoverInfo = null;
  
  const renderData = {};
  
  /**
   * Initialize a canvas for rendering.
   */
  function init(canvas, id = 'primary') {
    canvases[id] = canvas;
    contexts[id] = canvas.getContext('2d');
    
    canvas.addEventListener('mousemove', (e) => handleMouseMove(e, id));
    canvas.addEventListener('mouseleave', () => handleMouseLeave(id));
    
    const resizeObserver = new ResizeObserver(() => {
      if (renderData[id] && renderData[id].lastData) {
        render(renderData[id].lastData, renderData[id].lastSettings, id);
      }
    });
    resizeObserver.observe(canvas.parentElement);
  }
  
  /**
   * Resize canvas to match container.
   */
  function resizeCanvas(id) {
    const canvas = canvases[id];
    if (!canvas) return false;
    
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    if (rect.width < 10 || rect.height < 10) return false;
    
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    contexts[id].setTransform(1, 0, 0, 1, 0, 0);
    contexts[id].scale(dpr, dpr);
    return true;
  }
  
  /**
   * Render the heatmap visualization.
   * Each character gets a row with label on left and heatmap bands to the right.
   */
  function render(data, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    renderData[id] = renderData[id] || {};
    renderData[id].lastData = data;
    renderData[id].lastSettings = settings;
    
    // Get sorted character list
    let chars;
    if (settings.fixedOrder) {
      // In compare mode, keep ALL characters from fixedOrder to maintain alignment
      chars = settings.fixedOrder;
    } else {
      chars = Config.sortCharactersBy(data.characters, settings.sortBy, settings.positionMode);
      chars = chars.filter(c => data.characters[c] && data.characters[c].total > 0);
    }
    
    // Filter by enabled glyphs if specified
    if (settings.enabledGlyphs) {
      chars = chars.filter(c => settings.enabledGlyphs.has(c));
    }
    
    if (chars.length === 0) {
      resizeCanvas(id);
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', width / 2, height / 2);
      return;
    }
    
    const maxLength = settings.positionMode === 'word' 
      ? (data.max_word_length || 9)
      : (data.max_line_length || 12);
    const dataKey = settings.positionMode === 'word' ? 'word_position' : 'line_position';
    
    // Fixed dimensions for nice box appearance
    const labelWidth = 50;  // Width for character label area
    const heatmapWidth = 280;  // Fixed width for the heatmap
    const boxWidth = labelWidth + heatmapWidth;  // Total box width
    const rowGap = 12;  // Gap between character rows
    const bandHeight = 8;  // Fixed height per band (no gaps between bands)
    
    // Calculate total row height based on number of bands (no gaps)
    const rowHeight = maxLength * bandHeight;
    
    // Calculate required canvas dimensions
    const contentHeight = chars.length * rowHeight + (chars.length - 1) * rowGap;
    const contentWidth = boxWidth;
    
    // Get container width for centering
    const container = canvas.parentElement;
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width || 400;
    
    const padding = { 
      top: 20, 
      right: 20, 
      bottom: 20, 
      left: Math.max(20, (containerWidth - contentWidth) / 2)  // Center horizontally
    };
    
    const totalHeight = padding.top + padding.bottom + contentHeight;
    const totalWidth = containerWidth;
    
    // Resize canvas to fit content
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = totalWidth + 'px';
    canvas.style.height = totalHeight + 'px';
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, totalHeight);
    
    renderData[id].chars = chars;
    renderData[id].charRows = [];
    renderData[id].padding = padding;
    renderData[id].rowHeight = rowHeight;
    renderData[id].rowGap = rowGap;
    renderData[id].bandHeight = bandHeight;
    renderData[id].heatmapWidth = heatmapWidth;
    renderData[id].labelWidth = labelWidth;
    renderData[id].boxWidth = boxWidth;
    renderData[id].dataKey = dataKey;
    renderData[id].maxLength = maxLength;
    
    // Draw each character row
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const charData = data.characters[char] || { total: 0 };
      const hasData = charData.total > 0;
      const posData = charData[dataKey] || {};
      const ratios = posData.ratios || {};
      
      const y = padding.top + i * (rowHeight + rowGap);
      const boxX = padding.left;
      
      // Store row info for hover detection
      const rowInfo = {
        char,
        x: boxX,
        y,
        height: rowHeight,
        bands: [],
      };
      
      // Draw label background first
      ctx.fillStyle = hasData ? '#f8f9fa' : '#f0f0f0';
      ctx.fillRect(boxX, y, labelWidth, rowHeight);
      
      // Draw bands (1 to maxLength) stacked vertically within this row
      const heatmapX = boxX + labelWidth;
      let bandY = y;
      
      if (hasData) {
        for (let length = 1; length <= maxLength; length++) {
          const bandRatios = ratios[length] || new Array(length).fill(0);
          const cellWidth = heatmapWidth / length;
          
          const bandInfo = {
            length,
            y: bandY,
            height: bandHeight,
            cells: [],
          };
          
          // Draw cells for this band (no gaps)
          for (let pos = 0; pos < length; pos++) {
            const ratio = bandRatios[pos] || 0;
            const cellX = heatmapX + pos * cellWidth;
            
            // Apply scaling for visualization
            const scaledRatio = Config.applyScaling(ratio, settings.scaling || 'linear');
            
            // Draw cell (fill entire space, no gaps)
            ctx.fillStyle = Config.getHeatmapColor(scaledRatio);
            ctx.fillRect(cellX, bandY, cellWidth, bandHeight);
            
            bandInfo.cells.push({
              x: cellX,
              width: cellWidth,
              position: pos + 1,
              ratio,
            });
          }
          
          rowInfo.bands.push(bandInfo);
          bandY += bandHeight;
        }
      } else {
        // No data - draw empty/grayed out heatmap area
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(heatmapX, y, heatmapWidth, rowHeight);
        
        // Draw "No data" text
        ctx.fillStyle = '#999';
        ctx.font = '11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No data', heatmapX + heatmapWidth / 2, y + rowHeight / 2);
      }
      
      // Draw black border around the entire box (after fills so it's on top)
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX + 0.5, y + 0.5, boxWidth - 1, rowHeight - 1);
      
      // Draw character label (after border so text is on top)
      const label = Config.getCharDisplay(char, settings.useVoynichFont);
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '18px Voynich' : '16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, boxX + labelWidth / 2, y + rowHeight / 2);
      
      renderData[id].charRows.push(rowInfo);
    }
  }
  
  /**
   * Handle mouse move for hover detection.
   */
  function handleMouseMove(e, id) {
    const canvas = canvases[id];
    const data = renderData[id];
    if (!canvas || !data || !data.charRows) return;
    
    const rect = canvas.getBoundingClientRect();
    // Account for canvas scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const dpr = window.devicePixelRatio || 1;
    const x = (e.clientX - rect.left) * scaleX / dpr;
    const y = (e.clientY - rect.top) * scaleY / dpr;
    
    let hoverInfo = null;
    
    // Find which row (character) we're hovering over
    for (const row of data.charRows) {
      if (y >= row.y && y < row.y + row.height && x >= row.x && x < row.x + data.boxWidth) {
        // Check if hovering over label area
        if (x < row.x + data.labelWidth) {
          const charData = data.lastData.characters[row.char] || { total: 0 };
          hoverInfo = {
            char: row.char,
            charDisplay: Config.getCharDisplay(row.char, data.lastSettings.useVoynichFont),
            total: charData.total,
            isLabel: true,
            positionMode: data.lastSettings.positionMode,
            hasData: charData.total > 0,
          };
          break;
        }
        
        // Find which band and cell in heatmap area
        const charData = data.lastData.characters[row.char] || { total: 0 };
        
        // If no data for this character, show simple hover info
        if (charData.total === 0) {
          hoverInfo = {
            char: row.char,
            charDisplay: Config.getCharDisplay(row.char, data.lastSettings.useVoynichFont),
            total: 0,
            isLabel: true,
            positionMode: data.lastSettings.positionMode,
            hasData: false,
          };
          break;
        }
        
        for (const band of row.bands) {
          if (y >= band.y && y < band.y + data.bandHeight) {
            // Find which cell in this band
            for (const cell of band.cells) {
              if (x >= cell.x && x < cell.x + cell.width) {
                hoverInfo = {
                  char: row.char,
                  charDisplay: Config.getCharDisplay(row.char, data.lastSettings.useVoynichFont),
                  total: charData.total,
                  wordLength: band.length,
                  position: cell.position,
                  ratio: cell.ratio,
                  positionMode: data.lastSettings.positionMode,
                  allRatios: charData[data.dataKey]?.ratios[band.length] || [],
                };
                break;
              }
            }
            break;
          }
        }
        break;
      }
    }
    
    if (hoverCallback && JSON.stringify(hoverInfo) !== JSON.stringify(currentHoverInfo)) {
      currentHoverInfo = hoverInfo;
      hoverCallback(hoverInfo);
    }
  }
  
  /**
   * Handle mouse leave.
   */
  function handleMouseLeave(id) {
    currentHoverInfo = null;
    if (hoverCallback) {
      hoverCallback(null);
    }
  }
  
  /**
   * Set hover callback.
   */
  function setHoverCallback(callback) {
    hoverCallback = callback;
  }
  
  return {
    init,
    render,
    setHoverCallback,
  };
})();
