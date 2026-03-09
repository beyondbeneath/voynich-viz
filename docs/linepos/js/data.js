/**
 * Data loading module for line position effects visualizer.
 * Handles fetching and caching of manifest and aggregation JSON files.
 */

const DataLoader = (function() {
  const BASE_PATH = '../output/linepos/aggregated';
  const CONFIG_PATH = '../output/transcription_config.json';
  
  let manifestCache = null;
  let dataCache = new Map();
  
  /**
   * Load transcription config (character ordering, display mappings, etc.).
   */
  async function loadTranscriptionConfig() {
    try {
      const response = await fetch(CONFIG_PATH);
      if (!response.ok) {
        console.warn('Could not load transcription config, using defaults');
        Config.loadTranscriptionConfig({});
        return;
      }
      const config = await response.json();
      Config.loadTranscriptionConfig(config);
    } catch (e) {
      console.warn('Error loading transcription config:', e);
      Config.loadTranscriptionConfig({});
    }
  }
  
  /**
   * Load the manifest file.
   * @returns {Promise<Object>} Manifest data
   */
  async function loadManifest() {
    if (manifestCache) {
      return manifestCache;
    }
    
    const response = await fetch(`${BASE_PATH}/manifest.json`);
    if (!response.ok) {
      throw new Error(`Failed to load manifest: ${response.status}`);
    }
    
    manifestCache = await response.json();
    return manifestCache;
  }
  
  /**
   * Load aggregation data.
   * @param {string} name - Aggregation name (e.g., 'all', 'language_a')
   * @returns {Promise<Object>} Aggregation data
   */
  async function loadAggregation(name) {
    if (dataCache.has(name)) {
      return dataCache.get(name);
    }
    
    const response = await fetch(`${BASE_PATH}/${name}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load aggregation '${name}': ${response.status}`);
    }
    
    const data = await response.json();
    dataCache.set(name, data);
    return data;
  }
  
  /**
   * Compute diff between two datasets.
   * @param {Object} dataA - First dataset
   * @param {Object} dataB - Second dataset
   * @returns {Object} Diff data with prob_from_start_diff and prob_from_end_diff
   */
  function computeDiff(dataA, dataB) {
    const allGlyphs = new Set([
      ...Object.keys(dataA.prob_from_start || {}),
      ...Object.keys(dataB.prob_from_start || {}),
    ]);
    
    const probFromStartDiff = {};
    const probFromEndDiff = {};
    const asymmetryDiff = {};
    
    for (const glyph of allGlyphs) {
      probFromStartDiff[glyph] = {};
      probFromEndDiff[glyph] = {};
      
      const maxK = dataA.max_word_position || 10;
      
      for (let k = 0; k <= maxK; k++) {
        const kStr = String(k);
        const probAStart = (dataA.prob_from_start[glyph] || {})[kStr] || 0;
        const probBStart = (dataB.prob_from_start[glyph] || {})[kStr] || 0;
        probFromStartDiff[glyph][kStr] = probAStart - probBStart;
        
        const probAEnd = (dataA.prob_from_end[glyph] || {})[kStr] || 0;
        const probBEnd = (dataB.prob_from_end[glyph] || {})[kStr] || 0;
        probFromEndDiff[glyph][kStr] = probAEnd - probBEnd;
      }
      
      const asymA = (dataA.asymmetry || {})[glyph] || 0;
      const asymB = (dataB.asymmetry || {})[glyph] || 0;
      asymmetryDiff[glyph] = asymA - asymB;
    }
    
    return {
      name: `${dataA.name} - ${dataB.name}`,
      description: `Diff: ${dataA.description} − ${dataB.description}`,
      page_count: dataA.page_count,
      charset: [...allGlyphs].sort(),
      max_word_position: dataA.max_word_position || 10,
      prob_from_start: probFromStartDiff,
      prob_from_end: probFromEndDiff,
      asymmetry: asymmetryDiff,
      isDiff: true,
    };
  }
  
  /**
   * Clear all cached data.
   */
  function clearCache() {
    manifestCache = null;
    dataCache.clear();
  }
  
  // Public API
  return {
    loadTranscriptionConfig,
    loadManifest,
    loadAggregation,
    computeDiff,
    clearCache,
  };
})();
