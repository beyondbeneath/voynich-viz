/**
 * Scatter plot rendering on canvas.
 */

const ScatterPlot = (function() {
  const PADDING = { top: 50, right: 50, bottom: 60, left: 70 };
  const POINT_RADIUS = 4;
  const POINT_RADIUS_HOVER = 7;
  const LABEL_OFFSET = 3;

  let canvas, ctx;
  let width, height;
  let chartWidth, chartHeight;
  let data = [];
  let xMetric = 'unigram_entropy';
  let yMetric = 'transition_entropy';
  let colorKey = 'language';
  let colorMap = {};
  let colorPalette = [
    '#4a90d9', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12',
    '#1abc9c', '#e91e63', '#607d8b', '#795548', '#00bcd4',
    '#8bc34a', '#ff5722', '#673ab7', '#009688', '#ff9800',
  ];
  let xScale = { min: 0, max: 1 };
  let yScale = { min: 0, max: 1 };
  let hoveredIndex = -1;
  let showLabels = true;
  let highlightOnHover = true;
  let definitions = [];

  function getColor(value) {
    if (value == null || value === '') return '#999';
    const key = String(value);
    if (!colorMap[key]) {
      const i = Object.keys(colorMap).length % colorPalette.length;
      colorMap[key] = colorPalette[i];
    }
    return colorMap[key];
  }

  function toCanvasX(x) {
    if (x == null || !Number.isFinite(x)) return null;
    const t = (x - xScale.min) / (xScale.max - xScale.min || 1);
    return PADDING.left + t * chartWidth;
  }

  function toCanvasY(y) {
    if (y == null || !Number.isFinite(y)) return null;
    const t = (y - yScale.min) / (yScale.max - yScale.min || 1);
    return PADDING.top + chartHeight - t * chartHeight;
  }

  function fromCanvasX(cx) {
    const t = (cx - PADDING.left) / chartWidth;
    return xScale.min + t * (xScale.max - xScale.min);
  }

  function fromCanvasY(cy) {
    const t = 1 - (cy - PADDING.top) / chartHeight;
    return yScale.min + t * (yScale.max - yScale.min);
  }

  function hitTest(cx, cy) {
    let best = -1;
    let bestDist = POINT_RADIUS_HOVER * 2;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const x = toCanvasX(d[xMetric]);
      const y = toCanvasY(d[yMetric]);
      if (x == null || y == null) continue;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  function draw() {
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = PADDING.left + (i / 5) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + chartHeight);
      ctx.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const y = PADDING.top + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();
    }

    // Points
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const x = toCanvasX(d[xMetric]);
      const y = toCanvasY(d[yMetric]);
      if (x == null || y == null) continue;

      const isHovered = highlightOnHover && i === hoveredIndex;
      const r = isHovered ? POINT_RADIUS_HOVER : POINT_RADIUS;
      const color = getColor(d.metadata?.[colorKey]);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isHovered ? '#333' : 'rgba(0,0,0,0.2)';
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();
    }

    // Labels: when showLabels is true, show folio for all points
    if (showLabels) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '11px sans-serif';
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const px = toCanvasX(d[xMetric]);
        const py = toCanvasY(d[yMetric]);
        if (px == null || py == null) continue;
        if (!d.folio) continue;
        const isHovered = i === hoveredIndex;
        const radius = isHovered ? POINT_RADIUS_HOVER : POINT_RADIUS;
        ctx.fillStyle = isHovered ? '#111' : 'rgba(0,0,0,0.5)';
        ctx.fillText(d.folio, px + radius + LABEL_OFFSET, py);
      }
    }

    // Axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + chartHeight);
    ctx.lineTo(PADDING.left + chartWidth, PADDING.top + chartHeight);
    ctx.stroke();

    // Axis labels
    const xDef = definitions.find(d => d.id === xMetric);
    const yDef = definitions.find(d => d.id === yMetric);
    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xDef?.label || xMetric, PADDING.left + chartWidth / 2, height - 15);
    ctx.save();
    ctx.translate(20, PADDING.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(yDef?.label || yMetric, 0, 0);
    ctx.restore();

    // Scale labels
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText(formatTick(xScale.min), PADDING.left, height - 25);
    ctx.fillText(formatTick(xScale.max), PADDING.left + chartWidth, height - 25);
    ctx.textAlign = 'right';
    ctx.fillText(formatTick(yScale.min), PADDING.left - 8, PADDING.top + chartHeight);
    ctx.fillText(formatTick(yScale.max), PADDING.left - 8, PADDING.top);
  }

  function formatTick(v) {
    if (v == null || !Number.isFinite(v)) return '';
    if (Math.abs(v) < 0.001 || Math.abs(v) > 1000) return v.toExponential(1);
    return v.toFixed(2);
  }

  return {
    init(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      if (!ctx) return;

      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        chartWidth = width - PADDING.left - PADDING.right;
        chartHeight = height - PADDING.top - PADDING.bottom;
        draw();
      };

      window.addEventListener('resize', resize);
      resize();

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const prev = hoveredIndex;
        hoveredIndex = hitTest(cx, cy);
        if (hoveredIndex !== prev) draw();
      });

      canvas.addEventListener('mouseleave', () => {
        hoveredIndex = -1;
        draw();
      });

      return { getHoveredIndex: () => hoveredIndex };
    },

    setData(newData, defs) {
      data = newData || [];
      definitions = defs || [];
      colorMap = {};
      draw();
    },

    setMetrics(x, y) {
      xMetric = x;
      yMetric = y;
      const xVals = data.map(d => d[x]).filter(v => v != null && Number.isFinite(v));
      const yVals = data.map(d => d[y]).filter(v => v != null && Number.isFinite(v));
      const pad = 0.05;
      const xRange = xVals.length ? Math.max(...xVals) - Math.min(...xVals) : 1;
      const yRange = yVals.length ? Math.max(...yVals) - Math.min(...yVals) : 1;
      xScale = xVals.length
        ? { min: Math.min(...xVals) - pad * xRange, max: Math.max(...xVals) + pad * xRange }
        : { min: 0, max: 1 };
      yScale = yVals.length
        ? { min: Math.min(...yVals) - pad * yRange, max: Math.max(...yVals) + pad * yRange }
        : { min: 0, max: 1 };
      draw();
    },

    setColorBy(key) {
      colorKey = key;
      colorMap = {};
      draw();
    },

    setShowLabels(show) {
      showLabels = show;
      draw();
    },

    setHighlightOnHover(highlight) {
      highlightOnHover = highlight;
      draw();
    },

    getData() { return data; },
    getHoveredIndex() { return hoveredIndex; },
    getColorMap() { return { ...colorMap }; },
  };
})();
