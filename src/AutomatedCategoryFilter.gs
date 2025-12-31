/**
 * Automated Category Filter System v2.0
 * 
 * Leverages Main_Category and Subcategory columns instead of manual Description dropdown.
 * Eliminates manual categorization workflow and uses Python-generated NLP categories.
 * 
 * @author G.A.S Text Expander Manager Team
 * @version 2.0
 * @since 2025-12-30
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
  COLUMNS: {
    TEXT_EXPANDER: 'B',      // Column containing text expander
    FONT_NAME: 'C',          // Column containing font name
    MAIN_CATEGORY: 'D',      // Python-generated main category
    SUBCATEGORY: 'E',        // Python-generated subcategory
    OLD_DESCRIPTION: 'F'     // Old manual dropdown (to be deprecated)
  },
  CACHE_DURATION: 300,       // 5 minutes cache
  MAX_RESULTS_PER_PAGE: 50
};

/**
 * Custom error class for category filtering operations
 */
class CategoryFilterError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'CategoryFilterError';
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Main Category Filter Manager Class
 * 
 * Handles all filtering operations using automated Python-generated categories.
 */
class CategoryFilterManager {
  
  constructor() {
    this.spreadsheet = SpreadsheetApp.openById(CATEGORY_FILTER_CONFIG.SPREADSHEET_ID);
    this.cache = CacheService.getScriptCache();
    this.logger = new CategorySessionLogger('CategoryFilterManager');
  }
  
  /**
   * Get all unique categories from Main_Category column
   * 
   * @returns {Array<string>} List of unique main categories
   */
  getMainCategories() {
    try {
      this.logger.log('getMainCategories', 'Fetching unique main categories');
      
      // Try cache first
      const cacheKey = 'main_categories';
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.log('getMainCategories', 'Returning cached categories');
        return JSON.parse(cached);
      }
      
      // Fetch from sheet
      const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
      if (!sheet) {
        throw new CategoryFilterError('Main sheet not found', 'SHEET_NOT_FOUND');
      }
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ['General']; // Default if no data
      }
      
      // Get MainCategory column (column I = index 9 in our sheet structure)
      const categoryColIndex = this._getColumnIndex('MainCategory');
      const categoryRange = sheet.getRange(2, categoryColIndex, lastRow - 1, 1);
      const categories = categoryRange.getValues()
        .flat()
        .filter(cat => cat && cat.toString().trim() !== '')
        .map(cat => cat.toString().trim());
      
      // Get unique categories
      const uniqueCategories = [...new Set(categories)].sort();
      
      // Cache results
      this.cache.put(cacheKey, JSON.stringify(uniqueCategories), CATEGORY_FILTER_CONFIG.CACHE_DURATION);
      
      this.logger.log('getMainCategories', `Found ${uniqueCategories.length} unique categories`, {
        categories: uniqueCategories
      });
      
