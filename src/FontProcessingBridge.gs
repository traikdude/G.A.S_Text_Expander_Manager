/**
 * Font Processing Bridge v2.0
 * 
 * Connects Google Apps Script with Python font categorizer.
 * Handles data transfer, triggering categorization, and syncing results.
 * Extends the existing ColabBridge with font-specific processing.
 * 
 * @author G.A.S Text Expander Manager Team
 * @version 2.0
 * @since 2025-12-30
 */

const FONT_BRIDGE_CONFIG = {
  DRIVE_FOLDER_NAME: 'TextExpanderBridge',
  TIMEOUT: 60000,  // 60 seconds
  MAX_BATCH_SIZE: 500,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000  // 2 seconds
};

/**
 * Main Font Processing Bridge Class
 */
class FontProcessingBridge {
  
  constructor() {
    this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    this.logger = new FontBridgeLogger('FontProcessingBridge');
  }
  
  /**
   * Gets or creates the bridge folder in Google Drive
   * @returns {GoogleAppsScript.Drive.Folder} The bridge folder
   */
  _getBridgeFolder() {
    // Search for existing folder by name
    const folders = DriveApp.getFoldersByName(FONT_BRIDGE_CONFIG.DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    
    // Create new folder
    const rootFolder = DriveApp.getRootFolder();
    return rootFolder.createFolder(FONT_BRIDGE_CONFIG.DRIVE_FOLDER_NAME);
  }
  
  /**
   * Trigger Python font categorization for Shortcuts sheet
   * Creates a task file for the FontAwareCategorizer.py to process
   * 
   * @param {boolean} fullReprocess - If true, reprocess all rows; otherwise only new ones
   * @returns {Object} Processing result summary
   */
  triggerFontCategorization(fullReprocess = false) {
    const startTime = new Date();
    
    try {
      this.logger.log('triggerFontCategorization', 'Starting font categorization', {
        fullReprocess
      });
      
      // Get shortcuts data
      const shortcutsSheet = this.spreadsheet.getSheetByName(CFG.SHEET_SHORTCUTS);
      if (!shortcutsSheet) {
        throw new Error('Shortcuts sheet not found');
      }
      
      const lastRow = shortcutsSheet.getLastRow();
      if (lastRow < 2) {
        return {
          success: true,
          message: 'No data to process',
          rowsProcessed: 0
        };
      }
      
      const headers = shortcutsSheet.getRange(1, 1, 1, shortcutsSheet.getLastColumn()).getValues()[0];
      const mainCatIdx = headers.indexOf('MainCategory');
      
      // Determine which rows to process
      let startRow = 2;
      if (!fullReprocess && mainCatIdx >= 0) {
        // Find first row without MainCategory value
        const categoryColumn = shortcutsSheet.getRange(2, mainCatIdx + 1, lastRow - 1, 1).getValues();
        const firstEmptyIndex = categoryColumn.findIndex(row => !row[0] || row[0].toString().trim() === '');
        startRow = firstEmptyIndex >= 0 ? firstEmptyIndex + 2 : lastRow + 1;
      }
      
      if (startRow > lastRow) {
        return {
          success: true,
          message: 'All rows already categorized',
          rowsProcessed: 0
        };
      }
      
      // Get data range to process
      const contentIdx = headers.indexOf('Content');
      const snippetIdx = headers.indexOf('Snippet Name');
      const descIdx = headers.indexOf('Description');
      
      const dataRange = shortcutsSheet.getRange(startRow, 1, lastRow - startRow + 1, shortcutsSheet.getLastColumn());
      const data = dataRange.getValues();
      
      // Build task payload for Python
      const shortcuts = data.map((row, index) => ({
        rowId: startRow + index,
        snippetName: snippetIdx >= 0 ? (row[snippetIdx] || '') : '',
        content: contentIdx >= 0 ? (row[contentIdx] || '') : '',
        description: descIdx >= 0 ? (row[descIdx] || '') : ''
      })).filter(item => item.content || item.snippetName);
      
      if (shortcuts.length === 0) {
        return {
          success: true,
          message: 'No valid entries to process',
          rowsProcessed: 0
        };
      }
      
      // Create task payload
      const payload = {
        timestamp: new Date().toISOString(),
        spreadsheetId: this.spreadsheet.getId(),
        spreadsheetName: this.spreadsheet.getName(),
        sheetName: CFG.SHEET_SHORTCUTS,
        processingMode: fullReprocess ? 'full' : 'incremental',
        totalTasks: shortcuts.length,
        tasks: shortcuts
      };
      
      // Write to Drive
      const folder = this._getBridgeFolder();
      const fileName = 'font_categorization_tasks.json';
      
      // Remove existing file if present
      const existingFiles = folder.getFilesByName(fileName);
      while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
      }
      
      const file = folder.createFile(
        fileName,
        JSON.stringify(payload, null, 2),
        MimeType.PLAIN_TEXT
      );
      
      const elapsed = ((new Date()) - startTime) / 1000;
      
      this.logger.log('triggerFontCategorization', 'Task file created', {
        rowsQueued: shortcuts.length,
        fileName: fileName,
        elapsed: elapsed
      });
      
      SpreadsheetApp.getUi().alert(
        `🚀 Font Categorization Queued!\n\n` +
        `📝 Items queued: ${shortcuts.length}\n` +
        `📁 File: ${fileName}\n` +
        `⏱️ Time: ${elapsed.toFixed(2)}s\n\n` +
        `Next Steps:\n` +
        `1. Open Google Colab\n` +
        `2. Run FontAwareCategorizer.py\n` +
        `3. Return here and click '📥 Import Font Results'`
      );
      
      return {
        success: true,
        message: `Successfully queued ${shortcuts.length} rows`,
        rowsProcessed: shortcuts.length,
        file: file.getUrl()
      };
      
    } catch (error) {
      this.logger.error('triggerFontCategorization', error);
      SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        rowsProcessed: 0
      };
    }
  }
  
  /**
   * Import font categorization results from Python processing
   * Reads font_categorization_results.json and updates the Shortcuts sheet
   */
  importFontResults() {
    const startTime = new Date();
    const ui = SpreadsheetApp.getUi();
    
    try {
      const folder = this._getBridgeFolder();
      const files = folder.getFilesByName('font_categorization_results.json');
      
      if (!files.hasNext()) {
        ui.alert(
          "⏳ No Results Found\n\n" +
          "The font_categorization_results.json file doesn't exist yet.\n\n" +
          "Please:\n" +
          "1. Open Google Colab\n" +
          "2. Run the FontAwareCategorizer.py script\n" +
          "3. Try this import again"
        );
        return { success: false, message: 'No results file found' };
      }
      
      const file = files.next();
      const content = file.getBlob().getDataAsString();
      const data = JSON.parse(content);
      
      if (data.error) {
        throw new Error(`Python processing failed: ${data.error}`);
      }
      
      if (!data.results || data.results.length === 0) {
        ui.alert("⚠️ Results file exists but contains no categorizations.");
        return { success: false, message: 'Empty results' };
      }
      
      // Get the sheet and headers
      const sheet = this.spreadsheet.getSheetByName(CFG.SHEET_SHORTCUTS);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      // Find or create required columns
      let mainCatIdx = headers.indexOf('MainCategory');
      let subCatIdx = headers.indexOf('Subcategory');
      let fontIdx = headers.indexOf('FontStyle');
      
      // Add columns if they don't exist
      if (mainCatIdx < 0) {
        mainCatIdx = headers.length;
        sheet.getRange(1, mainCatIdx + 1).setValue('MainCategory');
      }
      if (subCatIdx < 0) {
        subCatIdx = mainCatIdx + 1;
        sheet.getRange(1, subCatIdx + 1).setValue('Subcategory');
      }
      if (fontIdx < 0) {
        fontIdx = subCatIdx + 1;
        sheet.getRange(1, fontIdx + 1).setValue('FontStyle');
      }
      
      // Apply results
      let updateCount = 0;
      let lowConfidenceCount = 0;
      
      for (const result of data.results) {
        try {
          const rowId = result.rowId;
          if (!rowId || rowId < 2) continue;
          
          // Update MainCategory
          const mainCatCell = sheet.getRange(rowId, mainCatIdx + 1);
          mainCatCell.setValue(result.Main_Category || result.mainCategory || 'General');
          
          // Update Subcategory
          const subCatCell = sheet.getRange(rowId, subCatIdx + 1);
          subCatCell.setValue(result.Subcategory || result.subcategory || 'Standard');
          
          // Update FontStyle
          const fontCell = sheet.getRange(rowId, fontIdx + 1);
          fontCell.setValue(result.Font_Name || result.fontName || 'Default');
          
          // Color-code by confidence
          const confidence = result.Confidence_Score || result.confidence || 0;
          if (confidence < 0.3) {
            mainCatCell.setBackground("#FFE5E5");  // Light red
            lowConfidenceCount++;
          } else if (confidence < 0.6) {
            mainCatCell.setBackground("#FFF4E5");  // Light orange
          } else {
            mainCatCell.setBackground("#E5F5E5");  // Light green
          }
          
          // Add note with confidence
          mainCatCell.setNote(`🤖 Font-Aware Categorized\nConfidence: ${(confidence * 100).toFixed(1)}%\nFont: ${result.Font_Name || 'Default'}`);
          
          updateCount++;
          
        } catch (rowError) {
          this.logger.error('importFontResults', rowError);
        }
      }
      
      // Clear category cache
      try {
        const filterManager = new CategoryFilterManager();
        filterManager.clearCache();
      } catch (e) {
        // Cache clear is optional
      }
      
      // Archive results file
      const archiveName = `font_results_${Date.now()}.json`;
      file.setName(archiveName);
      
      const elapsed = ((new Date()) - startTime) / 1000;
      
      ui.alert(
        `✅ Font Categorization Import Complete!\n\n` +
        `📊 Updated: ${updateCount} items\n` +
        `⚠️ Low confidence (<30%): ${lowConfidenceCount}\n` +
        `⏱️ Time: ${elapsed.toFixed(2)}s\n\n` +
        `💡 Tip: Review cells with red/orange backgrounds.`
      );
      
      return {
        success: true,
        updated: updateCount,
        lowConfidence: lowConfidenceCount
      };
      
    } catch (error) {
      this.logger.error('importFontResults', error);
      ui.alert(`❌ Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Logger for Font Bridge operations
 */
class FontBridgeLogger {
  constructor(context) {
    this.context = context;
  }
  
  log(action, message, details = {}) {
    if (typeof CFG !== 'undefined' && CFG.DEBUG_MODE) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        context: this.context,
        action,
        message,
        details
      }));
    }
  }
  
  error(action, error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      context: this.context,
      action,
      error: {
        message: error.message,
        stack: error.stack
      }
    }));
  }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Trigger font categorization from web app or menu
 */
function triggerFontCategorizationAPI(fullReprocess = false) {
  try {
    const bridge = new FontProcessingBridge();
    return bridge.triggerFontCategorization(fullReprocess);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Import font categorization results
 */
function importFontResultsAPI() {
  try {
    const bridge = new FontProcessingBridge();
    return bridge.importFontResults();
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// Menu Functions
// ============================================================================

/**
 * Add Font Processing menu items
 * Call this from the main onOpen() or separately
 */
function addFontProcessingMenu() {
  SpreadsheetApp.getUi()
    .createMenu('🎨 Font Processing')
    .addItem('🚀 Categorize New Entries', 'menuFontCategorizeNew')
    .addItem('🔄 Recategorize All', 'menuFontRecategorizeAll')
    .addSeparator()
    .addItem('📥 Import Font Results', 'menuImportFontResults')
    .addSeparator()
    .addItem('🗑️ Clear Category Cache', 'menuClearCategoryCache')
    .addToUi();
}

function menuFontCategorizeNew() {
  triggerFontCategorizationAPI(false);
}

function menuFontRecategorizeAll() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Confirm Full Recategorization',
    'This will reprocess ALL rows. Continue?',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    triggerFontCategorizationAPI(true);
  }
}

function menuImportFontResults() {
  importFontResultsAPI();
}

function menuClearCategoryCache() {
  const result = clearCategoryCacheAPI();
  SpreadsheetApp.getUi().alert(
    result.success ? '✅ Cache Cleared' : '❌ Error',
    result.message || result.error || 'Done',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
