/**
 * Page-Level Explorer - Main application.
 * Loads page-level data, computes metrics, and drives the scatter plot.
 */

const App = (function() {
  const OUTPUT = '../output';
  let config = null;
  let pageData = [];
  let scatterHoverHandler = null;

  function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.toggle('visible', !!show);
  }

  function showError(msg) {
    const el = document.getElementById('error-message');
    if (el) {
      el.textContent = msg;
      el.classList.add('visible');
    }
  }

  async function loadJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  async function loadAll() {
    showLoading(true);
    try {
      const [cfg, markov, ngram, wordpos, pagepos] = await Promise.all([
        loadJson(`${OUTPUT}/transcription_config.json`),
        loadJson(`${OUTPUT}/markov/page_transitions.json`),
        loadJson(`${OUTPUT}/ngram/page_ngrams.json`),
        loadJson(`${OUTPUT}/wordpos/page_positions.json`),
        loadJson(`${OUTPUT}/pagepos/page_positions.json`),
      ]);
      config = cfg;

      const markovByFolio = {};
      (markov.pages || []).forEach(p => { markovByFolio[p.folio] = p; });
      const ngramByFolio = {};
      (ngram.pages || []).forEach(p => { ngramByFolio[p.folio] = p; });
      const wordposByFolio = {};
      (wordpos.pages || []).forEach(p => { wordposByFolio[p.folio] = p; });
      const pageposByFolio = {};
      (pagepos.pages || []).forEach(p => { pageposByFolio[p.folio] = p; });

      const folios = new Set([
        ...Object.keys(markovByFolio),
        ...Object.keys(ngramByFolio),
        ...Object.keys(wordposByFolio),
        ...Object.keys(pageposByFolio),
      ]);

      pageData = [];
      for (const folio of folios) {
        const m = markovByFolio[folio];
        const n = ngramByFolio[folio];
        const w = wordposByFolio[folio];
        const p = pageposByFolio[folio];
        const metadata = (m || n || w || p)?.metadata || null;
        const metrics = Metrics.computePageMetrics(folio, metadata, m, n, w, p);
        pageData.push(metrics);
      }

      pageData.sort((a, b) => (a.folio || '').localeCompare(b.folio || ''));

      return pageData;
    } catch (e) {
      showError(e.message);
      return [];
    } finally {
      showLoading(false);
    }
  }

  function getIllustrationLabel(code) {
    if (!config?.illustration_types) return code;
    return config.illustration_types[code] || code;
  }

  function populateAxisSelects() {
    const defs = Metrics.DEFINITIONS;
    const selX = document.getElementById('axis-x');
    const selY = document.getElementById('axis-y');
    selX.innerHTML = '';
    selY.innerHTML = '';
    defs.forEach(d => {
      const optX = document.createElement('option');
      optX.value = d.id;
      optX.textContent = d.label;
      selX.appendChild(optX);
      const optY = document.createElement('option');
      optY.value = d.id;
      optY.textContent = d.label;
      selY.appendChild(optY);
    });
    selX.value = 'unigram_entropy';
    selY.value = 'transition_entropy';
  }

  function updateLegend() {
    const colorBy = document.getElementById('color-by')?.value || 'language';
    const colorMap = ScatterPlot.getColorMap();
    const container = document.getElementById('legend');
    if (!container) return;
    container.innerHTML = '';
    for (const [key, color] of Object.entries(colorMap)) {
      const div = document.createElement('div');
      div.className = 'legend-item';
      let label = key;
      if (colorBy === 'illustration') label = getIllustrationLabel(key);
      div.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${label}</span>`;
      container.appendChild(div);
    }
  }

  function updateHoverInfo(index) {
    const el = document.getElementById('hover-info');
    const tooltip = document.getElementById('hover-tooltip');
    if (!el) return;

    if (index < 0 || index >= pageData.length) {
      el.innerHTML = '<span class="placeholder">Hover over a point to see page details</span>';
      if (tooltip) tooltip.classList.remove('visible');
      return;
    }

    const d = pageData[index];
    const colorBy = document.getElementById('color-by')?.value || 'language';
    const colorVal = d.metadata?.[colorBy];
    const colorLabel = colorBy === 'illustration' ? getIllustrationLabel(colorVal) : colorVal;

    let html = `<strong>${d.folio}</strong><br>`;
    html += `Language: ${d.metadata?.language || '-'} | Hand: ${d.metadata?.hand || '-'}<br>`;
    html += `Illustration: ${getIllustrationLabel(d.metadata?.illustration) || '-'} | Quire: ${d.metadata?.quire ?? '-'}<br>`;
    html += `<br><strong>Metrics:</strong><br>`;
    const xSel = document.getElementById('axis-x')?.value;
    const ySel = document.getElementById('axis-y')?.value;
    if (xSel && d[xSel] != null) html += `${Metrics.DEFINITIONS.find(m => m.id === xSel)?.label || xSel}: ${Number(d[xSel]).toFixed(3)}<br>`;
    if (ySel && d[ySel] != null) html += `${Metrics.DEFINITIONS.find(m => m.id === ySel)?.label || ySel}: ${Number(d[ySel]).toFixed(3)}<br>`;
    el.innerHTML = html;

    if (tooltip) {
      tooltip.innerHTML = `<strong>${d.folio}</strong> · ${colorLabel}`;
      tooltip.classList.add('visible');
    }
  }

  function setupHoverSync() {
    const canvas = document.getElementById('scatter-canvas');
    const wrapper = canvas?.closest('.chart-wrapper');
    const tooltip = document.getElementById('hover-tooltip');
    if (!canvas || !wrapper) return;

    const update = (e) => {
      const idx = ScatterPlot.getHoveredIndex();
      updateHoverInfo(idx);
      if (tooltip && e) {
        const rect = wrapper.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top = `${e.clientY - rect.top + 12}px`;
      }
    };

    canvas.addEventListener('mousemove', update);
    canvas.addEventListener('mouseleave', () => {
      updateHoverInfo(-1);
      if (tooltip) tooltip.classList.remove('visible');
    });
  }

  function updateMetricDesc() {
    const xSel = document.getElementById('axis-x')?.value;
    const ySel = document.getElementById('axis-y')?.value;
    const defs = Metrics.DEFINITIONS;
    const xDef = defs.find(d => d.id === xSel);
    const yDef = defs.find(d => d.id === ySel);
    const el = document.getElementById('metric-desc');
    if (el) {
      let text = '';
      if (xDef && yDef) {
        text = `X: ${xDef.desc} — Y: ${yDef.desc}`;
      } else {
        text = 'Select axes to explore page-level patterns. Each point is a page; color indicates grouping.';
      }
      el.textContent = text;
    }
  }

  function render() {
    ScatterPlot.setData(pageData, Metrics.DEFINITIONS);
    ScatterPlot.setMetrics(
      document.getElementById('axis-x')?.value || 'unigram_entropy',
      document.getElementById('axis-y')?.value || 'transition_entropy'
    );
    ScatterPlot.setColorBy(document.getElementById('color-by')?.value || 'language');
    ScatterPlot.setShowLabels(document.getElementById('show-labels')?.checked !== false);
    ScatterPlot.setHighlightOnHover(document.getElementById('highlight-hover')?.checked !== false);
    updateLegend();
    updateMetricDesc();
  }

  function bindControls() {
    const axisX = document.getElementById('axis-x');
    const axisY = document.getElementById('axis-y');
    const colorBy = document.getElementById('color-by');
    const showLabels = document.getElementById('show-labels');
    const highlightHover = document.getElementById('highlight-hover');

    const onChange = () => {
      ScatterPlot.setMetrics(axisX.value, axisY.value);
      updateMetricDesc();
    };

    axisX?.addEventListener('change', onChange);
    axisY?.addEventListener('change', onChange);

    colorBy?.addEventListener('change', () => {
      ScatterPlot.setColorBy(colorBy.value);
      updateLegend();
    });

    showLabels?.addEventListener('change', () => {
      ScatterPlot.setShowLabels(showLabels.checked);
    });

    highlightHover?.addEventListener('change', () => {
      ScatterPlot.setHighlightOnHover(highlightHover.checked);
    });
  }

  async function init() {
    populateAxisSelects();
    ScatterPlot.init(document.getElementById('scatter-canvas'));
    setupHoverSync();
    bindControls();

    await loadAll();
    render();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
