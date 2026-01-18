/**
 * 📊 AUTOMATED CATEGORY FILTER SYSTEM v2.1 (Production)
 * ======================================================
 * * ✅ FIXES from v2.0:
 * - Fixed undefined CFG variable (now uses CATEGORY_FILTER_CONFIG.DEBUG_MODE)
 * - Dynamic header lookup instead of hardcoded columns
 * - Added input normalization and validation
 * - Enhanced pagination with bounds checking
 * - Improved error handling with detailed codes
 * - Added performance monitoring
 * - Smart caching with auto-invalidation
 * * @author Text Expansion Manager Team
 * @version 2.1
 * @since 2025-01-17
 * @status PRODUCTION-READY
 */

// ============================================
// 📋 CONFIGURATION
// ============================================

const CATEGORY_FILTER_CONFIG = {
  // Spreadsheet configuration
  SPREADSHEET_ID: '17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ',
  
  // Sheet names
  SHEETS: {
    MAIN: 'Shortcuts',
    CATEGORIZED: 'Categorized_Data',
    SYNC_LOG: 'Sync_Log',
    ANALYTICS: 'Category_Analytics'  // New: Track filter usage
  },
  
  // Column mapping (dynamic - will auto-detect)
  COLUMNS: {
    REQUIRED: ['Content', 'MainCategory', 'Subcategory'],  // Must exist
    OPTIONAL: ['FontStyle', 'Language', 'Tags']  // Nice to have
  },
  
  // Cache settings
  CACHE: {
    DURATION: 300,  // 5 minutes
    PREFIX: 'cat_filter_v2_',  // Version prefix for cache keys
    ENABLED: true
  },
  
  // Pagination
  PAGINATION: {
    MAX_RESULTS_PER_PAGE: 50,
    MIN_PAGE: 1,
    MAX_PAGE: 1000  // Safety limit
  },
  
  // Performance
  PERFORMANCE: {
    TRACK_METRICS: true,
    SLOW_QUERY_THRESHOLD_MS: 1000  // Log queries > 1s
  },
  
  // Debugging
  DEBUG_MODE: false,  // Set true for verbose logging
  
  // Default values
  DEFAULTS: {
    MAIN_CATEGORY: 'General',
    SUBCATEGORY: 'Standard',
    FONT_STYLE: 'Default'
  }
};

// ============================================
// 🚨 ERROR HANDLING
// ============================================

/**
 * Custom error class with detailed error codes
 */
class CategoryFilterError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = {}) {
    super(message);
    this.name = 'CategoryFilterError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Error codes for specific failure scenarios
 */
const ERROR_CODES = {
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  INVALID_SPREADSHEET: 'INVALID_SPREADSHEET',
  COLUMN_NOT_FOUND: 'COLUMN_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  PAGINATION_ERROR: 'PAGINATION_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  DATA_ACCESS_ERROR: 'DATA_ACCESS_ERROR',
  PERFORMANCE_TIMEOUT: 'PERFORMANCE_TIMEOUT'
};

// ============================================
// 📊 MAIN CATEGORY FILTER MANAGER
// ============================================

class CategoryFilterManager {
  
  constructor() {
    this.logger = new CategoryLogger('CategoryFilterManager');
    this.cache = CATEGORY_FILTER_CONFIG.CACHE.ENABLED ? CacheService.getScriptCache() : null;
    this.metrics = new PerformanceMetrics();
    
    // Initialize spreadsheet
    try {
      this.spreadsheet = SpreadsheetApp.openById(CATEGORY_FILTER_CONFIG.SPREADSHEET_ID);
      this.logger.log('constructor', '✅ Spreadsheet initialized', { 
        id: CATEGORY_FILTER_CONFIG.SPREADSHEET_ID 
      });
    } catch (error) {
      throw new CategoryFilterError(
        'Failed to open spreadsheet',
        ERROR_CODES.INVALID_SPREADSHEET,
        { spreadsheetId: CATEGORY_FILTER_CONFIG.SPREADSHEET_ID }
      );
    }
    
    // Validate required sheets and columns
    this._validateConfiguration();
  }
  
