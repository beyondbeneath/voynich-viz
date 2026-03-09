/**
 * Data loading module for Voynich line transition visualizer.
 * Handles fetching and caching of manifest and aggregation JSON files.
 */

const DataLoader = (function() {
  const cache = new Map();
  const BASE_PATH = '../output/linetrans/aggregated';
  const CONFIG_PATH = '../output/transcription_config.json';
  
  /**
   * Load transcription config and initialize Config module.
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
      
      Config.loadTranscriptionConfig(config);
      
      return config;
    } catch (error) {
      console.error('Error loading transcription config:', error);
      throw error;
    }
  }
  
  /**
   * Load the manifest file listing all available aggregations.
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
      
      data.transitionMatrix = buildTransitionMatrix(data);
      
      cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Error loading aggregation ${name}:`, error);
      throw error;
    }
  }
  
  /**
   * Build a 2D transition matrix from the flat transitions object.
   */
  function buildTransitionMatrix(data) {
    const matrix = {
      counts: {},
      probabilities: {},
    };
    
    const charset = data.charset || [];
    for (const char of charset) {
      matrix.counts[char] = {};
      matrix.probabilities[char] = {};
    }
    
    for (const [key, count] of Object.entries(data.transitions || {})) {
      const [from, to] = key.split('|');
      if (!matrix.counts[from]) matrix.counts[from] = {};
      matrix.counts[from][to] = count;
    }
    
    for (const [key, prob] of Object.entries(data.probabilities || {})) {
      const [from, to] = key.split('|');
      if (!matrix.probabilities[from]) matrix.probabilities[from] = {};
      matrix.probabilities[from][to] = prob;
    }
    
    return matrix;
  }
  
  /**
   * Get a transition value from the matrix.
   */
  function getTransition(matrix, from, to, type = 'probabilities') {
    const data = matrix[type];
    if (data && data[from] && data[from][to] !== undefined) {
      return data[from][to];
    }
    return 0;
  }
  
  /**
   * Preload multiple aggregations in parallel.
   */
  async function preloadAggregations(names) {
    return Promise.all(names.map(name => loadAggregation(name)));
  }
  
  function clearCache() {
    cache.clear();
  }
  
  function getCacheStats() {
    return {
      size: cache.size,
      keys: Array.from(cache.keys()),
    };
  }
  
  /**
   * Compute the difference between two aggregation matrices.
   */
  function computeDiff(dataA, dataB) {
    const matrixA = dataA.transitionMatrix;
    const matrixB = dataB.transitionMatrix;
    
    const charsetA = new Set(dataA.charset || []);
    const charsetB = new Set(dataB.charset || []);
    const allChars = [...new Set([...charsetA, ...charsetB])];
    
    const diffMatrix = {
      diffs: {},
      absDiffs: {},
    };
    
    let maxAbsDiff = 0;
    
    for (const from of allChars) {
      diffMatrix.diffs[from] = {};
      diffMatrix.absDiffs[from] = {};
      
      for (const to of allChars) {
        const probA = getTransition(matrixA, from, to, 'probabilities');
        const probB = getTransition(matrixB, from, to, 'probabilities');
        const diff = probA - probB;
        
        diffMatrix.diffs[from][to] = diff;
        diffMatrix.absDiffs[from][to] = Math.abs(diff);
        
        if (Math.abs(diff) > maxAbsDiff) {
          maxAbsDiff = Math.abs(diff);
        }
      }
    }
    
    return {
      diffMatrix,
      maxAbsDiff,
      charset: allChars,
      dataA,
      dataB,
      description: `${dataA.description} − ${dataB.description}`,
    };
  }
  
  /**
   * Get a diff value from the diff matrix.
   */
  function getDiff(diffMatrix, from, to) {
    if (diffMatrix.diffs && diffMatrix.diffs[from] && diffMatrix.diffs[from][to] !== undefined) {
      return diffMatrix.diffs[from][to];
    }
    return 0;
  }
  
  return {
    loadTranscriptionConfig,
    loadManifest,
    loadAggregation,
    getTransition,
    preloadAggregations,
    clearCache,
    getCacheStats,
    computeDiff,
    getDiff,
  };
})();
