/**
 * 🌉 COLAB BRIDGE SYSTEM
 * =====================================================
 * Manages communication between Apps Script and Python via Google Drive
 * Message Queue Pattern: GAS → Drive JSON → Python → Drive JSON → GAS
 * 
 * Created: 2025-12-30
 * Part of: G.A.S_Text_Expander_Manager
 */

/**
 * Bridge Configuration
 * 🔴 DRIVE_FOLDER_ID will be auto-generated on first run if left empty
 */
const BRIDGE_CONFIG = {
  DRIVE_FOLDER_ID: "",  // Auto-created on first run
  DRIVE_FOLDER_NAME: "TextExpanderBridge",
  CATEGORY_SOURCE_RANGE: "Categories!A2:A50",
  DATA_SHEET_NAME: "Shortcuts",
  TEXT_COLUMN: 3,       // Column C (Content)
  CATEGORY_COLUMN: 9,   // Column I (MainCategory) - matches HEADERS_SHORTCUTS
  DESCRIPTION_COLUMN: 5, // Column E (Description)
  MAX_TASK_FILES: 5,    // Keep last N task files
  MAX_TEXT_LENGTH: 1000 // Truncate text for processing
};


// ============================================================================
// FOLDER MANAGEMENT
// ============================================================================

/**
 * Gets or creates the bridge folder in Google Drive
 * @returns {GoogleAppsScript.Drive.Folder} The bridge folder
 */
function ensureBridgeFolderExists() {
  try {
    // First try to use configured folder ID
    if (BRIDGE_CONFIG.DRIVE_FOLDER_ID && BRIDGE_CONFIG.DRIVE_FOLDER_ID.trim() !== "") {
      try {
        return DriveApp.getFolderById(BRIDGE_CONFIG.DRIVE_FOLDER_ID);
      } catch (e) {
        Logger.log(`⚠️ Configured folder ID not found: ${e.message}`);
      }
    }
    
    // Search for existing folder by name
    const folders = DriveApp.getFoldersByName(BRIDGE_CONFIG.DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      Logger.log(`✅ Found existing folder: ${folder.getId()}`);
      return folder;
    }
    
    // Create new folder
    const rootFolder = DriveApp.getRootFolder();
    const newFolder = rootFolder.createFolder(BRIDGE_CONFIG.DRIVE_FOLDER_NAME);
    
    const folderId = newFolder.getId();
    Logger.log(`✅ Created new folder: ${folderId}`);
    
    SpreadsheetApp.getUi().alert(
      `✅ Bridge Folder Created!\n\n` +
      `Folder Name: ${BRIDGE_CONFIG.DRIVE_FOLDER_NAME}\n` +
      `Folder ID: ${folderId}\n\n` +
      `📋 Optional: Update BRIDGE_CONFIG.DRIVE_FOLDER_ID in ColabBridge.gs with this ID for faster lookups.`
    );
    
    return newFolder;
    
  } catch (error) {
    Logger.log(`❌ Folder error: ${error.toString()}`);
    throw new Error(`Failed to access/create bridge folder: ${error.message}`);
  }
}


/**
 * Shows folder setup dialog with current folder info
 */