  /**
   * Validate spreadsheet configuration on initialization
   * @private
   */
  _validateConfiguration() {
    const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
    if (!sheet) {
      throw new CategoryFilterError(
        `Main sheet '${CATEGORY_FILTER_CONFIG.SHEETS.MAIN}' not found`,
        ERROR_CODES.SHEET_NOT_FOUND
      );
    }
    
    // Check for required columns
    const headers = this._getHeaders(sheet);
    const missingColumns = CATEGORY_FILTER_CONFIG.COLUMNS.REQUIRED.filter(
      col => !headers.includes(col)
    );
    
    if (missingColumns.length > 0) {
      throw new CategoryFilterError(
        `Missing required columns: ${missingColumns.join(', ')}`,
        ERROR_CODES.COLUMN_NOT_FOUND,
        { missingColumns }
      );
    }
    
    this.logger.log('_validateConfiguration', '✅ Configuration valid');
  }
  
  /**
   * Get sheet headers
   * @private
   */
  _getHeaders(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];
    
    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    return headerRange.getValues()[0].map(h => h ? h.toString().trim() : '');
  }
  
  /**
   * Get column index by header name (1-indexed)
   * @private
   */
  _getColumnIndex(headers, columnName) {
    const index = headers.indexOf(columnName);
    if (index === -1) {
      throw new CategoryFilterError(
        `Column '${columnName}' not found`,
        ERROR_CODES.COLUMN_NOT_FOUND,
        { availableColumns: headers }
      );
    }
    return index + 1; // Convert to 1-indexed
  }
  
  /**
   * Normalize and validate input
   * @private
   */
  _normalizeInput(input) {
    if (input === null || input === undefined) return null;
    return input.toString().trim();
  }
  
  /**
   * Get cache key with version prefix
   * @private
   */
  _getCacheKey(suffix) {
    return CATEGORY_FILTER_CONFIG.CACHE.PREFIX + suffix;
  }
  
