/**
 * Heatmap rendering module for Voynich n-gram visualizer.
 */

const Heatmap = (function() {
  const canvases = {};
  const contexts = {};
  let hoverCallback = null;
  
  // Store render data for hover detection
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
      if (renderData[id]?.lastData) {
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
   * Main render function - dispatches based on ngramType.
   */
  function render(data, settings, id = 'primary') {
    const ngramType = settings.ngramType || 'bigram';
    
    if (ngramType === 'bigram') {
      renderBigramHeatmap(data, settings, id);
    } else if (ngramType === 'unigram') {
      renderUnigramBars(data, settings, id);
    } else if (ngramType === 'trigram') {
      renderTrigramBars(data, settings, id);
    }
  }
  
  /**
   * Render bigram heatmap.
   */
  function renderBigramHeatmap(data, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    // Store for hover detection
    renderData[id] = {
      lastData: data,
      lastSettings: settings,
      cells: [],
      isDiff: false,
      type: 'bigram',
    };
    
    const matrix = data.bigram_matrix;
    if (!matrix || !matrix.charset) {
      if (!resizeCanvas(id)) {
        requestAnimationFrame(() => renderBigramHeatmap(data, settings, id));
        return;
      }
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', w / 2, h / 2);
      return;
    }
    
    const charset = Config.sortCharacters(matrix.charset);
    const cellSize = settings.cellSize || 28;
    const labelSize = settings.labelSize || 14;
    
    // Calculate fixed dimensions based on data (like markov)
    const startX = labelSize + 10;
    const startY = labelSize + 10;
    const width = startX + charset.length * cellSize + 20;
    const height = startY + charset.length * cellSize + 20;
    
    // Set canvas size (not stretched to container)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    // Clear and fill background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    const colorScale = settings.colorScale || 'viridis';
    
    // Find max value for normalization
    let maxValue = 0;
    const useFreq = settings.displayMode === 'frequencies';
    const source = useFreq ? matrix.frequencies : matrix.counts;
    
    for (const first of charset) {
      for (const second of charset) {
        const val = source?.[first]?.[second] || 0;
        if (val > maxValue) maxValue = val;
      }
    }
    
    // Draw cells
    for (let i = 0; i < charset.length; i++) {
      for (let j = 0; j < charset.length; j++) {
        const first = charset[i];
        const second = charset[j];
        const value = source?.[first]?.[second] || 0;
        
        const x = startX + j * cellSize;
        const y = startY + i * cellSize;
        
        // Normalize value
        let normalized = maxValue > 0 ? value / maxValue : 0;
        if (settings.useLogScale && maxValue > 0) {
          normalized = Config.logScale(value, maxValue);
        }
        
        // Draw cell
        ctx.fillStyle = Config.getColor(normalized, colorScale);
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
        
        // Store for hover
        renderData[id].cells.push({
          x, y, width: cellSize - 1, height: cellSize - 1,
          first, second,
          ngram: first + second,
          value,
          frequency: matrix.frequencies?.[first]?.[second] || 0,
          count: matrix.counts?.[first]?.[second] || 0,
        });
      }
    }
    
    // Draw row labels (first char)
    ctx.fillStyle = '#333';
    ctx.font = settings.useVoynichFont ? `${labelSize}px Voynich` : `${labelSize - 2}px system-ui`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < charset.length; i++) {
      const label = Config.getCharDisplay(charset[i], settings.useVoynichFont);
      ctx.fillText(label, startX - 4, startY + i * cellSize + cellSize / 2);
    }
    
    // Draw column labels (second char)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    for (let j = 0; j < charset.length; j++) {
      const label = Config.getCharDisplay(charset[j], settings.useVoynichFont);
      ctx.fillText(label, startX + j * cellSize + cellSize / 2, startY - 4);
    }
  }
  
  /**
   * Render unigram bar chart.
   */
  function renderUnigramBars(data, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    if (!resizeCanvas(id)) {
      requestAnimationFrame(() => renderUnigramBars(data, settings, id));
      return;
    }
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const padding = settings.chartPadding || Config.DEFAULTS.chartPadding;
    
    ctx.clearRect(0, 0, width, height);
    
    renderData[id] = {
      lastData: data,
      lastSettings: settings,
      cells: [],
      isDiff: false,
      type: 'unigram',
    };
    
    const unigrams = data.unigrams;
    if (!unigrams || !unigrams.counts) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No unigram data available', width / 2, height / 2);
      return;
    }
    
    // Sort by frequency
    const useFreq = settings.displayMode === 'frequencies';
    const source = useFreq ? unigrams.frequencies : unigrams.counts;
    const sorted = Object.entries(source).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length === 0) return;
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barWidth = Math.min(settings.barWidth || 30, (chartWidth - (sorted.length - 1) * (settings.barGap || 4)) / sorted.length);
    const barGap = settings.barGap || 4;
    const maxValue = sorted[0][1];
    const colorScale = settings.colorScale || 'viridis';
    
    // Draw y-axis
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();
    
    // Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const val = (maxValue * i) / ySteps;
      const yPos = padding.top + chartHeight * (1 - i / ySteps);
      const label = useFreq ? `${(val * 100).toFixed(1)}%` : Math.round(val).toLocaleString();
      ctx.fillText(label, padding.left - 8, yPos);
      
      ctx.strokeStyle = '#eee';
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
    }
    
    // Draw bars
    const totalBarsWidth = sorted.length * barWidth + (sorted.length - 1) * barGap;
    const startX = padding.left + (chartWidth - totalBarsWidth) / 2;
    
    for (let i = 0; i < sorted.length; i++) {
      const [char, value] = sorted[i];
      const x = startX + i * (barWidth + barGap);
      
      let normalized = maxValue > 0 ? value / maxValue : 0;
      if (settings.useLogScale && maxValue > 0) {
        normalized = Config.logScale(value, maxValue);
      }
      
      const barHeight = normalized * chartHeight;
      const y = padding.top + chartHeight - barHeight;
      
      ctx.fillStyle = Config.getColor(normalized, colorScale);
      ctx.fillRect(x, y, barWidth, barHeight);
      
      renderData[id].cells.push({
        x, y, width: barWidth, height: barHeight,
        ngram: char,
        value,
        frequency: unigrams.frequencies[char] || 0,
        count: unigrams.counts[char] || 0,
      });
      
      // Character label
      const label = Config.getCharDisplay(char, settings.useVoynichFont);
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '14px Voynich' : '12px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + barWidth / 2, height - padding.bottom + 8);
    }
  }
  
  /**
   * Render trigram bar chart (top N).
   */
  function renderTrigramBars(data, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    if (!resizeCanvas(id)) {
      requestAnimationFrame(() => renderTrigramBars(data, settings, id));
      return;
    }
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const padding = { top: 40, right: 20, bottom: 20, left: 80 };
    
    ctx.clearRect(0, 0, width, height);
    
    renderData[id] = {
      lastData: data,
      lastSettings: settings,
      cells: [],
      isDiff: false,
      type: 'trigram',
    };
    
    const trigrams = data.trigrams;
    if (!trigrams || !trigrams.counts) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No trigram data available', width / 2, height / 2);
      return;
    }
    
    // Sort by frequency and take top 30
    const useFreq = settings.displayMode === 'frequencies';
    const source = useFreq ? trigrams.frequencies : trigrams.counts;
    const sorted = Object.entries(source).sort((a, b) => b[1] - a[1]).slice(0, 30);
    
    if (sorted.length === 0) return;
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barHeight = Math.min(20, (chartHeight - (sorted.length - 1) * 2) / sorted.length);
    const barGap = 2;
    const maxValue = sorted[0][1];
    const colorScale = settings.colorScale || 'viridis';
    
    // Draw horizontal bars
    for (let i = 0; i < sorted.length; i++) {
      const [trigram, value] = sorted[i];
      const y = padding.top + i * (barHeight + barGap);
      
      let normalized = maxValue > 0 ? value / maxValue : 0;
      if (settings.useLogScale && maxValue > 0) {
        normalized = Config.logScale(value, maxValue);
      }
      
      const barW = normalized * chartWidth;
      const x = padding.left;
      
      ctx.fillStyle = Config.getColor(normalized, colorScale);
      ctx.fillRect(x, y, barW, barHeight);
      
      renderData[id].cells.push({
        x, y, width: barW, height: barHeight,
        ngram: trigram,
        value,
        frequency: trigrams.frequencies[trigram] || 0,
        count: trigrams.counts[trigram] || 0,
      });
      
      // Trigram label
      const label = Config.getNgramDisplay(trigram, settings.useVoynichFont);
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '12px Voynich' : '11px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, padding.left - 8, y + barHeight / 2);
      
      // Value label
      const valueLabel = useFreq ? `${(value * 100).toFixed(2)}%` : value.toLocaleString();
      ctx.fillStyle = '#666';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(valueLabel, x + barW + 4, y + barHeight / 2);
    }
  }
  
  /**
   * Main diff render - dispatches based on ngramType.
   */
  function renderDiff(diffData, settings, id = 'primary') {
    const ngramType = settings.ngramType || 'bigram';
    
    if (ngramType === 'bigram') {
      renderBigramDiff(diffData, settings, id);
    } else if (ngramType === 'unigram') {
      renderUnigramDiff(diffData, settings, id);
    } else if (ngramType === 'trigram') {
      renderTrigramDiff(diffData, settings, id);
    }
  }
  
  /**
   * Render bigram diff heatmap.
   */
  function renderBigramDiff(diffData, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    renderData[id] = {
      lastData: diffData,
      lastSettings: settings,
      cells: [],
      isDiff: true,
      type: 'bigram',
    };
    
    const matrix = diffData.bigram_matrix;
    if (!matrix || !matrix.charset) {
      if (!resizeCanvas(id)) {
        requestAnimationFrame(() => renderBigramDiff(diffData, settings, id));
        return;
      }
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', w / 2, h / 2);
      return;
    }
    
    const charset = matrix.charset;
    const cellSize = settings.cellSize || 28;
    const labelSize = settings.labelSize || 14;
    
    const startX = labelSize + 10;
    const startY = labelSize + 10;
    
    // Calculate fixed dimensions based on data (like markov)
    const width = startX + charset.length * cellSize + 20;
    const height = startY + charset.length * cellSize + 20;
    
    // Set canvas size (not stretched to container)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    // Clear and fill background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    // Find max absolute diff for normalization
    const maxAbsDiff = diffData.maxAbsDiff || 0.01;
    
    // Draw cells
    for (let i = 0; i < charset.length; i++) {
      for (let j = 0; j < charset.length; j++) {
        const first = charset[i];
        const second = charset[j];
        const diff = matrix.diffs?.[first]?.[second] || 0;
        
        const x = startX + j * cellSize;
        const y = startY + i * cellSize;
        
        // Normalize diff to -1 to 1 range
        const normalized = diff / maxAbsDiff;
        
        ctx.fillStyle = Config.getDiffColor(normalized);
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
        
        renderData[id].cells.push({
          x, y, width: cellSize - 1, height: cellSize - 1,
          first, second,
          ngram: first + second,
          diff,
          freqA: matrix.freqA?.[first]?.[second] || 0,
          freqB: matrix.freqB?.[first]?.[second] || 0,
        });
      }
    }
    
    // Draw labels
    ctx.fillStyle = '#333';
    ctx.font = settings.useVoynichFont ? `${labelSize}px Voynich` : `${labelSize - 2}px system-ui`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < charset.length; i++) {
      const label = Config.getCharDisplay(charset[i], settings.useVoynichFont);
      ctx.fillText(label, startX - 4, startY + i * cellSize + cellSize / 2);
    }
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    for (let j = 0; j < charset.length; j++) {
      const label = Config.getCharDisplay(charset[j], settings.useVoynichFont);
      ctx.fillText(label, startX + j * cellSize + cellSize / 2, startY - 4);
    }
  }
  
  /**
   * Render unigram diff bar chart.
   */
  function renderUnigramDiff(diffData, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    if (!resizeCanvas(id)) {
      requestAnimationFrame(() => renderUnigramDiff(diffData, settings, id));
      return;
    }
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const padding = settings.chartPadding || Config.DEFAULTS.chartPadding;
    
    ctx.clearRect(0, 0, width, height);
    
    renderData[id] = {
      lastData: diffData,
      lastSettings: settings,
      cells: [],
      isDiff: true,
      type: 'unigram',
    };
    
    const unigrams = diffData.unigrams;
    if (!unigrams || !unigrams.diffs) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No unigram diff data available', width / 2, height / 2);
      return;
    }
    
    const sorted = Object.entries(unigrams.diffs)
      .filter(([, d]) => Math.abs(d) > 0.0001)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    
    if (sorted.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No significant differences', width / 2, height / 2);
      return;
    }
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barWidth = Math.min(settings.barWidth || 30, (chartWidth - (sorted.length - 1) * (settings.barGap || 4)) / sorted.length);
    const barGap = settings.barGap || 4;
    const maxAbsDiff = unigrams.maxAbsDiff || 0.01;
    const centerY = padding.top + chartHeight / 2;
    const halfChartHeight = chartHeight / 2;
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, centerY);
    ctx.lineTo(width - padding.right, centerY);
    ctx.stroke();
    
    ctx.fillStyle = '#666';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    // Axis scale matches data: -maxAbsDiff to +maxAbsDiff (same units as diff details)
    const diffLabelValues = [-1, -0.5, 0, 0.5, 1];
    for (const val of diffLabelValues) {
      const yPos = centerY - val * halfChartHeight;
      const pct = val * maxAbsDiff * 100;
      const labelText = val === 0 ? '0' : (pct > 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`);
      ctx.fillText(labelText, padding.left - 8, yPos);
    }
    
    const totalBarsWidth = sorted.length * barWidth + (sorted.length - 1) * barGap;
    const startX = padding.left + (chartWidth - totalBarsWidth) / 2;
    
    for (let i = 0; i < sorted.length; i++) {
      const [char, diff] = sorted[i];
      const x = startX + i * (barWidth + barGap);
      const normalized = diff / maxAbsDiff;
      const barHeight = Math.min(Math.abs(normalized), 1) * (chartHeight / 2);
      const barY = diff >= 0 ? centerY - barHeight : centerY;
      
      ctx.fillStyle = Math.abs(diff) < 0.0001 ? '#6c757d' : (diff >= 0 ? Config.getDiffColor(0.8) : Config.getDiffColor(-0.8));
      ctx.fillRect(x, barY, barWidth, barHeight);
      
      renderData[id].cells.push({
        x, y: barY, width: barWidth, height: barHeight,
        ngram: char,
        diff,
        freqA: unigrams.freqA[char] || 0,
        freqB: unigrams.freqB[char] || 0,
      });
      
      const label = Config.getCharDisplay(char, settings.useVoynichFont);
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '14px Voynich' : '12px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + barWidth / 2, height - padding.bottom + 8);
    }
  }
  
  /**
   * Render trigram diff bar chart.
   */
  function renderTrigramDiff(diffData, settings, id = 'primary') {
    const canvas = canvases[id];
    const ctx = contexts[id];
    if (!canvas || !ctx) return;
    
    if (!resizeCanvas(id)) {
      requestAnimationFrame(() => renderTrigramDiff(diffData, settings, id));
      return;
    }
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const padding = { top: 40, right: 20, bottom: 20, left: 80 };
    
    ctx.clearRect(0, 0, width, height);
    
    renderData[id] = {
      lastData: diffData,
      lastSettings: settings,
      cells: [],
      isDiff: true,
      type: 'trigram',
    };
    
    const trigrams = diffData.trigrams;
    if (!trigrams || !trigrams.diffs) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No trigram diff data available', width / 2, height / 2);
      return;
    }
    
    const sorted = Object.entries(trigrams.diffs)
      .filter(([, d]) => Math.abs(d) > 0.00001)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 30);
    
    if (sorted.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No significant differences', width / 2, height / 2);
      return;
    }
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barHeight = Math.min(20, (chartHeight - (sorted.length - 1) * 2) / sorted.length);
    const barGap = 2;
    const maxAbsDiff = trigrams.maxAbsDiff || 0.01;
    const centerX = padding.left + chartWidth / 2;
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, padding.top);
    ctx.lineTo(centerX, height - padding.bottom);
    ctx.stroke();
    
    for (let i = 0; i < sorted.length; i++) {
      const [trigram, diff] = sorted[i];
      const y = padding.top + i * (barHeight + barGap);
      const normalized = diff / maxAbsDiff;
      const barW = Math.min(Math.abs(normalized), 1) * (chartWidth / 2);
      const x = diff >= 0 ? centerX : centerX - barW;
      
      ctx.fillStyle = Math.abs(diff) < 0.00001 ? '#6c757d' : (diff >= 0 ? Config.getDiffColor(0.8) : Config.getDiffColor(-0.8));
      ctx.fillRect(x, y, barW, barHeight);
      
      renderData[id].cells.push({
        x, y, width: barW, height: barHeight,
        ngram: trigram,
        diff,
        freqA: trigrams.freqA[trigram] || 0,
        freqB: trigrams.freqB[trigram] || 0,
      });
      
      const label = Config.getNgramDisplay(trigram, settings.useVoynichFont);
      ctx.fillStyle = '#333';
      ctx.font = settings.useVoynichFont ? '12px Voynich' : '11px system-ui';
      ctx.textAlign = diff >= 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, diff >= 0 ? centerX + barW + 4 : centerX - barW - 4, y + barHeight / 2);
      
      const sign = diff >= 0 ? '+' : '';
      ctx.fillStyle = '#666';
      ctx.font = '10px system-ui';
      ctx.textAlign = diff >= 0 ? 'right' : 'left';
      ctx.fillText(`${sign}${(diff * 100).toFixed(3)}%`, diff >= 0 ? centerX - 4 : centerX + 4, y + barHeight / 2);
    }
  }
  
  /**
   * Handle mouse move for hover detection.
   */
  function handleMouseMove(e, id) {
    const canvas = canvases[id];
    const data = renderData[id];
    if (!canvas || !data || !data.cells) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    let hoverInfo = null;
    
    for (const cell of data.cells) {
      if (x >= cell.x && x <= cell.x + cell.width &&
          y >= cell.y && y <= cell.y + cell.height) {
        
        const settings = data.lastSettings;
        const ngram = cell.ngram || (cell.first + cell.second);
        
        hoverInfo = {
          ngram: ngram,
          ngramDisplay: Config.getNgramDisplay(ngram, settings.useVoynichFont),
          type: data.type || 'bigram',
        };
        
        if (cell.first && cell.second) {
          hoverInfo.first = cell.first;
          hoverInfo.second = cell.second;
        }
        
        if (data.isDiff) {
          hoverInfo.isDiff = true;
          hoverInfo.diff = cell.diff;
          hoverInfo.freqA = cell.freqA;
          hoverInfo.freqB = cell.freqB;
        } else {
          hoverInfo.frequency = cell.frequency;
          hoverInfo.count = cell.count;
          hoverInfo.value = cell.value;
        }
        break;
      }
    }
    
    if (hoverCallback) {
      hoverCallback(hoverInfo);
    }
  }
  
  /**
   * Handle mouse leave.
   */
  function handleMouseLeave(id) {
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