      return uniqueCategories;
      
    } catch (error) {
      this.logger.error('getMainCategories', error);
      throw new CategoryFilterError(`Failed to get main categories: ${error.message}`, 'GET_CATEGORIES_FAILED');
    }
  }
  
  /**
   * Get subcategories for a specific main category
   * 
   * @param {string} mainCategory - The main category to filter by
   * @returns {Array<string>} List of subcategories
   */
  getSubcategories(mainCategory) {
    try {
      this.logger.log('getSubcategories', `Fetching subcategories for: ${mainCategory}`);
      
      // Try cache first
      const cacheKey = `subcategories_${mainCategory}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
      
      const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
      const lastRow = sheet.getLastRow();
      
      if (lastRow < 2) {
        return ['Standard'];
      }
      
      // Get MainCategory and Subcategory columns
      const mainCatColIndex = this._getColumnIndex('MainCategory');
      const subCatColIndex = this._getColumnIndex('Subcategory');
      
      const data = sheet.getRange(2, mainCatColIndex, lastRow - 1, 2).getValues();
      
      // Filter for matching main category and extract subcategories
      const subcategories = data
        .filter(row => row[0] && row[0].toString().trim() === mainCategory)
        .map(row => row[1] ? row[1].toString().trim() : 'Standard')
        .filter(subcat => subcat !== '');
      
      const uniqueSubcategories = [...new Set(subcategories)].sort();
      
      // Cache results
      this.cache.put(cacheKey, JSON.stringify(uniqueSubcategories), CATEGORY_FILTER_CONFIG.CACHE_DURATION);
      
      this.logger.log('getSubcategories', `Found ${uniqueSubcategories.length} subcategories`, {
        mainCategory,
        subcategories: uniqueSubcategories
      });
      
      return uniqueSubcategories;
      
    } catch (error) {
      this.logger.error('getSubcategories', error);
      throw new CategoryFilterError(`Failed to get subcategories: ${error.message}`, 'GET_SUBCATEGORIES_FAILED');
    }
  }
  
  /**
   * Filter text expanders by category and optional subcategory
   * 
   * @param {string} mainCategory - Main category to filter by
   * @param {string} subcategory - Optional subcategory filter
   * @param {number} page - Page number for pagination (1-based)
   * @returns {Object} Filtered results with pagination info
   */
  filterByCategory(mainCategory, subcategory = null, page = 1) {
    try {
      this.logger.log('filterByCategory', 'Filtering text expanders', {
        mainCategory,
        subcategory,
        page
      });
      
      const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
      const lastRow = sheet.getLastRow();
      
      if (lastRow < 2) {
        return {
          results: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalResults: 0,
            resultsPerPage: CATEGORY_FILTER_CONFIG.MAX_RESULTS_PER_PAGE
          }
        };
      }
      
      // Get all data
      const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
      const data = dataRange.getValues();
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      // Find column indices
      const contentIdx = headers.indexOf('Content');
      const mainCatIdx = headers.indexOf('MainCategory');
      const subCatIdx = headers.indexOf('Subcategory');
      const fontIdx = headers.indexOf('FontStyle');
      
      // Filter based on category
      const filtered = data.filter(row => {
        const rowMainCat = mainCatIdx >= 0 && row[mainCatIdx] ? row[mainCatIdx].toString().trim() : '';
        const rowSubCat = subCatIdx >= 0 && row[subCatIdx] ? row[subCatIdx].toString().trim() : '';
        
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
      
      // Pagination
      const totalResults = filtered.length;
      const totalPages = Math.ceil(totalResults / CATEGORY_FILTER_CONFIG.MAX_RESULTS_PER_PAGE);
      const startIndex = (page - 1) * CATEGORY_FILTER_CONFIG.MAX_RESULTS_PER_PAGE;
      const endIndex = startIndex + CATEGORY_FILTER_CONFIG.MAX_RESULTS_PER_PAGE;
      const paginatedResults = filtered.slice(startIndex, endIndex);
      
      // Format results
      const formattedResults = paginatedResults.map(row => ({
        textExpander: contentIdx >= 0 ? (row[contentIdx] || '') : '',
        fontName: fontIdx >= 0 ? (row[fontIdx] || 'Default') : 'Default',
        mainCategory: mainCatIdx >= 0 ? (row[mainCatIdx] || 'General') : 'General',
        subcategory: subCatIdx >= 0 ? (row[subCatIdx] || 'Standard') : 'Standard'
      }));
      
      const response = {
        results: formattedResults,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalResults: totalResults,
          resultsPerPage: CATEGORY_FILTER_CONFIG.MAX_RESULTS_PER_PAGE
        },
        filters: {
          mainCategory,
          subcategory
        }
      };
      
      this.logger.log('filterByCategory', `Filtered ${totalResults} results`, {
        totalResults,
        page,
        totalPages
      });
      
      return response;
      
    } catch (error) {
      this.logger.error('filterByCategory', error);
      throw new CategoryFilterError(`Filter operation failed: ${error.message}`, 'FILTER_FAILED');
    }
  }
  
  /**
   * Get column index by header name
   * @private
   */
  _getColumnIndex(headerName) {
    const sheet = this.spreadsheet.getSheetByName(CATEGORY_FILTER_CONFIG.SHEETS.MAIN);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const index = headers.indexOf(headerName);
    return index >= 0 ? index + 1 : -1; // 1-indexed for getRange
  }
  
  /**
   * Invalidate all category caches
   * Call this after Python categorization updates
   */
  clearCache() {
    try {
      this.cache.remove('main_categories');
      
      // Clear subcategory caches
      const categories = this.getMainCategories();
      categories.forEach(cat => {
        this.cache.remove(`subcategories_${cat}`);
      });
      
      this.logger.log('clearCache', 'All category caches cleared');
    } catch (error) {
      this.logger.error('clearCache', error);
    }
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
    if (CFG && CFG.DEBUG_MODE) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        context: this.context,
        action,
        message,
        details
      };
      console.log(JSON.stringify(logEntry));
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
    console.error(JSON.stringify(errorEntry));
  }
}

// ============================================================================
// API Functions - Called from web app frontend
// ============================================================================

/**
 * Get all main categories for filter dropdown
 */
function getMainCategoriesAPI() {
  try {
    const manager = new CategoryFilterManager();
    const categories = manager.getMainCategories();
    return {
      success: true,
      data: categories
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
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
    return {
      success: true,
      data: subcategories
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    };
  }
}

/**
 * Filter text expanders by category
 * 
 * @param {string} mainCategory - Main category to filter
 * @param {string} subcategory - Optional subcategory
 * @param {number} page - Page number (default 1)
 */
function filterByCategoryAPI(mainCategory, subcategory = null, page = 1) {
  try {
    const manager = new CategoryFilterManager();
    const results = manager.filterByCategory(mainCategory, subcategory, page);
    return {
      success: true,
      data: results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
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
    return {
      success: true,
      message: 'Category cache cleared successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