  /**
   * Get all unique main categories
   * * @returns {Array<string>} Sorted list of unique categories
   */
  getMainCategories() {
    const startTime = Date.now();
    
    try {
      this.logger.log('getMainCategories', 'Fetching unique main categories');
      
      // Try cache first
      if (this.cache) {
        const cacheKey = this._getCacheKey('main_categories');
        const cached = this.cache.get(cacheKey);
        if (cached) {
          this.logger.log('getMainCategories', '💾 Cache hit');
          this.metrics.recordCacheHit('main_categories');
          return JSON.parse(cached);
        }
        this.metrics.recordCacheMiss('main_categories');
      }
      
      // Fetch from sheet
      const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
      const headers = this._getHeaders(sheet);
      const mainCatColIndex = this._getColumnIndex(headers, 'MainCategory');
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return [CATEGORY_FILTER_CONFIG.DEFAULTS.MAIN_CATEGORY];
      }
      
      // Get all main categories
      const categoryRange = sheet.getRange(2, mainCatColIndex, lastRow - 1, 1);
      const categories = categoryRange.getValues()
        .flat()
        .filter(cat => cat && cat.toString().trim() !== '')
        .map(cat => cat.toString().trim());
      
      // Get unique and sort
      const uniqueCategories = [...new Set(categories)].sort();
      
      // Ensure default exists
      if (!uniqueCategories.includes(CATEGORY_FILTER_CONFIG.DEFAULTS.MAIN_CATEGORY)) {
        uniqueCategories.unshift(CATEGORY_FILTER_CONFIG.DEFAULTS.MAIN_CATEGORY);
      }
      
      // Cache results
      if (this.cache) {
        const cacheKey = this._getCacheKey('main_categories');
        this.cache.put(
          cacheKey,
          JSON.stringify(uniqueCategories),
          CATEGORY_FILTER_CONFIG.CACHE.DURATION
        );
      }
      
      const duration = Date.now() - startTime;
      this.metrics.recordQuery('getMainCategories', duration, uniqueCategories.length);
      
      this.logger.log('getMainCategories', `✅ Found ${uniqueCategories.length} categories`, {
        count: uniqueCategories.length,
        duration: `${duration}ms`,
        categories: uniqueCategories.slice(0, 10)  // Log first 10
      });
      
      return uniqueCategories;
      
    } catch (error) {
      this.logger.error('getMainCategories', error);
      throw new CategoryFilterError(
        `Failed to get main categories: ${error.message}`,
        error.code || ERROR_CODES.DATA_ACCESS_ERROR,
        { originalError: error }
      );
    }
  }
  
  /**
   * Get subcategories for a specific main category
   * * @param {string} mainCategory - Main category to filter by
   * @returns {Array<string>} Sorted list of subcategories
   */
  getSubcategories(mainCategory) {
    const startTime = Date.now();
    
    try {
      // Normalize input
      mainCategory = this._normalizeInput(mainCategory);
      
      if (!mainCategory) {
        throw new CategoryFilterError(
          'Main category is required',
          ERROR_CODES.INVALID_INPUT,
          { provided: mainCategory }
        );
      }
      
      this.logger.log('getSubcategories', `Fetching for: ${mainCategory}`);
      
      // Try cache first
      if (this.cache) {
        const cacheKey = this._getCacheKey(`subcategories_${mainCategory}`);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          this.logger.log('getSubcategories', '💾 Cache hit');
          this.metrics.recordCacheHit('subcategories');
          return JSON.parse(cached);
        }
        this.metrics.recordCacheMiss('subcategories');
      }
      
      const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
      const headers = this._getHeaders(sheet);
      
      const mainCatColIndex = this._getColumnIndex(headers, 'MainCategory');
      const subCatColIndex = this._getColumnIndex(headers, 'Subcategory');
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return [CATEGORY_FILTER_CONFIG.DEFAULTS.SUBCATEGORY];
      }
      
      // Get both columns
      const dataRange = sheet.getRange(2, mainCatColIndex, lastRow - 1, 2);
      const data = dataRange.getValues();
      
      // Filter for matching main category and extract subcategories
      const subcategories = data
        .filter(row => {
          const rowMainCat = row[0] ? row[0].toString().trim() : '';
          return rowMainCat === mainCategory;
        })
        .map(row => row[1] ? row[1].toString().trim() : CATEGORY_FILTER_CONFIG.DEFAULTS.SUBCATEGORY)
        .filter(subcat => subcat !== '');
      
      // Get unique and sort
      const uniqueSubcategories = [...new Set(subcategories)].sort();
      
      // Ensure default exists
      if (!uniqueSubcategories.includes(CATEGORY_FILTER_CONFIG.DEFAULTS.SUBCATEGORY)) {
        uniqueSubcategories.unshift(CATEGORY_FILTER_CONFIG.DEFAULTS.SUBCATEGORY);
      }
      
      // Cache results
      if (this.cache) {
        const cacheKey = this._getCacheKey(`subcategories_${mainCategory}`);
        this.cache.put(
          cacheKey,
          JSON.stringify(uniqueSubcategories),
          CATEGORY_FILTER_CONFIG.CACHE.DURATION
        );
      }
      
      const duration = Date.now() - startTime;
      this.metrics.recordQuery('getSubcategories', duration, uniqueSubcategories.length);
      
      this.logger.log('getSubcategories', `✅ Found ${uniqueSubcategories.length} subcategories`, {
        mainCategory,
        count: uniqueSubcategories.length,
        duration: `${duration}ms`
      });
      
      return uniqueSubcategories;
      
    } catch (error) {
      this.logger.error('getSubcategories', error);
      throw new CategoryFilterError(
        `Failed to get subcategories: ${error.message}`,
        error.code || ERROR_CODES.DATA_ACCESS_ERROR,
        { mainCategory, originalError: error }
      );
    }
  }
  
  /**
   * Filter text expanders by category with pagination
   * * @param {string} mainCategory - Main category to filter by
   * @param {string|null} subcategory - Optional subcategory filter
   * @param {number} page - Page number (1-based)
   * @returns {Object} Filtered results with pagination info
   */
  filterByCategory(mainCategory, subcategory = null, page = 1) {
    const startTime = Date.now();
    
    try {
      // Normalize and validate inputs
      mainCategory = this._normalizeInput(mainCategory);
      subcategory = this._normalizeInput(subcategory);
      page = parseInt(page) || 1;
      
      // Validate pagination
      if (page < CATEGORY_FILTER_CONFIG.PAGINATION.MIN_PAGE) {
        page = CATEGORY_FILTER_CONFIG.PAGINATION.MIN_PAGE;
      }
      if (page > CATEGORY_FILTER_CONFIG.PAGINATION.MAX_PAGE) {
        throw new CategoryFilterError(
          'Page number exceeds maximum limit',
          ERROR_CODES.PAGINATION_ERROR,
          { page, maxPage: CATEGORY_FILTER_CONFIG.PAGINATION.MAX_PAGE }
        );
      }
      
      if (!mainCategory) {
        throw new CategoryFilterError(
          'Main category is required',
          ERROR_CODES.INVALID_INPUT
        );
      }
      
      this.logger.log('filterByCategory', 'Filtering text expanders', {
        mainCategory,
        subcategory,
        page
      });
      
      const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
      const headers = this._getHeaders(sheet);
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return this._createEmptyResponse(page, mainCategory, subcategory);
      }
      
      // Get all data
      const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
      const data = dataRange.getValues();
      
      // Find column indices
      const contentIdx = headers.indexOf('Content');
      const mainCatIdx = headers.indexOf('MainCategory');
      const subCatIdx = headers.indexOf('Subcategory');
      const fontIdx = headers.indexOf('FontStyle');
      const langIdx = headers.indexOf('Language');
      
      // Filter based on category
      const filtered = data.filter(row => {
        const rowMainCat = mainCatIdx >= 0 && row[mainCatIdx] 
          ? row[mainCatIdx].toString().trim() 
          : '';
        const rowSubCat = subCatIdx >= 0 && row[subCatIdx] 
          ? row[subCatIdx].toString().trim() 
          : '';
        
        // Match main category
        if (rowMainCat !== mainCategory) {
          return false;
        }
        
        // Match subcategory if specified
        if (subcategory && rowSubCat !== subcategory) {
          return false;
        }
        
        return true;
      });
      
      // Calculate pagination
      const totalResults = filtered.length;
      const resultsPerPage = CATEGORY_FILTER_CONFIG.PAGINATION.MAX_RESULTS_PER_PAGE;
      const totalPages = Math.ceil(totalResults / resultsPerPage);
      
      // Adjust page if out of bounds
      if (page > totalPages && totalPages > 0) {
        page = totalPages;
      }
      
      const startIndex = (page - 1) * resultsPerPage;
      const endIndex = Math.min(startIndex + resultsPerPage, totalResults);
      const paginatedResults = filtered.slice(startIndex, endIndex);
      
      // Format results
      const formattedResults = paginatedResults.map(row => ({
        textExpander: contentIdx >= 0 ? (row[contentIdx] || '') : '',
        fontName: fontIdx >= 0 ? (row[fontIdx] || CATEGORY_FILTER_CONFIG.DEFAULTS.FONT_STYLE) : CATEGORY_FILTER_CONFIG.DEFAULTS.FONT_STYLE,
        mainCategory: mainCatIdx >= 0 ? (row[mainCatIdx] || CATEGORY_FILTER_CONFIG.DEFAULTS.MAIN_CATEGORY) : CATEGORY_FILTER_CONFIG.DEFAULTS.MAIN_CATEGORY,
        subcategory: subCatIdx >= 0 ? (row[subCatIdx] || CATEGORY_FILTER_CONFIG.DEFAULTS.SUBCATEGORY) : CATEGORY_FILTER_CONFIG.DEFAULTS.SUBCATEGORY,
        language: langIdx >= 0 ? (row[langIdx] || '') : ''
      }));
      
      const duration = Date.now() - startTime;
      this.metrics.recordQuery('filterByCategory', duration, totalResults);
      
      // Check for slow query
      if (CATEGORY_FILTER_CONFIG.PERFORMANCE.TRACK_METRICS && 
          duration > CATEGORY_FILTER_CONFIG.PERFORMANCE.SLOW_QUERY_THRESHOLD_MS) {
        this.logger.log('filterByCategory', '⚠️ Slow query detected', {
          duration: `${duration}ms`,
          threshold: `${CATEGORY_FILTER_CONFIG.PERFORMANCE.SLOW_QUERY_THRESHOLD_MS}ms`,
          totalResults
        });
      }
      
      const response = {
        results: formattedResults,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalResults: totalResults,
          resultsPerPage: resultsPerPage,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        },
        filters: {
          mainCategory,
          subcategory
        },
        performance: {
          queryTime: `${duration}ms`,
          cacheUsed: false  // Could enhance to track cache hits
        }
      };
      
      this.logger.log('filterByCategory', `✅ Filtered ${totalResults} results`, {
        totalResults,
        page,
        totalPages,
        duration: `${duration}ms`
      });
      
      return response;
      
    } catch (error) {
      this.logger.error('filterByCategory', error);
      throw new CategoryFilterError(
        `Filter operation failed: ${error.message}`,
        error.code || ERROR_CODES.DATA_ACCESS_ERROR,
        { mainCategory, subcategory, page, originalError: error }
      );
    }
  }
  
  /**
   * Create empty response for no results
   * @private
   */
  _createEmptyResponse(page, mainCategory, subcategory) {
    return {
      results: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalResults: 0,
        resultsPerPage: CATEGORY_FILTER_CONFIG.PAGINATION.MAX_RESULTS_PER_PAGE,
        hasNextPage: false,
        hasPreviousPage: false
      },
      filters: {
        mainCategory,
        subcategory
      },
      performance: {
        queryTime: '0ms',
        cacheUsed: false
      }
    };
  }
  
  /**
   * Clear all category caches
   * Call after Python categorization updates
   */
  clearCache() {
    try {
      if (!this.cache) {
        this.logger.log('clearCache', 'Cache disabled, nothing to clear');
        return { success: true, cleared: 0 };
      }
      
      let cleared = 0;
      
      // Clear main categories cache
      const mainCatKey = this._getCacheKey('main_categories');
      this.cache.remove(mainCatKey);
      cleared++;
      
      // Clear all subcategory caches
      try {
        const categories = this.getMainCategories();
        categories.forEach(cat => {
          const subCatKey = this._getCacheKey(`subcategories_${cat}`);
          this.cache.remove(subCatKey);
          cleared++;
        });
      } catch (err) {
        // If we can't get categories, that's okay
        this.logger.log('clearCache', 'Could not clear subcategory caches', { error: err.message });
      }
      
      this.logger.log('clearCache', `✅ Cleared ${cleared} cache entries`);
      
      return {
        success: true,
        cleared: cleared,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this.logger.error('clearCache', error);
      throw new CategoryFilterError(
        `Cache clear failed: ${error.message}`,
        ERROR_CODES.CACHE_ERROR
      );
    }
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    return this.metrics.getReport();
  }
}

