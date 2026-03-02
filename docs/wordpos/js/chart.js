/**
 * Chart rendering module for Voynich word position visualizer.
 * Renders stacked bar charts showing position preferences.
 */

const Chart = (function() {
  const canvases = {};
  const contexts = {};
  let hoverCallback = null;
  let currentHoverInfo = null;
  
  // Store render data for hover detection and re-rendering
  const renderData = {};
  
  /**
   * Initialize a canvas for rendering.
   */
  function init(canvas, id = 'primary') {
    canvases[id] = canvas;
    contexts[id] = canvas.getContext('2d');
    
    // Set up mouse events
    canvas.addEventListener('mousemove', (e) => handleMouseMove(e, id));
    canvas.addEventListener('mouseleave', () => handleMouseLeave(id));
    
    // Handle resize - re-render if we have data
    const resizeObserver = new ResizeObserver(() => {
      if (renderData[id] && renderData[id].lastData) {
        if (renderData[id].isDiff) {
          renderDiff(renderData[id].lastData, renderData[id].lastSettings, id);
        } else {
          render(renderData[id].lastData, renderData[id].lastSettings, id);
        }
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
    
    // Skip if container has no size
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
   * Render position data as horizontal stacked bar chart.
   * Bars are horizontal with start-middle-end flowing left-to-right.
   * Characters are listed vertically, ordered by position preference.
   */
  function render(data, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    if (!resizeCanvas(id)) {
      requestAnimationFrame(() => render(data, settings, id));
      return;
    }
    
    renderData[id] = renderData[id] || {};
    renderData[id].lastData = data;
    renderData[id].lastSettings = settings;
    renderData[id].isDiff = false;
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const padding = { top: 20, right: 20, bottom: 20, left: 60 };
    
    ctx.clearRect(0, 0, width, height);
    
    // Use fixed order if provided (for comparison mode), otherwise sort
    let chars;
    if (settings.fixedOrder) {
      chars = settings.fixedOrder.filter(c => data.characters[c] && data.characters[c].total > 0);
    } else {
      const sortedChars = Config.sortCharactersBy(data.characters, settings.sortBy);
      chars = sortedChars.filter(c => data.characters[c] && data.characters[c].total > 0);
    }
    
    if (chars.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', width / 2, height / 2);
      return;
    }
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barHeight = Math.min(settings.barWidth || 20, (chartHeight - (chars.length - 1) * 4) / chars.length);
    const barGap = 4;
    const totalBarsHeight = chars.length * barHeight + (chars.length - 1) * barGap;
    const startY = padding.top + (chartHeight - totalBarsHeight) / 2;
    
    renderData[id].chars = chars;
    renderData[id].data = data;
    renderData[id].settings = settings;
    renderData[id].bars = [];
    renderData[id].startY = startY;
    renderData[id].barHeight = barHeight;
    renderData[id].barGap = barGap;
    renderData[id].padding = padding;
    renderData[id].chartWidth = chartWidth;
    renderData[id].isHorizontal = true;
    
    // Draw x-axis labels (0%, 50%, 100%)
    ctx.fillStyle = '#666';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const xLabels = [0, 0.25, 0.5, 0.75, 1];
    for (const x of xLabels) {
      const xPos = padding.left + chartWidth * x;
      ctx.fillText(`${Math.round(x * 100)}%`, xPos, height - padding.bottom + 4);
      
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPos, padding.top);
      ctx.lineTo(xPos, height - padding.bottom);
      ctx.stroke();
    }
    
    const positions = settings.showOnly ? ['start', 'middle', 'end', 'only'] : ['start', 'middle', 'end'];
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const charData = data.characters[char];
      const y = startY + i * (barHeight + barGap);
      let xOffset = 0;
      
      const barInfo = {
        char,
        y,
        height: barHeight,
        segments: [],
      };
      
      for (const pos of positions) {
        const ratio = charData.ratios[pos] || 0;
        const segmentWidth = ratio * chartWidth;
        const x = padding.left + xOffset;
        
        ctx.fillStyle = Config.POSITION_COLORS[pos];
        ctx.fillRect(x, y, segmentWidth, barHeight);
        
        barInfo.segments.push({
          position: pos,
          x,
          width: segmentWidth,
          ratio,
          count: charData[pos] || 0,
        });
        
        xOffset += segmentWidth;
      }
      
      renderData[id].bars.push(barInfo);
      
      // Draw character label on left
      const label = Config.getCharDisplay(char, settings.useVoynichFont);
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '14px Voynich' : '12px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, padding.left - 8, y + barHeight / 2);
    }
  }
  
  /**
   * Render diff mode chart with horizontal layout.
   * Shows difference bars for each position, stacked horizontally per character.
   */
  function renderDiff(diffData, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    if (!resizeCanvas(id)) {
      requestAnimationFrame(() => renderDiff(diffData, settings, id));
      return;
    }
    
    renderData[id] = renderData[id] || {};
    renderData[id].lastData = diffData;
    renderData[id].lastSettings = settings;
    renderData[id].isDiff = true;
    renderData[id].bars = [];
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const padding = { top: 20, right: 20, bottom: 20, left: 60 };
    
    ctx.clearRect(0, 0, width, height);
    
    const chars = diffData.charset.filter(c => {
      const charDiff = diffData.characters[c];
      return charDiff && (charDiff.totalA > 0 || charDiff.totalB > 0);
    });
    
    // Sort by position preference (start - end) using A dataset ratios
    chars.sort((a, b) => {
      const aRatios = diffData.characters[a].ratiosA;
      const bRatios = diffData.characters[b].ratiosA;
      const aDiff = (aRatios.start || 0) - (aRatios.end || 0);
      const bDiff = (bRatios.start || 0) - (bRatios.end || 0);
      return bDiff - aDiff;
    });
    
    if (chars.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', width / 2, height / 2);
      return;
    }
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barHeight = Math.min(settings.barWidth || 20, (chartHeight - (chars.length - 1) * 4) / chars.length);
    const barGap = 4;
    const totalBarsHeight = chars.length * barHeight + (chars.length - 1) * barGap;
    const startY = padding.top + (chartHeight - totalBarsHeight) / 2;
    
    renderData[id].chars = chars;
    renderData[id].data = diffData;
    renderData[id].settings = settings;
    renderData[id].startY = startY;
    renderData[id].barHeight = barHeight;
    renderData[id].barGap = barGap;
    renderData[id].padding = padding;
    renderData[id].chartWidth = chartWidth;
    renderData[id].isHorizontal = true;
    
    // Draw center line (50% / 0% diff)
    const centerX = padding.left + chartWidth / 2;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, padding.top);
    ctx.lineTo(centerX, height - padding.bottom);
    ctx.stroke();
    
    // X-axis labels for diff mode
    ctx.fillStyle = '#666';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const diffLabels = [-0.5, -0.25, 0, 0.25, 0.5];
    for (const val of diffLabels) {
      const xPos = centerX + val * chartWidth;
      const labelText = val === 0 ? '0%' : (val > 0 ? `+${Math.round(val * 100)}%` : `${Math.round(val * 100)}%`);
      ctx.fillText(labelText, xPos, height - padding.bottom + 4);
      
      if (val !== 0) {
        ctx.strokeStyle = '#eee';
        ctx.beginPath();
        ctx.moveTo(xPos, padding.top);
        ctx.lineTo(xPos, height - padding.bottom);
        ctx.stroke();
      }
    }
    
    const positions = settings.showOnly ? ['start', 'middle', 'end', 'only'] : ['start', 'middle', 'end'];
    const posCount = positions.length;
    const subBarHeight = barHeight / posCount;
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const charDiff = diffData.characters[char];
      const y = startY + i * (barHeight + barGap);
      
      const barInfo = {
        char,
        y,
        height: barHeight,
        segments: [],
      };
      
      for (let j = 0; j < positions.length; j++) {
        const pos = positions[j];
        const diff = charDiff.diff[pos] || 0;
        const barY = y + j * subBarHeight;
        const barW = Math.abs(diff) * chartWidth;
        const barX = diff >= 0 ? centerX : centerX - barW;
        
        ctx.fillStyle = diff >= 0 ? Config.DIFF_COLORS.positive : Config.DIFF_COLORS.negative;
        if (Math.abs(diff) < 0.001) {
          ctx.fillStyle = Config.DIFF_COLORS.neutral;
        }
        ctx.fillRect(barX, barY, barW, subBarHeight - 1);
        
        barInfo.segments.push({
          position: pos,
          x: barX,
          y: barY,
          width: barW,
          height: subBarHeight - 1,
          diff,
          ratioA: charDiff.ratiosA[pos] || 0,
          ratioB: charDiff.ratiosB[pos] || 0,
        });
      }
      
      renderData[id].bars.push(barInfo);
      
      // Draw character label on left
      const label = Config.getCharDisplay(char, settings.useVoynichFont);
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '14px Voynich' : '12px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, padding.left - 8, y + barHeight / 2);
    }
  }
  
  /**
   * Handle mouse move for hover detection.
   */
  function handleMouseMove(e, id) {
    const canvas = canvases[id];
    const data = renderData[id];
    if (!canvas || !data) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    let hoverInfo = null;
    
    for (const bar of data.bars) {
      // Horizontal layout: check y range for the bar row
      const inYRange = y >= bar.y && y <= bar.y + bar.height;
      if (inYRange) {
        const charData = data.data.characters[bar.char];
        hoverInfo = {
          char: bar.char,
          charDisplay: Config.getCharDisplay(bar.char, data.settings.useVoynichFont),
        };
        
        if (data.isDiff) {
          hoverInfo.isDiff = true;
          hoverInfo.diff = charData.diff;
          hoverInfo.ratiosA = charData.ratiosA;
          hoverInfo.ratiosB = charData.ratiosB;
          hoverInfo.totalA = charData.totalA;
          hoverInfo.totalB = charData.totalB;
        } else {
          hoverInfo.ratios = charData.ratios;
          hoverInfo.counts = {
            start: charData.start,
            middle: charData.middle,
            end: charData.end,
            only: charData.only,
          };
          hoverInfo.total = charData.total;
        }
        break;
      }
    }
    
    if (hoverCallback && (hoverInfo !== currentHoverInfo)) {
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
    renderDiff,
    setHoverCallback,
  };
})();
