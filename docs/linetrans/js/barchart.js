/**
 * Bar chart rendering module for Voynich line transition visualizer.
 * Shows top N transitions as a horizontal bar chart.
 */

const BarChart = (function() {
  let canvas = null;
  let ctx = null;
  let currentData = null;
  let currentSettings = null;
  
  const barHeight = 18;
  const barGap = 3;
  const labelWidth = 60;
  const valueWidth = 70;
  const chartPadding = 10;
  
  /**
   * Initialize the bar chart with a canvas element.
   */
  function init(canvasEl) {
    if (!canvasEl) return;
    
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
  }
  
  /**
   * Render the bar chart with top transitions.
   */
  function render(data, settings) {
    if (!canvas || !ctx) {
      console.error('BarChart not initialized');
      return;
    }
    
    currentData = data;
    currentSettings = settings;
    
    const topTransitions = data.top_transitions || [];
    const numBars = Math.min(topTransitions.length, 10);
    
    if (numBars === 0) {
      canvas.width = 250;
      canvas.height = 40;
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No transition data', 125, 25);
      return;
    }
    
    const maxCount = topTransitions[0]?.count || 1;
    
    const width = canvas.parentElement?.clientWidth || 250;
    const chartWidth = Math.max(40, width - labelWidth - valueWidth - chartPadding * 2);
    const height = numBars * (barHeight + barGap) + chartPadding * 2;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    const useVoynich = settings.useVoynichFont;
    
    for (let i = 0; i < numBars; i++) {
      const t = topTransitions[i];
      const y = chartPadding + i * (barHeight + barGap);
      
      // Draw label (from -> to)
      const fromDisplay = Config.getCharDisplay(t.from, useVoynich, true);
      const toDisplay = Config.getCharDisplay(t.to, useVoynich, true);
      
      const fontFamily = useVoynich ? 'Voynich, monospace' : 'sans-serif';
      ctx.font = `12px ${fontFamily}`;
      ctx.fillStyle = '#333';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      
      const labelText = `${fromDisplay}→${toDisplay}`;
      ctx.fillText(labelText, labelWidth - 4, y + barHeight / 2);
      
      // Draw bar
      const barWidth = Math.max(2, (t.count / maxCount) * chartWidth);
      const barX = labelWidth;
      
      ctx.fillStyle = 'rgb(74, 144, 217)';
      ctx.fillRect(barX, y, barWidth, barHeight);
      
      // Draw value
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      const valueText = `${t.count} (${(t.probability * 100).toFixed(1)}%)`;
      ctx.fillText(valueText, barX + barWidth + 4, y + barHeight / 2);
    }
  }
  
  /**
   * Render comparison bar charts (for compare mode).
   */
  function renderCompare(dataA, dataB, settings) {
    if (!canvas || !ctx) {
      console.error('BarChart not initialized');
      return;
    }
    
    currentSettings = settings;
    
    const topA = (dataA.top_transitions || []).slice(0, 5);
    const topB = (dataB.top_transitions || []).slice(0, 5);
    
    const numBars = 5;
    const sectionHeight = numBars * (barHeight + barGap) + chartPadding + 20;
    
    const width = canvas.parentElement?.clientWidth || 250;
    const chartWidth = Math.max(40, width - labelWidth - valueWidth - chartPadding * 2);
    const height = sectionHeight * 2 + 10;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    // Draw section A header
    ctx.fillStyle = 'rgb(74, 144, 217)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('A', chartPadding, 12);
    
    const maxCountA = topA[0]?.count || 1;
    renderBars(topA, maxCountA, 20, chartWidth, settings);
    
    // Draw section B header
    const sectionBY = sectionHeight;
    ctx.fillStyle = 'rgb(74, 144, 217)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('B', chartPadding, sectionBY + 12);
    
    const maxCountB = topB[0]?.count || 1;
    renderBars(topB, maxCountB, sectionBY + 20, chartWidth, settings);
  }
  
  /**
   * Helper to render bars.
   */
  function renderBars(transitions, maxCount, offsetY, chartWidth, settings) {
    const useVoynich = settings.useVoynichFont;
    
    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i];
      const y = offsetY + i * (barHeight + barGap);
      
      const fromDisplay = Config.getCharDisplay(t.from, useVoynich, true);
      const toDisplay = Config.getCharDisplay(t.to, useVoynich, true);
      
      const fontFamily = useVoynich ? 'Voynich, monospace' : 'sans-serif';
      ctx.font = `12px ${fontFamily}`;
      ctx.fillStyle = '#333';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      
      const labelText = `${fromDisplay}→${toDisplay}`;
      ctx.fillText(labelText, labelWidth - 4, y + barHeight / 2);
      
      const barWidth = Math.max(2, (t.count / maxCount) * chartWidth);
      const barX = labelWidth;
      
      ctx.fillStyle = 'rgb(74, 144, 217)';
      ctx.fillRect(barX, y, barWidth, barHeight);
      
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      const valueText = `${t.count} (${(t.probability * 100).toFixed(1)}%)`;
      ctx.fillText(valueText, barX + barWidth + 4, y + barHeight / 2);
    }
  }
  
  /**
   * Clear the bar chart.
   */
  function clear() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  return {
    init,
    render,
    renderCompare,
    clear,
  };
})();