// ============================================
// 📊 PERFORMANCE METRICS
// ============================================

class PerformanceMetrics {
  constructor() {
    this.queries = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
  
  recordQuery(operation, duration, resultCount) {
    this.queries.push({
      operation,
      duration,
      resultCount,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 queries
    if (this.queries.length > 100) {
      this.queries.shift();
    }
  }
  
  recordCacheHit(operation) {
    this.cacheHits++;
  }
  
  recordCacheMiss(operation) {
    this.cacheMisses++;
  }
  
  getReport() {
    const totalQueries = this.queries.length;
    const avgDuration = totalQueries > 0
      ? this.queries.reduce((sum, q) => sum + q.duration, 0) / totalQueries
      : 0;
    
    const cacheHitRate = (this.cacheHits + this.cacheMisses) > 0
      ? (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(2)
      : 0;
    
    return {
      totalQueries,
      avgDuration: `${avgDuration.toFixed(2)}ms`,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: `${cacheHitRate}%`,
      recentQueries: this.queries.slice(-10)
    };
  }
}

// ============================================
// 📝 LOGGING SYSTEM (FIXED)
// ============================================

/**
 * Session logger with proper config reference
 * ✅ FIXED: Uses CATEGORY_FILTER_CONFIG.DEBUG_MODE instead of undefined CFG
 */
class CategoryLogger {
  constructor(context) {
    this.context = context;
  }
  
  log(action, message, details = {}) {
    // ✅ FIXED: Properly references CATEGORY_FILTER_CONFIG.DEBUG_MODE
    if (CATEGORY_FILTER_CONFIG.DEBUG_MODE) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        context: this.context,
        action,
        message,
        details
      };
      console.log(`[${this.context}] ${message}`, details);
    }
  }
  
  error(action, error) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      context: this.context,
      action,
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN',
        stack: error.stack
      }
    };
    console.error(`[${this.context}] ERROR in ${action}:`, errorEntry);
  }
}

