/**
 * Pages panel utility for displaying aggregation page details.
 * Shows which folios/pages are included in each aggregation, grouped by quire.
 */

const PagesPanel = (function() {
  
  // Quire letter to number mapping
  const QUIRE_MAPPING = {
    'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
    'I': 9, 'J': 10, 'K': 11, 'L': 12, 'M': 13, 'N': 14, 'O': 15, 'P': 16,
    'Q': 17, 'R': 18, 'S': 19, 'T': 20,
  };
  
  /**
   * Group pages by quire and folio.
   * @param {Array} pages - Array of page objects with {folio, quire, language, hand, illustration}
   * @returns {Object} Grouped pages: {quireNum: {folioBase: [pages]}}
   */
  function groupPagesByQuire(pages) {
    const grouped = {};
    
    for (const page of pages) {
      const quireNum = QUIRE_MAPPING[page.quire] || 0;
      const folioBase = page.folio.replace(/[rv]$/, '').replace(/[rv]\d+$/, '');
      
      if (!grouped[quireNum]) {
        grouped[quireNum] = {};
      }
      if (!grouped[quireNum][folioBase]) {
        grouped[quireNum][folioBase] = [];
      }
      grouped[quireNum][folioBase].push(page);
    }
    
    return grouped;
  }
  
  /**
   * Render pages grouped by quire into HTML.
   * @param {Array} pages - Array of page objects
   * @param {Object} options - Rendering options
   * @returns {string} HTML string
   */
  function renderPagesHtml(pages, options = {}) {
    if (!pages || pages.length === 0) {
      return '<em class="no-pages">No pages in this aggregation</em>';
    }
    
    const grouped = groupPagesByQuire(pages);
    const sortedQuires = Object.keys(grouped).map(Number).sort((a, b) => a - b);
    
    let html = '';
    
    for (const quireNum of sortedQuires) {
      const quireLabel = quireNum > 0 ? `Quire ${quireNum}` : 'Unknown Quire';
      const folios = grouped[quireNum];
      
      // Sort folios numerically
      const sortedFolios = Object.keys(folios).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      
      html += `<div class="quire-group">`;
      html += `<span class="quire-label">${quireLabel}</span>`;
      
      for (const folioBase of sortedFolios) {
        const folioPages = folios[folioBase];
        const sortedPages = folioPages.sort((a, b) => a.folio.localeCompare(b.folio));
        
        const pageLinks = sortedPages.map(p => {
          const url = `https://voynichese.com/#/${p.folio}/0`;
          return `<a href="${url}" target="_blank" rel="noopener" class="page-link" title="View ${p.folio} on Voynichese">${p.folio}</a>`;
        }).join(', ');
        
        html += `<span class="folio-item"><strong>${folioBase}</strong>: ${pageLinks}</span> `;
      }
      
      html += `</div>`;
    }
    
    return html;
  }
  
  /**
   * Update a pages panel element with aggregation data.
   * @param {HTMLElement} container - Container element
   * @param {Object} data - Aggregation data with pages array
   * @param {string} [label] - Optional label (e.g., "A:" or "B:")
   */
  function updatePanel(container, data, label = '') {
    if (!container) return;
    
    const pages = data?.pages || [];
    const pageCount = pages.length;
    const folioCount = new Set(pages.map(p => p.folio.replace(/[rv]$/, '').replace(/[rv]\d+$/, ''))).size;
    
    const headerText = label 
      ? `${label} ${folioCount} folios, ${pageCount} pages`
      : `${folioCount} folios, ${pageCount} pages`;
    
    container.innerHTML = `
      <div class="pages-panel-header">
        <strong>${headerText}</strong>
        <button class="expand-btn" onclick="PagesPanel.toggle(this)" title="Show pages">?</button>
      </div>
      <div class="pages-panel-content" style="display: none;">
        ${renderPagesHtml(pages)}
      </div>
    `;
  }
  
  /**
   * Update panels for compare/diff mode showing both A and B.
   * @param {HTMLElement} container - Container element
   * @param {Object} dataA - Aggregation A data
   * @param {Object} dataB - Aggregation B data
   */
  function updateComparePanel(container, dataA, dataB) {
    if (!container) return;
    
    const pagesA = dataA?.pages || [];
    const pagesB = dataB?.pages || [];
    const folioCountA = new Set(pagesA.map(p => p.folio.replace(/[rv]$/, '').replace(/[rv]\d+$/, ''))).size;
    const folioCountB = new Set(pagesB.map(p => p.folio.replace(/[rv]$/, '').replace(/[rv]\d+$/, ''))).size;
    
    container.innerHTML = `
      <div class="pages-panel-section">
        <div class="pages-panel-header">
          <strong>A: ${folioCountA} folios, ${pagesA.length} pages</strong>
          <button class="expand-btn" data-target="pages-a" onclick="PagesPanel.toggle(this)" title="Show pages">?</button>
        </div>
        <div class="pages-panel-content" id="pages-a" style="display: none;">
          ${renderPagesHtml(pagesA)}
        </div>
      </div>
      <div class="pages-panel-section">
        <div class="pages-panel-header">
          <strong>B: ${folioCountB} folios, ${pagesB.length} pages</strong>
          <button class="expand-btn" data-target="pages-b" onclick="PagesPanel.toggle(this)" title="Show pages">?</button>
        </div>
        <div class="pages-panel-content" id="pages-b" style="display: none;">
          ${renderPagesHtml(pagesB)}
        </div>
      </div>
    `;
  }
  
  /**
   * Toggle the expanded state of a pages panel.
   * @param {HTMLElement} btn - The toggle button
   */
  function toggle(btn) {
    const targetId = btn.dataset.target;
    let content;
    
    if (targetId) {
      content = document.getElementById(targetId);
    } else {
      content = btn.closest('.pages-panel-header').nextElementSibling;
    }
    
    if (content) {
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      btn.classList.toggle('expanded', isHidden);
      btn.textContent = isHidden ? '−' : '?';
    }
  }
  
  /**
   * Get CSS styles for pages panels.
   * @returns {string} CSS string
   */
  function getStyles() {
    return `
      .pages-panel {
        font-size: 13px;
      }
      .pages-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .pages-panel-section {
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-color);
      }
      .pages-panel-section:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }
      .pages-panel .expand-btn {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 50%;
        width: 20px;
        height: 20px;
        font-size: 11px;
        cursor: pointer;
        color: var(--text-secondary);
        padding: 0;
        line-height: 18px;
        flex-shrink: 0;
      }
      .pages-panel .expand-btn:hover {
        background: var(--accent-color);
        color: white;
        border-color: var(--accent-color);
      }
      .pages-panel .expand-btn.expanded {
        background: var(--accent-color);
        color: white;
        border-color: var(--accent-color);
      }
      .pages-panel-content {
        margin-top: 8px;
        max-height: 300px;
        overflow-y: auto;
      }
      .pages-panel .quire-group {
        margin-top: 8px;
        padding-left: 10px;
        border-left: 2px solid var(--border-color);
      }
      .pages-panel .quire-group:first-child {
        margin-top: 0;
      }
      .pages-panel .quire-label {
        display: inline-block;
        background: var(--bg-primary);
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        color: var(--text-secondary);
        margin-right: 8px;
        margin-bottom: 2px;
      }
      .pages-panel .folio-item {
        display: inline-block;
        margin-right: 12px;
        margin-bottom: 2px;
        white-space: nowrap;
      }
      .pages-panel .folio-item strong {
        color: var(--accent-color);
      }
      .pages-panel .page-link {
        color: var(--text-secondary);
        text-decoration: none;
      }
      .pages-panel .page-link:hover {
        color: var(--accent-color);
        text-decoration: underline;
      }
      .pages-panel .no-pages {
        color: var(--text-secondary);
      }
    `;
  }
  
  return {
    groupPagesByQuire,
    renderPagesHtml,
    updatePanel,
    updateComparePanel,
    toggle,
    getStyles,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PagesPanel;
}
