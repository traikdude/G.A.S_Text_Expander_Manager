/**
 * Automated Category Filter System v2.1 (Debugged + Hardened)
 *
 * ✅ Fixes:
 * - Removes undefined CFG reference (prevents ReferenceError)
 * - Validates required headers before using getRange()
 * - Handles non-adjacent MainCategory/Subcategory columns safely
 * - Adds input normalization, pagination guards, and safer cache keys
 *
 * @author G.A.S
 * @version 2.1
 * @since 2026-01-07
 */

/**
 * Configuration object for category filtering system
 */
const CATEGORY_FILTER_CONFIG = {
  SPREADSHEET_ID: '17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ',
  SHEETS: {
    MAIN: 'Shortcuts',
    CATEGORIZED: 'Categorized_Data',
    SYNC_LOG: 'Sync_Log'
  },

  /**
   * Header names expected in row 1 of the MAIN sheet 📌
   * Change these ONLY if your sheet headers are different.
   */
  HEADERS: {
    CONTENT: 'Content',
    FONT_STYLE: 'FontStyle',
    MAIN_CATEGORY: 'MainCategory',
    SUBCATEGORY: 'Subcategory'
  },

  CACHE_DURATION: 300, // 5 minutes
  MAX_RESULTS_PER_PAGE: 50,

  // Turn debug logs on/off 😎
  DEBUG_MODE: true
};

/**
 * Custom error class for category filtering operations
 */
class CategoryFilterError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = null) {
    super(message);
    this.name = 'CategoryFilterError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Simple session logger for debugging
 */
class CategorySessionLogger {
  constructor(context) {
    this.context = context;
  }

  log(action, message, details = {}) {
    if (!CATEGORY_FILTER_CONFIG.DEBUG_MODE) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      context: this.context,
      action,
      message,
      details
    };
    console.log(JSON.stringify(logEntry));
  }

  error(action, error, details = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      context: this.context,
      action,
      details,
      error: {
        name: error && error.name,
        message: error && error.message,
        code: error && error.code ? error.code : 'UNKNOWN',
        stack: error && error.stack
      }
    };
    console.error(JSON.stringify(errorEntry));
  }
}

/**
 * Main Category Filter Manager Class
 * Handles all filtering operations using automated Python-generated categories.
 */
class CategoryFilterManager {
  constructor() {
    this.spreadsheet = SpreadsheetApp.openById(CATEGORY_FILTER_CONFIG.SPREADSHEET_ID);
    this.cache = CacheService.getScriptCache();
    this.logger = new CategorySessionLogger('CategoryFilterManager');
  }

  /**
   * Get all unique categories from MainCategory header column
   *
   * @param {Object} options
   * @param {boolean} options.bypassCache - If true, skip cache read/write
   * @returns {Array<string>} List of unique main categories
   */
  getMainCategories(options = {}) {
    const bypassCache = !!options.bypassCache;

    try {
      this.logger.log('getMainCategories', 'Fetching unique main categories', { bypassCache });

      const cacheKey = this._makeCacheKey_('main_categories', '');
      if (!bypassCache) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          this.logger.log('getMainCategories', 'Returning cached categories');
          return JSON.parse(cached);
        }
      }