function showBridgeFolderInfo() {
  try {
    const folder = ensureBridgeFolderExists();
    const fileCount = folder.getFiles();
    let count = 0;
    while (fileCount.hasNext()) {
      fileCount.next();
      count++;
    }
    
    SpreadsheetApp.getUi().alert(
      `🌉 Bridge Folder Info\n\n` +
      `📁 Name: ${folder.getName()}\n` +
      `🆔 ID: ${folder.getId()}\n` +
      `📄 Files: ${count}\n` +
      `🔗 URL: ${folder.getUrl()}`
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
  }
}


// ============================================================================
// TRIGGER PYTHON CATEGORIZATION
// ============================================================================

/**
 * 🚀 Main function: Queues uncategorized items for Python processing
 * Creates a JSON task file in Google Drive for Python to process
 */
function triggerPythonCategorization() {
  const startTime = new Date();
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BRIDGE_CONFIG.DATA_SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${BRIDGE_CONFIG.DATA_SHEET_NAME}" not found`);
    }
    
    // 1️⃣ Get all data
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      ui.alert("⚠️ No data found in sheet (only headers)");
      return;
    }
    
    const headers = data[0];
    
    // 2️⃣ Find uncategorized items
    const pendingTasks = [];
    for (let i = 1; i < data.length; i++) {
      const text = data[i][BRIDGE_CONFIG.TEXT_COLUMN - 1];
      const description = data[i][BRIDGE_CONFIG.DESCRIPTION_COLUMN - 1];
      const category = data[i][BRIDGE_CONFIG.CATEGORY_COLUMN - 1];
      
      // Include if category is empty or null
      if (text && (!category || String(category).trim() === "")) {
        pendingTasks.push({
          rowId: i + 1,  // 1-indexed for sheet reference
          text: String(text).substring(0, BRIDGE_CONFIG.MAX_TEXT_LENGTH),
          description: String(description || "").substring(0, 500)
        });
      }
    }
    
    if (pendingTasks.length === 0) {
      ui.alert("✨ All items are already categorized!");
      return;
    }
    
    // 3️⃣ Get available categories
    let categories = [];
    try {
      const categoryRange = ss.getRange(BRIDGE_CONFIG.CATEGORY_SOURCE_RANGE);
      categories = categoryRange.getValues()
        .flat()
        .filter(cat => cat && String(cat).trim() !== "");
    } catch (e) {
      Logger.log(`⚠️ Could not read categories from ${BRIDGE_CONFIG.CATEGORY_SOURCE_RANGE}: ${e.message}`);
      // Fallback: extract unique categories from existing data
      const existingCategories = new Set();
      for (let i = 1; i < data.length; i++) {
        const cat = data[i][BRIDGE_CONFIG.CATEGORY_COLUMN - 1];
        if (cat && String(cat).trim() !== "") {
          existingCategories.add(String(cat).trim());
        }
      }
      categories = Array.from(existingCategories);
    }
    
    if (categories.length === 0) {
      ui.alert("⚠️ No categories found! Please add categories to the Categories sheet first.");
      return;
    }
    
    // 4️⃣ Create task payload
    const payload = {
      timestamp: new Date().toISOString(),
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      sheetName: BRIDGE_CONFIG.DATA_SHEET_NAME,
      availableCategories: categories,
      totalTasks: pendingTasks.length,
      tasks: pendingTasks
    };
    
    // 5️⃣ Write to Drive
    const folder = ensureBridgeFolderExists();
    const fileName = `pending_tasks.json`;  // Fixed name for Python to find easily
    
    // Remove existing pending_tasks.json if present
    const existingFiles = folder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    
    const file = folder.createFile(
      fileName,
      JSON.stringify(payload, null, 2),
      MimeType.PLAIN_TEXT
    );
    
    // 6️⃣ Archive old task files (keep last N)
    cleanupOldTaskFiles_(folder);
    
    const elapsed = ((new Date()) - startTime) / 1000;
    
    ui.alert(
      `🚀 Python Processing Queued!\n\n` +
      `📝 Items queued: ${pendingTasks.length}\n` +
      `📋 Categories available: ${categories.length}\n` +
      `📁 File: ${fileName}\n` +
      `⏱️ Time: ${elapsed.toFixed(2)}s\n\n` +
      `Next Steps:\n` +
      `1. Open Google Colab\n` +
      `2. Run DriveCategorizerBridge.py\n` +
      `3. Return here and click '📥 Import Results'`
    );
    
    Logger.log(`✅ Task file created: ${file.getUrl()}`);
    
  } catch (error) {
    Logger.log(`❌ Trigger error: ${error.toString()}`);
    ui.alert(`❌ Error: ${error.message}`);
    throw error;
  }
}


/**
 * Cleans up old task archive files, keeping only the most recent N
 * @param {GoogleAppsScript.Drive.Folder} folder - The bridge folder
 */
function cleanupOldTaskFiles_(folder) {
  try {
    const files = folder.getFiles();
    const taskFiles = [];
    
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      // Match archived task files (task_*.json pattern)
      if (name.startsWith("task_") && name.endsWith(".json")) {
        taskFiles.push({
          file: file,
          date: file.getDateCreated()
        });
      }
    }
    
    // Sort by date (newest first) and trash old ones
    taskFiles.sort((a, b) => b.date - a.date);
    
    for (let i = BRIDGE_CONFIG.MAX_TASK_FILES; i < taskFiles.length; i++) {
      taskFiles[i].file.setTrashed(true);
      Logger.log(`🗑️ Archived old task file: ${taskFiles[i].file.getName()}`);
    }
    
  } catch (e) {
    Logger.log(`⚠️ Cleanup error (non-fatal): ${e.message}`);
  }
}


// ============================================================================
// INGEST PYTHON RESULTS
// ============================================================================

/**
 * 📥 Imports Python categorization results back into the sheet
 * Reads results_latest.json from Drive and updates cells
 */
