/**
 * Data loading module for Voynich n-gram visualizer.
 */

const DataLoader = (function() {
  const cache = new Map();
  const BASE_PATH = '../output/ngram/aggregated';
  const CONFIG_PATH = '../output/transcription_config.json';
  
  /**
   * Load transcription config and initialize Config module.
   * Should be called before loading any data.
   * @returns {Promise<Object>} The loaded config
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
    // Combine charsets
    const charsA = new Set(dataA.bigram_matrix?.charset || []);
    const charsB = new Set(dataB.bigram_matrix?.charset || []);
    const allChars = [...new Set([...charsA, ...charsB])];
    const charset = Config.sortCharacters(allChars);
    
    const diffData = {
      charset,
      description: `${dataA.description} − ${dataB.description}`,
      dataA,
      dataB,
      bigram_matrix: {
        charset,
        diffs: {},
        freqA: {},
        freqB: {},
      },
      unigrams: {
        diffs: {},
        freqA: {},
        freqB: {},
      },
      trigrams: {
        diffs: {},
        freqA: {},
        freqB: {},
      },
    };
    
    // Compute bigram diffs
    const matrixA = dataA.bigram_matrix || { frequencies: {} };
    const matrixB = dataB.bigram_matrix || { frequencies: {} };
    
    let maxAbsDiff = 0;
    
    for (const first of charset) {
      diffData.bigram_matrix.diffs[first] = {};
      diffData.bigram_matrix.freqA[first] = {};
      diffData.bigram_matrix.freqB[first] = {};
      
      for (const second of charset) {
        const freqA = matrixA.frequencies?.[first]?.[second] || 0;
        const freqB = matrixB.frequencies?.[first]?.[second] || 0;
        const diff = freqA - freqB;
        
        diffData.bigram_matrix.diffs[first][second] = diff;
        diffData.bigram_matrix.freqA[first][second] = freqA;
        diffData.bigram_matrix.freqB[first][second] = freqB;
        
        if (Math.abs(diff) > maxAbsDiff) {
          maxAbsDiff = Math.abs(diff);
        }
      }
    }
    
    diffData.maxAbsDiff = maxAbsDiff;
    
    // Compute unigram diffs
    const uniA = dataA.unigrams?.frequencies || {};
    const uniB = dataB.unigrams?.frequencies || {};
    const allUniChars = new Set([...Object.keys(uniA), ...Object.keys(uniB)]);
    
    let maxUniDiff = 0;
    for (const char of allUniChars) {
      const diff = (uniA[char] || 0) - (uniB[char] || 0);
      diffData.unigrams.diffs[char] = diff;
      diffData.unigrams.freqA[char] = uniA[char] || 0;
      diffData.unigrams.freqB[char] = uniB[char] || 0;
      if (Math.abs(diff) > maxUniDiff) maxUniDiff = Math.abs(diff);
    }
    diffData.unigrams.maxAbsDiff = maxUniDiff || 0.01;
    
    // Compute trigram diffs
    const triA = dataA.trigrams?.frequencies || {};
    const triB = dataB.trigrams?.frequencies || {};
    const allTrigrams = new Set([...Object.keys(triA), ...Object.keys(triB)]);
    
    let maxTriDiff = 0;
    for (const tri of allTrigrams) {
      const diff = (triA[tri] || 0) - (triB[tri] || 0);
      diffData.trigrams.diffs[tri] = diff;
      diffData.trigrams.freqA[tri] = triA[tri] || 0;
      diffData.trigrams.freqB[tri] = triB[tri] || 0;
      if (Math.abs(diff) > maxTriDiff) maxTriDiff = Math.abs(diff);
    }
    diffData.trigrams.maxAbsDiff = maxTriDiff || 0.01;
    
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