      const sheet = this._getMainSheet_();
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ['General'];
      }

      const headers = this._getHeaders_(sheet);
      const mainCatIdx0 = this._getHeaderIndexOrThrow_(headers, CATEGORY_FILTER_CONFIG.HEADERS.MAIN_CATEGORY); // 0-based

      const categoryRange = sheet.getRange(2, mainCatIdx0 + 1, lastRow - 1, 1);
      const categories = categoryRange
        .getValues()
        .flat()
        .map(v => (v === null || v === undefined) ? '' : String(v).trim())
        .filter(v => v !== '');

      const uniqueCategories = [...new Set(categories)].sort();

      if (!bypassCache) {
        this.cache.put(cacheKey, JSON.stringify(uniqueCategories), CATEGORY_FILTER_CONFIG.CACHE_DURATION);
      }

      this.logger.log('getMainCategories', `Found ${uniqueCategories.length} unique categories`, {
        count: uniqueCategories.length
      });

      return uniqueCategories;
    } catch (error) {
      this.logger.error('getMainCategories', error);

      if (error instanceof CategoryFilterError) throw error;
      throw new CategoryFilterError(
        `Failed to get main categories: ${error.message}`,
        'GET_CATEGORIES_FAILED'
      );
    }
  }

  /**
   * Get subcategories for a specific main category
   *
   * @param {string} mainCategory - The main category to filter by
   * @param {Object} options
   * @param {boolean} options.bypassCache - If true, skip cache read/write
   * @returns {Array<string>} List of subcategories
   */
  getSubcategories(mainCategory, options = {}) {
    const bypassCache = !!options.bypassCache;

    try {
      const normalizedMain = this._normalizeText_(mainCategory);
      if (!normalizedMain) {
        throw new CategoryFilterError('mainCategory is required', 'INVALID_ARGUMENT', { mainCategory });
      }

      this.logger.log('getSubcategories', `Fetching subcategories for: ${normalizedMain}`, { bypassCache });

      const cacheKey = this._makeCacheKey_('subcategories', normalizedMain);
      if (!bypassCache) {
        const cached = this.cache.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }

      const sheet = this._getMainSheet_();
      const lastRow = sheet.getLastRow();

      if (lastRow < 2) {
        return ['Standard'];
      }

      const headers = this._getHeaders_(sheet);
      const mainIdx0 = this._getHeaderIndexOrThrow_(headers, CATEGORY_FILTER_CONFIG.HEADERS.MAIN_CATEGORY);
      const subIdx0 = this._getHeaderIndexOrThrow_(headers, CATEGORY_FILTER_CONFIG.HEADERS.SUBCATEGORY);

      // Fetch a range that spans BOTH columns even if not adjacent ✅
      const startCol = Math.min(mainIdx0, subIdx0) + 1; // to 1-based
      const endCol = Math.max(mainIdx0, subIdx0) + 1;
      const width = endCol - startCol + 1;

      const data = sheet.getRange(2, startCol, lastRow - 1, width).getValues();

      const mainOffset = (mainIdx0 + 1) - startCol; // within fetched range
      const subOffset = (subIdx0 + 1) - startCol;

      const subcategories = data
        .filter(row => this._normalizeText_(row[mainOffset]) === normalizedMain)
        .map(row => this._normalizeText_(row[subOffset]) || 'Standard')
        .filter(v => v !== '');

      const uniqueSubcategories = [...new Set(subcategories)].sort();

      if (!bypassCache) {
        this.cache.put(cacheKey, JSON.stringify(uniqueSubcategories), CATEGORY_FILTER_CONFIG.CACHE_DURATION);
      }

      this.logger.log('getSubcategories', `Found ${uniqueSubcategories.length} subcategories`, {
        mainCategory: normalizedMain,
        count: uniqueSubcategories.length
      });

      return uniqueSubcategories;
    } catch (error) {
      this.logger.error('getSubcategories', error, { mainCategory });

      if (error instanceof CategoryFilterError) throw error;
      throw new CategoryFilterError(
        `Failed to get subcategories: ${error.message}`,
        'GET_SUBCATEGORIES_FAILED',
        { mainCategory }
      );
    }
  }

  /**
   * Filter text expanders by category and optional subcategory
   *
   * @param {string} mainCategory - Main category to filter by
   * @param {string|null} subcategory - Optional subcategory filter
   * @param {number} page - Page number for pagination (1-based)
   * @returns {Object} Filtered results with pagination info
   */
  filterByCategory(mainCategory, subcategory = null, page = 1) {
    try {
      const normalizedMain = this._normalizeText_(mainCategory);
      const normalizedSub = subcategory ? this._normalizeText_(subcategory) : null;

      if (!normalizedMain) {
        throw new CategoryFilterError('mainCategory is required', 'INVALID_ARGUMENT', { mainCategory });
      }

      const safePage = this._toPositiveInt_(page, 1);

      this.logger.log('filterByCategory', 'Filtering text expanders', {
        mainCategory: normalizedMain,
        subcategory: normalizedSub,
        page: safePage
      });

      const sheet = this._getMainSheet_();
      const lastRow = sheet.getLastRow();

      if (lastRow < 2) {
        return this._emptyPagedResponse_(normalizedMain, normalizedSub, safePage);
      }

      const lastCol = sheet.getLastColumn();
      const headers = this._getHeaders_(sheet);

      const contentIdx0 = this._getHeaderIndexOrThrow_(headers, CATEGORY_FILTER_CONFIG.HEADERS.CONTENT);
      const fontIdx0 = this._getHeaderIndex_(headers, CATEGORY_FILTER_CONFIG.HEADERS.FONT_STYLE); // optional
      const mainIdx0 = this._getHeaderIndexOrThrow_(headers, CATEGORY_FILTER_CONFIG.HEADERS.MAIN_CATEGORY);
      const subIdx0 = this._getHeaderIndexOrThrow_(headers, CATEGORY_FILTER_CONFIG.HEADERS.SUBCATEGORY);

      const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      const filtered = data.filter(row => {
        const rowMain = this._normalizeText_(row[mainIdx0]);
        if (rowMain !== normalizedMain) return false;

        if (normalizedSub) {
          const rowSub = this._normalizeText_(row[subIdx0]);
          return rowSub === normalizedSub;
        }
        return true;
      });

      const totalResults = filtered.length;
      const resultsPerPage = CATEGORY_FILTER_CONFIG.MAX_RESULTS_PER_PAGE;
      const totalPages = Math.ceil(totalResults / resultsPerPage);

      // Clamp page into valid range 📌
      const finalPage = totalPages === 0 ? 1 : Math.min(safePage, totalPages);

      const startIndex = (finalPage - 1) * resultsPerPage;
      const endIndex = startIndex + resultsPerPage;
      const paginatedResults = filtered.slice(startIndex, endIndex);

      const formattedResults = paginatedResults.map(row => ({
        textExpander: row[contentIdx0] || '',
        fontName: fontIdx0 >= 0 ? (row[fontIdx0] || 'Default') : 'Default',
        mainCategory: row[mainIdx0] || 'General',
        subcategory: row[subIdx0] || 'Standard'
      }));

      const response = {
        results: formattedResults,
        pagination: {
          currentPage: finalPage,
          totalPages: totalPages,
          totalResults: totalResults,
          resultsPerPage: resultsPerPage
        },
        filters: {
          mainCategory: normalizedMain,
          subcategory: normalizedSub
        }
      };

      this.logger.log('filterByCategory', `Filtered ${totalResults} results`, {
        totalResults,
        currentPage: finalPage,
        totalPages
      });

      return response;
    } catch (error) {
      this.logger.error('filterByCategory', error, { mainCategory, subcategory, page });

      if (error instanceof CategoryFilterError) throw error;
      throw new CategoryFilterError(
        `Filter operation failed: ${error.message}`,
        'FILTER_FAILED',
        { mainCategory, subcategory, page }
      );
    }
  }

  /**
   * Invalidate all category caches
   * Call this after Python categorization updates
   */
  clearCache() {
    try {
      this.logger.log('clearCache', 'Clearing category caches');

      // Clear main cache
      this.cache.remove(this._makeCacheKey_('main_categories', ''));

      // Clear subcategory caches based on fresh categories (bypass cache)
      const categories = this.getMainCategories({ bypassCache: true });
      categories.forEach(cat => {
        this.cache.remove(this._makeCacheKey_('subcategories', cat));
      });

      this.logger.log('clearCache', 'All category caches cleared', { categoryCount: categories.length });
    } catch (error) {
      this.logger.error('clearCache', error);
      // Do not rethrow: cache clears shouldn't crash app
    }
  }

  // ===========================================================================
  // Private Helpers 🧰
  // ===========================================================================

  _getMainSheet_() {
    const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
    if (!sheet) {
      throw new CategoryFilterError(
        `Main sheet "${CATEGORY_FILTER_CONFIG.SHEETS.MAIN}" not found`,
        'SHEET_NOT_FOUND'
      );
    }
    return sheet;
  }

  _getHeaders_(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      throw new CategoryFilterError('Sheet has no columns', 'INVALID_SHEET');
    }
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    return headers.map(h => (h === null || h === undefined) ? '' : String(h).trim());
  }

  _getHeaderIndex_(headers, headerName) {
    return headers.indexOf(headerName); // 0-based, -1 if not found
  }

  _getHeaderIndexOrThrow_(headers, headerName) {
    const idx0 = headers.indexOf(headerName);
    if (idx0 < 0) {
      throw new CategoryFilterError(
        `Required header "${headerName}" not found in row 1`,
        'HEADER_NOT_FOUND',
        { headerName, headers }
      );
    }
    return idx0;
  }

  _normalizeText_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  _toPositiveInt_(value, fallback) {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) return n;
    return fallback;
  }

  _makeCacheKey_(prefix, value) {
    // Cache keys must be <= 250 chars. We'll keep them short + safe ✅
    const raw = `${prefix}::${value || ''}`;
    const encoded = Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
    // Prefix for readability + clamp length
    const finalKey = `cf_${encoded}`;
    return finalKey.length > 240 ? finalKey.slice(0, 240) : finalKey;
  }

  _emptyPagedResponse_(mainCategory, subcategory, page) {
    return {
      results: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalResults: 0,
        resultsPerPage: CATEGORY_FILTER_CONFIG.MAX_RESULTS_PER_PAGE
      },
      filters: { mainCategory, subcategory }
    };
  }
}