function ingestPythonResults() {
  const startTime = new Date();
  const ui = SpreadsheetApp.getUi();
  
  try {
    const folder = ensureBridgeFolderExists();
    const files = folder.getFilesByName("results_latest.json");
    
    if (!files.hasNext()) {
      ui.alert(
        "⏳ No Results Found\n\n" +
        "The results_latest.json file doesn't exist yet.\n\n" +
        "Please:\n" +
        "1. Open Google Colab\n" +
        "2. Run the DriveCategorizerBridge.py script\n" +
        "3. Try this import again"
      );
      return;
    }
    
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    const data = JSON.parse(content);
    
    // Check for Python-side errors
    if (data.error) {
      throw new Error(`Python processing failed: ${data.error}`);
    }
    
    if (!data.results || data.results.length === 0) {
      ui.alert("⚠️ Results file exists but contains no categorizations.");
      return;
    }
    
    // Get the sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BRIDGE_CONFIG.DATA_SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${BRIDGE_CONFIG.DATA_SHEET_NAME}" not found`);
    }
    
    // Apply results
    let updateCount = 0;
    let lowConfidenceCount = 0;
    let errorCount = 0;
    
    for (const result of data.results) {
      try {
        const rowId = result.rowId;
        const category = result.suggestedCategory;
        const confidence = result.confidence || 0;
        
        if (!rowId || rowId < 2) {
          Logger.log(`⚠️ Invalid rowId: ${rowId}`);
          continue;
        }
        
        const cell = sheet.getRange(rowId, BRIDGE_CONFIG.CATEGORY_COLUMN);
        cell.setValue(category);
        
        // Color-code by confidence
        if (confidence < 0.3) {
          cell.setBackground("#FFE5E5");  // Light red - low confidence
          lowConfidenceCount++;
        } else if (confidence < 0.6) {
          cell.setBackground("#FFF4E5");  // Light orange - medium
        } else {
          cell.setBackground("#E5F5E5");  // Light green - high confidence
        }
        
        // Add note with confidence + alternatives
        let note = `🤖 ML Categorized\n`;
        note += `Confidence: ${(confidence * 100).toFixed(1)}%\n`;
        
        if (result.alternatives && result.alternatives.length > 0) {
          note += `\nAlternatives:\n`;
          for (const alt of result.alternatives) {
            note += `• ${alt.category} (${(alt.confidence * 100).toFixed(1)}%)\n`;
          }
        }
        
        cell.setNote(note);
        updateCount++;
        
      } catch (rowError) {
        Logger.log(`⚠️ Error updating row ${result.rowId}: ${rowError.message}`);
        errorCount++;
      }
    }
    
    // Archive the results file
    const archiveName = `results_${Date.now()}.json`;
    file.setName(archiveName);
    Logger.log(`📦 Archived results to: ${archiveName}`);
    
    const elapsed = ((new Date()) - startTime) / 1000;
    
    ui.alert(
      `✅ Categorization Import Complete!\n\n` +
      `📊 Updated: ${updateCount} items\n` +
      `⚠️ Low confidence (<30%): ${lowConfidenceCount}\n` +
      `❌ Errors: ${errorCount}\n` +
      `⏱️ Time: ${elapsed.toFixed(2)}s\n\n` +
      `Processed at: ${data.processedAt || 'Unknown'}\n\n` +
      `💡 Tip: Review cells with red/orange backgrounds - they may need manual verification.`
    );
    
  } catch (error) {
    Logger.log(`❌ Ingestion error: ${error.toString()}`);
    ui.alert(`❌ Error: ${error.message}`);
    throw error;
  }
}


// ============================================================================
// STATUS & DIAGNOSTICS
// ============================================================================

/**
 * Shows current bridge status and pending files
 */
function showBridgeStatus() {
  try {
    const folder = ensureBridgeFolderExists();
    const files = folder.getFiles();
    
    let pendingTasks = null;
    let resultsReady = false;
    let fileList = [];
    
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      fileList.push(name);
      
      if (name === "pending_tasks.json") {
        const content = JSON.parse(file.getBlob().getDataAsString());
        pendingTasks = content.totalTasks || content.tasks?.length || 0;
      }
      
      if (name === "results_latest.json") {
        resultsReady = true;
      }
    }
    
    let status = `🌉 Bridge Status\n\n`;
    status += `📁 Folder: ${folder.getName()}\n`;
    status += `📄 Files: ${fileList.length}\n\n`;
    
    if (pendingTasks !== null) {
      status += `⏳ Pending Tasks: ${pendingTasks}\n`;
      status += `   (Waiting for Python processing)\n\n`;
    }
    
    if (resultsReady) {
      status += `✅ Results Ready!\n`;
      status += `   Click '📥 Import Results' to apply.\n\n`;
    }
    
    if (!pendingTasks && !resultsReady) {
      status += `✨ No pending work.\n`;
      status += `   Click '🚀 Trigger Categorization' to start.\n`;
    }
    
    SpreadsheetApp.getUi().alert(status);
    
  } catch (error) {
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
  }
}


// ============================================================================
// MENU INTEGRATION
// ============================================================================

/**
 * 🎨 Adds Python Bridge menu to spreadsheet
 * Called from onOpen in Code.gs or standalone
 */
function addBridgeMenu() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 Python Bridge')
    .addItem('🚀 Trigger Categorization', 'triggerPythonCategorization')
    .addItem('📥 Import Results', 'ingestPythonResults')
    .addSeparator()
    .addItem('📊 Bridge Status', 'showBridgeStatus')
    .addItem('🔧 Setup/View Folder', 'showBridgeFolderInfo')
    .addToUi();
}


/**
 * Standalone onOpen trigger (if not using main Code.gs menu)
 * Note: If using with main Code.gs, call addBridgeMenu() from there instead
 */
function onOpenBridge(e) {
  addBridgeMenu();
}
