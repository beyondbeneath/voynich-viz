/**
 * Data loading module for Voynich character position heatmap visualizer.
 */

const DataLoader = (function() {
  const BASE_PATH = '../output/charpos/aggregated/';
  const CONFIG_PATH = '../output/transcription_config.json';
  
  let manifestCache = null;
  const dataCache = {};
  
  /**
   * Load transcription config and initialize Config module.
   */
  async function loadTranscriptionConfig() {
    const response = await fetch(CONFIG_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load transcription config: ${response.status}`);
    }
    const config = await response.json();
    Config.loadTranscriptionConfig(config);
    return config;
  }
  
  /**
   * Load the aggregations manifest.
   */
  async function loadManifest() {
    if (manifestCache) return manifestCache;
    
    const response = await fetch(BASE_PATH + 'manifest.json');
    if (!response.ok) {
      throw new Error(`Failed to load manifest: ${response.status}`);
    }
    
    manifestCache = await response.json();
    return manifestCache;
  }
  
  /**
   * Load aggregation data by name.
   */
  async function loadAggregation(name) {
    if (dataCache[name]) {
      return dataCache[name];
    }
    
    const response = await fetch(BASE_PATH + name + '.json');
    if (!response.ok) {
      throw new Error(`Failed to load aggregation '${name}': ${response.status}`);
    }
    
    const data = await response.json();
    dataCache[name] = data;
    return data;
  }
  
  /**
   * Clear data cache.
   */
  function clearCache() {
    Object.keys(dataCache).forEach(key => delete dataCache[key]);
    manifestCache = null;
  }
  
  return {
    loadTranscriptionConfig,
    loadManifest,
    loadAggregation,
    clearCache,
  };
})();