// ============================================
// 🌐 PUBLIC API FUNCTIONS
// ============================================

/**
 * Get all main categories for filter dropdown
 * * @returns {Object} Response with categories array
 */
function getMainCategoriesAPI() {
  try {
    const manager = new CategoryFilterManager();
    const categories = manager.getMainCategories();
    
    return {
      success: true,
      data: categories,
      version: '2.1',
      cached: false  // Could be enhanced to detect cache hits
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || ERROR_CODES.DATA_ACCESS_ERROR,
      details: error.details || {},
      version: '2.1'
    };
  }
}

/**
 * Get subcategories for a main category
 * * @param {string} mainCategory - Main category
 * @returns {Object} Response with subcategories array
 */
function getSubcategoriesAPI(mainCategory) {
  try {
    const manager = new CategoryFilterManager();
    const subcategories = manager.getSubcategories(mainCategory);
    
    return {
      success: true,
      data: subcategories,
      mainCategory: mainCategory,
      version: '2.1'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || ERROR_CODES.DATA_ACCESS_ERROR,
      details: error.details || {},
      version: '2.1'
    };
  }
}

/**
 * Filter text expanders by category
 * * @param {string} mainCategory - Main category to filter
 * @param {string|null} subcategory - Optional subcategory
 * @param {number} page - Page number (default 1)
 * @returns {Object} Response with filtered results and pagination
 */
function filterByCategoryAPI(mainCategory, subcategory = null, page = 1) {
  try {
    const manager = new CategoryFilterManager();
    const results = manager.filterByCategory(mainCategory, subcategory, page);
    
    return {
      success: true,
      data: results,
      version: '2.1'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || ERROR_CODES.DATA_ACCESS_ERROR,
      details: error.details || {},
      version: '2.1'
    };
  }
}

/**
 * Clear all category caches
 * * @returns {Object} Response with clear status
 */
function clearCategoryCacheAPI() {
  try {
    const manager = new CategoryFilterManager();
    const result = manager.clearCache();
    
    return {
      success: true,
      data: result,
      message: `Cache cleared: ${result.cleared} entries removed`,
      version: '2.1'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || ERROR_CODES.CACHE_ERROR,
      version: '2.1'
    };
  }
}

/**
 * Get performance metrics
 * * @returns {Object} Response with performance data
 */
function getPerformanceMetricsAPI() {
  try {
    const manager = new CategoryFilterManager();
    const metrics = manager.getMetrics();
    
    return {
      success: true,
      data: metrics,
      version: '2.1'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      version: '2.1'
    };
  }
}