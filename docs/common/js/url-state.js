/**
 * URL state management for deep linking.
 * Handles reading/writing state to URL hash for shareable links.
 */

const UrlState = (function() {
  
  /**
   * Parse URL hash into an object of parameters.
   * @param {string} [hash] - Hash string (defaults to current window hash)
   * @returns {Object} Parsed parameters
   */
  function parse(hash) {
    const hashStr = hash !== undefined ? hash : window.location.hash;
    const params = {};
    
    if (!hashStr || hashStr.length <= 1) {
      return params;
    }
    
    const queryStr = hashStr.substring(1);
    const pairs = queryStr.split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
      }
    }
    
    return params;
  }
  
  /**
   * Stringify an object of parameters to a hash string.
   * @param {Object} params - Parameters to encode
   * @returns {string} Hash string (without #)
   */
  function stringify(params) {
    const pairs = [];
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    
    return pairs.join('&');
  }
  
  /**
   * Update the URL hash without triggering a page reload.
   * @param {Object} params - Parameters to set
   * @param {boolean} [replace=false] - Use replaceState instead of pushState
   */
  function update(params, replace = false) {
    const hash = stringify(params);
    const newUrl = hash ? `#${hash}` : window.location.pathname + window.location.search;
    
    if (replace) {
      history.replaceState(null, '', newUrl);
    } else {
      history.pushState(null, '', newUrl);
    }
  }
  
  /**
   * Merge new parameters into the current URL hash.
   * @param {Object} newParams - Parameters to merge
   * @param {boolean} [replace=false] - Use replaceState instead of pushState
   */
  function merge(newParams, replace = false) {
    const current = parse();
    const merged = { ...current, ...newParams };
    
    for (const key of Object.keys(merged)) {
      if (merged[key] === null || merged[key] === undefined || merged[key] === '') {
        delete merged[key];
      }
    }
    
    update(merged, replace);
  }
  
  /**
   * Get a specific parameter from the URL hash.
   * @param {string} key - Parameter key
   * @param {*} [defaultValue] - Default value if not found
   * @returns {string|*} Parameter value or default
   */
  function get(key, defaultValue) {
    const params = parse();
    return params[key] !== undefined ? params[key] : defaultValue;
  }
  
  /**
   * Convert boolean-like URL values to actual booleans.
   * @param {string} value - URL value
   * @param {boolean} [defaultValue=false] - Default if value is empty
   * @returns {boolean}
   */
  function toBool(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    return value === '1' || value === 'true' || value === 'yes';
  }
  
  /**
   * Convert boolean to URL-friendly string.
   * @param {boolean} value
   * @returns {string}
   */
  function fromBool(value) {
    return value ? '1' : '0';
  }
  
  /**
   * Notify the parent frame of state changes (for iframe coordination).
   * @param {Object} state - Current state to report
   */
  function notifyParent(state) {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'voynich-state-change',
          state: state
        }, '*');
      } catch (e) {
        // Cross-origin restriction - ignore
      }
    }
  }
  
  /**
   * Listen for state change messages from child frames.
   * @param {Function} callback - Called with state object when child reports changes
   * @returns {Function} Cleanup function to remove listener
   */
  function onChildStateChange(callback) {
    const handler = (event) => {
      if (event.data && event.data.type === 'voynich-state-change') {
        callback(event.data.state);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
  
  /**
   * Check if we're running inside an iframe.
   * @returns {boolean}
   */
  function isInIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }
  
  return {
    parse,
    stringify,
    update,
    merge,
    get,
    toBool,
    fromBool,
    notifyParent,
    onChildStateChange,
    isInIframe,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UrlState;
}
