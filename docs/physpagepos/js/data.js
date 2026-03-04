/**
 * Data loading module for Voynich physical page position visualizer.
 * Handles fetching and caching of manifest and aggregation JSON files.
 * Supports sparse grid format for efficient storage.
 */

const DataLoader = (function() {
  const cache = new Map();
  const BASE_PATH = '../output/physpagepos/aggregated';
  const CONFIG_PATH = '../output/transcription_config.json';
  
  /**
   * Load transcription config and initialize Config module.
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
      
      Config.loadTranscriptionConfig(config);
      
      return config;
    } catch (error) {
      console.error('Error loading transcription config:', error);
      throw error;
    }
  }
  
  /**
   * Load the manifest file listing all available aggregations.
   * @returns {Promise<Object>} Manifest data with aggregations array
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
   * @param {string} name - Aggregation name (e.g., 'all', 'language_a')
   * @returns {Promise<Object>} Aggregation data with grid counts per character
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
   * Convert sparse grid format {"col,row": count} to dense 2D array.
   * @param {Object} cells - Sparse cells object
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   * @returns {number[][]} Dense 2D array
   */
  function sparseToDense(cells, cols, rows) {
    const grid = Array(rows).fill(null).map(() => Array(cols).fill(0));
    
    for (const [key, count] of Object.entries(cells)) {
      const [colStr, rowStr] = key.split(',');
      const col = parseInt(colStr, 10);
      const row = parseInt(rowStr, 10);
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        grid[row][col] = count;
      }
    }
    
    return grid;
  }
  
  /**
   * Get grid data for a specific character at a specific resolution and normalization mode.
   * Handles both sparse and dense grid formats.
   * @param {Object} data - Aggregation data
   * @param {string} char - Character to get grid for
   * @param {string} resolution - Grid resolution ('coarse', 'fine', or 'raw')
   * @param {string} normalization - Normalization mode ('page' or 'manuscript')
   * @returns {Object} Grid data with counts and distribution
   */
  function getCharGrid(data, char, resolution = 'coarse', normalization = 'page') {
    // Navigate to the correct nested structure: normalization_modes -> mode -> resolution
    const normModes = data.normalization_modes;
    if (!normModes) {
      // Fallback for older data structure (single normalization mode)
      return getCharGridLegacy(data, char, resolution);
    }
    
    const modeData = normModes[normalization];
    if (!modeData) {
      console.warn(`Normalization mode ${normalization} not found in data`);
      return emptyGridResult(10, 15);
    }
    
    const gridData = modeData[resolution];
    if (!gridData) {
      console.warn(`Resolution ${resolution} not found in ${normalization} mode`);
      return emptyGridResult(10, 15);
    }
    
    const charData = gridData.characters?.[char];
    const cols = gridData.grid_cols;
    const rows = gridData.grid_rows;
    const isAbsolute = gridData.absolute || false;
    
    if (!charData) {
      return emptyGridResult(cols, rows, isAbsolute);
    }
    
    const total = charData.total;
    
    // Handle sparse format (new) vs dense format (legacy)
    let grid;
    if (gridData.sparse && charData.cells) {
      grid = sparseToDense(charData.cells, cols, rows);
    } else if (charData.grid) {
      grid = charData.grid;
    } else {
      return emptyGridResult(cols, rows);
    }
    
    // Compute distribution (normalize by total)
    const distribution = grid.map(row => 
      row.map(cell => total > 0 ? cell / total : 0)
    );
    
    return { 
      grid, 
      total, 
      distribution, 
      grid_cols: cols, 
      grid_rows: rows,
      absolute: gridData.absolute || false,
      max_x: gridData.max_x,
      max_y: gridData.max_y,
    };
  }
  
  /**
   * Legacy grid accessor for older data format without normalization modes.
   */
  function getCharGridLegacy(data, char, resolution) {
    const gridData = data.grids?.[resolution];
    if (!gridData) {
      return emptyGridResult(10, 15);
    }
    
    const charData = gridData.characters?.[char];
    const cols = gridData.grid_cols;
    const rows = gridData.grid_rows;
    
    if (!charData) {
      return emptyGridResult(cols, rows);
    }
    
    const total = charData.total;
    
    // Handle sparse format (new) vs dense format (legacy)
    let grid;
    if (gridData.sparse && charData.cells) {
      grid = sparseToDense(charData.cells, cols, rows);
    } else if (charData.grid) {
      grid = charData.grid;
    } else {
      return emptyGridResult(cols, rows);
    }
    
    const distribution = grid.map(row => 
      row.map(cell => total > 0 ? cell / total : 0)
    );
    
    return { 
      grid, 
      total, 
      distribution, 
      grid_cols: cols, 
      grid_rows: rows,
      absolute: gridData.absolute || false,
    };
  }
  
  /**
   * Create an empty grid result object.
   */
  function emptyGridResult(cols, rows, absolute = false) {
    return {
      grid: Array(rows).fill(null).map(() => Array(cols).fill(0)),
      total: 0,
      distribution: Array(rows).fill(null).map(() => Array(cols).fill(0)),
      grid_cols: cols,
      grid_rows: rows,
      absolute,
    };
  }
  
  /**
   * Get available grid resolutions from data.
   * @param {Object} data - Aggregation data or manifest
   * @returns {Object} Resolution info { name: { cols, rows } }
   */
  function getGridResolutions(data) {
    if (data.grid_resolutions) {
      return data.grid_resolutions;
    }
    // Try to extract from normalization_modes structure
    if (data.normalization_modes?.page) {
      const resolutions = {};
      for (const [name, gridData] of Object.entries(data.normalization_modes.page)) {
        resolutions[name] = {
          cols: gridData.grid_cols,
          rows: gridData.grid_rows,
        };
      }
      return resolutions;
    }
    // Legacy format
    if (data.grids) {
      const resolutions = {};
      for (const [name, gridData] of Object.entries(data.grids)) {
        resolutions[name] = {
          cols: gridData.grid_cols,
          rows: gridData.grid_rows,
        };
      }
      return resolutions;
    }
    return {};
  }
  
  /**
   * Get available normalization modes from data.
   * @param {Object} data - Aggregation data or manifest
   * @returns {Object} Normalization mode info
   */
  function getNormalizationModes(data) {
    if (data.normalization_modes && typeof data.normalization_modes === 'object') {
      // Manifest has detailed info
      if (data.normalization_modes.page?.name) {
        return data.normalization_modes;
      }
      // Aggregation data just has the modes as keys
      return {
        page: { name: 'Page-relative', description: 'Positions normalized within each page' },
        manuscript: { name: 'Manuscript-relative', description: 'Positions normalized to global max' },
      };
    }
    return {};
  }
  
  /**
   * Compute the difference between two aggregation grids for a character.
   * @param {Object} dataA - First aggregation data
   * @param {Object} dataB - Second aggregation data
   * @param {string} char - Character to compare
   * @param {string} resolution - Grid resolution
   * @param {string} normalization - Normalization mode
   * @returns {Object} Diff data with grid differences
   */
  function computeDiff(dataA, dataB, char, resolution = 'coarse', normalization = 'page') {
    const gridA = getCharGrid(dataA, char, resolution, normalization);
    const gridB = getCharGrid(dataB, char, resolution, normalization);
    
    const rows = gridA.grid_rows;
    const cols = gridA.grid_cols;
    
    const diffGrid = [];
    let maxAbsDiff = 0;
    
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const distA = gridA.distribution[r]?.[c] || 0;
        const distB = gridB.distribution[r]?.[c] || 0;
        const diff = distA - distB;
        row.push(diff);
        if (Math.abs(diff) > maxAbsDiff) {
          maxAbsDiff = Math.abs(diff);
        }
      }
      diffGrid.push(row);
    }
    
    return {
      diffGrid,
      maxAbsDiff,
      gridA,
      gridB,
      char,
      grid_cols: cols,
      grid_rows: rows,
      description: `${dataA.description} − ${dataB.description}`,
    };
  }
  
  /**
   * Clear the cache.
   */
  function clearCache() {
    cache.clear();
  }
  
  // Public API
  return {
    loadTranscriptionConfig,
    loadManifest,
    loadAggregation,
    getCharGrid,
    getGridResolutions,
    getNormalizationModes,
    computeDiff,
    clearCache,
  };
})();