// ============================================================================
// API Functions - Called from web app frontend 🌐
// ============================================================================

/**
 * Get all main categories for filter dropdown
 */
function getMainCategoriesAPI() {
  try {
    const manager = new CategoryFilterManager();
    const categories = manager.getMainCategories();
    return { success: true, data: categories };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      details: error.details || null
    };
  }
}

/**
 * Get subcategories for a main category
 *
 * @param {string} mainCategory - Main category
 */
function getSubcategoriesAPI(mainCategory) {
  try {
    const manager = new CategoryFilterManager();
    const subcategories = manager.getSubcategories(mainCategory);
    return { success: true, data: subcategories };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      details: error.details || null
    };
  }
}

/**
 * Filter text expanders by category
 *
 * @param {string} mainCategory - Main category to filter
 * @param {string|null} subcategory - Optional subcategory
 * @param {number} page - Page number (default 1)
 */
function filterByCategoryAPI(mainCategory, subcategory = null, page = 1) {
  try {
    const manager = new CategoryFilterManager();
    const results = manager.filterByCategory(mainCategory, subcategory, page);
    return { success: true, data: results };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      details: error.details || null
    };
  }
}

/**
 * Clear all category caches
 * Call after Python script updates categories
 */
function clearCategoryCacheAPI() {
  try {
    const manager = new CategoryFilterManager();
    manager.clearCache();
    return { success: true, message: 'Category cache cleared successfully ✅' };
  } catch (error) {
    return { success: false, error: error.message, code: error.code || 'UNKNOWN_ERROR' };
  }
}
