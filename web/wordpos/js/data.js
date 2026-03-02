/**
 * Data loading module for Voynich word position visualizer.
 */

const DataLoader = (function() {
  const cache = new Map();
  const BASE_PATH = '../../output/wordpos/aggregated';
  const CONFIG_PATH = '../../output/transcription_config.json';
  
  /**
   * Load transcription config and initialize Config module.
   * Should be called before loading any data.
   */
  async function loadTranscriptionConfig() {
    const cacheKey = 'transcription_config';
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    
    try {
      const response = await fetch(CONFIG_PATH);
      if (!response.ok) {
        throw new Error(`Failed to load transcription config: ${response.status}`);
      }
      const config = await response.json();
      cache.set(cacheKey, config);
      
      // Initialize the Config module with loaded data
      Config.loadTranscriptionConfig(config);
      
      return config;
    } catch (error) {
      console.error('Error loading transcription config:', error);
      throw error;
    }
  }
  
  /**
   * Load the manifest file.
   */
  async function loadManifest() {
    const cacheKey = 'manifest';
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    
    try {
      const response = await fetch(`${BASE_PATH}/manifest.json`);
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.status}`);
      }
      const data = await response.json();
      cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error loading manifest:', error);
      throw error;
    }
  }
  
  /**
   * Load a specific aggregation file.
   */
  async function loadAggregation(name) {
    const cacheKey = `agg_${name}`;
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    
    try {
      const response = await fetch(`${BASE_PATH}/${name}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load aggregation ${name}: ${response.status}`);
      }
      const data = await response.json();
      cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Error loading aggregation ${name}:`, error);
      throw error;
    }
  }
  
  /**
   * Compute the difference between two aggregation datasets.
   */
  function computeDiff(dataA, dataB) {
    const allChars = new Set([...dataA.charset, ...dataB.charset]);
    const diffData = {
      charset: [...allChars],
      characters: {},
      description: `${dataA.description} − ${dataB.description}`,
      dataA,
      dataB,
    };
    
    for (const char of allChars) {
      const charA = dataA.characters[char] || { ratios: { start: 0, middle: 0, end: 0, only: 0 }, total: 0 };
      const charB = dataB.characters[char] || { ratios: { start: 0, middle: 0, end: 0, only: 0 }, total: 0 };
      
      diffData.characters[char] = {
        diff: {
          start: charA.ratios.start - charB.ratios.start,
          middle: charA.ratios.middle - charB.ratios.middle,
          end: charA.ratios.end - charB.ratios.end,
          only: charA.ratios.only - charB.ratios.only,
        },
        ratiosA: charA.ratios,
        ratiosB: charB.ratios,
        totalA: charA.total,
        totalB: charB.total,
      };
    }
    
    return diffData;
  }
  
  /**
   * Clear the cache.
   */
  function clearCache() {
    cache.clear();
  }
  
  return {
    loadTranscriptionConfig,
    loadManifest,
    loadAggregation,
    computeDiff,
    clearCache,
  };
})();
