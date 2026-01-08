/**
 * 🌉 COLAB BRIDGE SYSTEM (Revised ✅)
 * =====================================================
 * Manages communication between Apps Script and Python via Google Drive
 * Pattern: GAS → Drive JSON → Python → Drive JSON → GAS
 *
 * Fixes included:
 * ✅ Stores folder ID automatically in DocumentProperties
 * ✅ Uses LockService to prevent concurrency collisions
 * ✅ Adds stable ID-based mapping (fallback to rowId)
 * ✅ Batch updates in ingest (FAST 🚀)
 * ✅ Safer file archiving instead of hard-trash (trash still attempted if allowed)
 *
 * Created: 2025-12-30
 * Part of: G.A.S_Text_Expander_Manager
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const BRIDGE_CONFIG = {
  DRIVE_FOLDER_ID: "", // Optional override; system auto-stores ID in DocumentProperties
  DRIVE_FOLDER_NAME: "TextExpanderBridge",

  CATEGORY_SOURCE_RANGE: "Categories!A2:A50",
  DATA_SHEET_NAME: "Shortcuts",

  // Fallback column positions (used only if header lookup fails)
  TEXT_COLUMN: 3,        // Column C (Content)
  CATEGORY_COLUMN: 9,    // Column I (MainCategory)
  DESCRIPTION_COLUMN: 5, // Column E (Description)

  MAX_TASK_FILES: 5,     // Keep last N archived task files
  MAX_TEXT_LENGTH: 1000, // Truncate text for processing

  // Filenames used by Python
  PENDING_FILE: "pending_tasks.json",
  RESULTS_FILE: "results_latest.json",

  // Property key to store folder ID per spreadsheet
  PROP_FOLDER_ID: "TEM_BRIDGE_FOLDER_ID",

  // Locks
  LOCK_TIMEOUT_MS: 15000
};


// ============================================================================
// FOLDER MANAGEMENT
// ============================================================================

/**
 * Gets or creates the bridge folder in Google Drive.
 * Stores its ID in DocumentProperties for persistence 📌
 *
 * Note: Drive operations require Drive scopes.
 *
 * @returns {GoogleAppsScript.Drive.Folder} The bridge folder
 */
function ensureBridgeFolderExists() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(BRIDGE_CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error("⏳ Bridge folder busy (another run in progress). Please try again.");
  }

  try {
    // 1) Use hard-coded override if present
    if (BRIDGE_CONFIG.DRIVE_FOLDER_ID && BRIDGE_CONFIG.DRIVE_FOLDER_ID.trim() !== "") {
      try {
        const folder = DriveApp.getFolderById(BRIDGE_CONFIG.DRIVE_FOLDER_ID.trim());
        storeBridgeFolderId_(folder.getId());
        return folder;
      } catch (e) {
        Logger.log(`⚠️ Configured folder ID not found/accessible: ${e.message}`);
      }
    }

    // 2) Use stored DocumentProperties ID if present
    const storedId = getBridgeFolderId_();
    if (storedId) {
      try {
        const folder = DriveApp.getFolderById(storedId);
        return folder;
      } catch (e) {
        Logger.log(`⚠️ Stored folder ID not found/accessible: ${e.message}`);
      }
    }

    // 3) Search by name (may find multiple; we take first)
    const folders = DriveApp.getFoldersByName(BRIDGE_CONFIG.DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      Logger.log(`✅ Found existing folder by name: ${folder.getId()}`);
      storeBridgeFolderId_(folder.getId());
      return folder;
    }

    // 4) Create folder in My Drive root
    // Note: DriveApp has limitations vs Advanced Drive service. For shared drives,
    // Advanced Drive is usually recommended.
    const rootFolder = DriveApp.getRootFolder();
    const newFolder = rootFolder.createFolder(BRIDGE_CONFIG.DRIVE_FOLDER_NAME);

    const folderId = newFolder.getId();
    storeBridgeFolderId_(folderId);

    Logger.log(`✅ Created new folder: ${folderId}`);

    SpreadsheetApp.getUi().alert(
      `✅ Bridge Folder Created!\n\n` +
      `📁 Name: ${BRIDGE_CONFIG.DRIVE_FOLDER_NAME}\n` +
      `🆔 ID: ${folderId}\n\n` +
      `This ID is now saved automatically for this spreadsheet 😄`
    );

    return newFolder;

  } catch (error) {
    Logger.log(`❌ Folder error: ${error.toString()}`);
    throw new Error(`Failed to access/create bridge folder: ${error.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Shows folder setup dialog with current folder info
 */
function showBridgeFolderInfo() {
  try {
    const folder = ensureBridgeFolderExists();
    const files = folder.getFiles();
    let count = 0;
    while (files.hasNext()) {
      files.next();
      count++;
    }

    SpreadsheetApp.getUi().alert(
      `🌉 Bridge Folder Info\n\n` +
      `📁 Name: ${folder.getName()}\n` +
      `🆔 ID: ${folder.getId()}\n` +
      `📄 Files: ${count}\n` +
      `🔗 URL: ${folder.getUrl()}\n\n` +
      `📌 Stored in DocumentProperties: ${getBridgeFolderId_() ? "Yes ✅" : "No ❌"}`
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
  }
}

/**
 * Stores the folder ID in DocumentProperties so it persists per spreadsheet.
 */
function storeBridgeFolderId_(folderId) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty(BRIDGE_CONFIG.PROP_FOLDER_ID, String(folderId || "").trim());
}

/**
 * Reads the folder ID from DocumentProperties.
 */
function getBridgeFolderId_() {
  const props = PropertiesService.getDocumentProperties();
  const id = props.getProperty(BRIDGE_CONFIG.PROP_FOLDER_ID);
  return id ? String(id).trim() : "";
}


// ============================================================================
// HEADER-AWARE COLUMN RESOLUTION (More robust than hard-coded indices 🧠)
// ============================================================================

/**
 * Attempts to resolve required columns by header name.
 * Falls back to BRIDGE_CONFIG.*_COLUMN values if headers are missing.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {{textCol:number, categoryCol:number, descriptionCol:number, idCol:number, snippetCol:number}}
 */
function resolveBridgeColumns_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());

  const idx = {};
  header.forEach((h, i) => { if (h) idx[h.toLowerCase()] = i + 1; });

  const textCol = idx["content"] || BRIDGE_CONFIG.TEXT_COLUMN;
  const categoryCol = idx["maincategory"] || BRIDGE_CONFIG.CATEGORY_COLUMN;
  const descriptionCol = idx["description"] || BRIDGE_CONFIG.DESCRIPTION_COLUMN;

  const idCol = idx["id"] || 1;
  const snippetCol = idx["snippet name"] || 2;

  return { textCol, categoryCol, descriptionCol, idCol, snippetCol };
}


// ============================================================================
// TRIGGER PYTHON CATEGORIZATION
// ============================================================================

/**
 * 🚀 Main function: Queues uncategorized items for Python processing
 * Creates a JSON task file in Google Drive for Python to process
 */
function triggerPythonCategorization() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(BRIDGE_CONFIG.LOCK_TIMEOUT_MS)) {
    SpreadsheetApp.getUi().alert("⏳ Another bridge action is running. Try again in a moment 🙂");
    return;
  }

  const startTime = new Date();
  const ui = SpreadsheetApp.getUi();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BRIDGE_CONFIG.DATA_SHEET_NAME);

    if (!sheet) throw new Error(`Sheet "${BRIDGE_CONFIG.DATA_SHEET_NAME}" not found`);

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      ui.alert("⚠️ No data found in sheet (only headers).");
      return;
    }

    const cols = resolveBridgeColumns_(sheet);

    // 1️⃣ Find uncategorized items
    const pendingTasks = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      const id = String(row[cols.idCol - 1] || "").trim();
      const snippetName = String(row[cols.snippetCol - 1] || "").trim();

      const text = row[cols.textCol - 1];
      const description = row[cols.descriptionCol - 1];
      const category = row[cols.categoryCol - 1];

      if (text && (!category || String(category).trim() === "")) {
        pendingTasks.push({
          rowId: i + 1, // 1-indexed for sheet reference
          shortcutId: id || "", // ✅ stable identifier (preferred)
          snippetName: snippetName || "",
          text: String(text).substring(0, BRIDGE_CONFIG.MAX_TEXT_LENGTH),
          description: String(description || "").substring(0, 500)
        });
      }
    }

    if (pendingTasks.length === 0) {
      ui.alert("✨ All items are already categorized!");
      return;
    }

    // 2️⃣ Get available categories
    const categories = readBridgeCategories_(ss, data, cols.categoryCol);

    if (categories.length === 0) {
      ui.alert("⚠️ No categories found!\n\nAdd categories to the Categories sheet first (range: " + BRIDGE_CONFIG.CATEGORY_SOURCE_RANGE + ").");
      return;
    }

    // 3️⃣ Create task payload
    const payload = {
      timestamp: new Date().toISOString(),
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      sheetName: BRIDGE_CONFIG.DATA_SHEET_NAME,
      availableCategories: categories,
      totalTasks: pendingTasks.length,
      tasks: pendingTasks
    };

    // 4️⃣ Write to Drive
    const folder = ensureBridgeFolderExists();

    // Archive existing pending file instead of trashing aggressively (safer permissions-wise)
    archiveIfExists_(folder, BRIDGE_CONFIG.PENDING_FILE, "task");

    const file = folder.createFile(
      BRIDGE_CONFIG.PENDING_FILE,
      JSON.stringify(payload, null, 2),
      MimeType.PLAIN_TEXT
    );

    // 5️⃣ Cleanup old archived tasks
    cleanupOldTaskFiles_(folder);

    const elapsed = (new Date() - startTime) / 1000;

    ui.alert(
      `🚀 Python Processing Queued!\n\n` +
      `📝 Items queued: ${pendingTasks.length}\n` +
      `📋 Categories available: ${categories.length}\n` +
      `📁 File: ${BRIDGE_CONFIG.PENDING_FILE}\n` +
      `⏱️ Time: ${elapsed.toFixed(2)}s\n\n` +
      `Next Steps:\n` +
      `1) Open Colab 🐍\n` +
      `2) Run DriveCategorizerBridge\n` +
      `3) Return here and click '📥 Import Results'`
    );

    Logger.log(`✅ Task file created: ${file.getUrl()}`);

  } catch (error) {
    Logger.log(`❌ Trigger error: ${error.toString()}`);
    ui.alert(`❌ Error: ${error.message}`);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reads categories from configured range; falls back to unique existing categories in sheet.
 */
function readBridgeCategories_(ss, data, categoryCol) {
  let categories = [];

  try {
    const range = ss.getRange(BRIDGE_CONFIG.CATEGORY_SOURCE_RANGE);
    categories = range.getValues()
      .flat()
      .map(v => String(v || "").trim())
      .filter(v => v !== "");
  } catch (e) {
    Logger.log(`⚠️ Could not read categories from ${BRIDGE_CONFIG.CATEGORY_SOURCE_RANGE}: ${e.message}`);
  }

  if (categories.length > 0) return unique_(categories);

  // fallback: extract unique categories already present
  const existing = new Set();
  for (let i = 1; i < data.length; i++) {
    const cat = String(data[i][categoryCol - 1] || "").trim();
    if (cat) existing.add(cat);
  }
  return Array.from(existing);
}

/**
 * Archives a file if it exists: rename to <prefix>_<timestamp>.json
 * Attempts to trash if rename fails (Drive permissions can vary).
 */
function archiveIfExists_(folder, filename, prefix) {
  const files = folder.getFilesByName(filename);
  while (files.hasNext()) {
    const f = files.next();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const newName = `${prefix}_${ts}.json`;
    try {
      f.setName(newName);
      Logger.log(`📦 Archived ${filename} -> ${newName}`);
    } catch (e) {
      Logger.log(`⚠️ Rename archive failed; attempting trash: ${e.message}`);
      try {
        f.setTrashed(true);
      } catch (trashErr) {
        Logger.log(`❌ Trash failed (permissions?): ${trashErr.message}`);
      }
    }
  }
}

/**
 * Cleans up old task archive files, keeping only the most recent N
 */
function cleanupOldTaskFiles_(folder) {
  try {
    const files = folder.getFiles();
    const taskFiles = [];

    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      if (name.startsWith("task_") && name.endsWith(".json")) {
        taskFiles.push({ file, date: file.getDateCreated() });
      }
    }

    taskFiles.sort((a, b) => b.date - a.date);

    for (let i = BRIDGE_CONFIG.MAX_TASK_FILES; i < taskFiles.length; i++) {
      try {
        taskFiles[i].file.setTrashed(true);
        Logger.log(`🗑️ Trashed old task file: ${taskFiles[i].file.getName()}`);
      } catch (e) {
        Logger.log(`⚠️ Could not trash old task file: ${taskFiles[i].file.getName()} (${e.message})`);
      }
    }

  } catch (e) {
    Logger.log(`⚠️ Cleanup error (non-fatal): ${e.message}`);
  }
}


// ============================================================================
// INGEST PYTHON RESULTS (FAST BATCH MODE 🚀)
// ============================================================================

/**
 * 📥 Imports Python categorization results back into the sheet
 * Reads results_latest.json from Drive and updates cells in a single batch write.
 *
 * Batch writing is a recommended Apps Script best practice for speed.
 */
function ingestPythonResults() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(BRIDGE_CONFIG.LOCK_TIMEOUT_MS)) {
    SpreadsheetApp.getUi().alert("⏳ Another bridge action is running. Try again shortly 🙂");
    return;
  }

  const startTime = new Date();
  const ui = SpreadsheetApp.getUi();

  try {
    const folder = ensureBridgeFolderExists();
    const files = folder.getFilesByName(BRIDGE_CONFIG.RESULTS_FILE);

    if (!files.hasNext()) {
      ui.alert(
        "⏳ No Results Found\n\n" +
        `The "${BRIDGE_CONFIG.RESULTS_FILE}" file doesn't exist yet.\n\n` +
        "Please:\n" +
        "1) Open Google Colab 🐍\n" +
        "2) Run the DriveCategorizerBridge script\n" +
        "3) Try this import again ✅"
      );
      return;
    }

    const file = files.next();
    const content = file.getBlob().getDataAsString();
    const parsed = JSON.parse(content);

    if (parsed.error) throw new Error(`Python processing failed: ${parsed.error}`);
    if (!parsed.results || parsed.results.length === 0) {
      ui.alert("⚠️ Results file exists but contains no categorizations.");
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BRIDGE_CONFIG.DATA_SHEET_NAME);
    if (!sheet) throw new Error(`Sheet "${BRIDGE_CONFIG.DATA_SHEET_NAME}" not found`);

    const cols = resolveBridgeColumns_(sheet);

    // Build map from shortcutId -> rowIndex for stable matching
    const lastRow = sheet.getLastRow();
    const numDataRows = Math.max(lastRow - 1, 0);
    if (numDataRows === 0) {
      ui.alert("⚠️ No data rows found to update.");
      return;
    }

    const idRange = sheet.getRange(2, cols.idCol, numDataRows, 1).getValues().map(r => String(r[0] || "").trim());
    const idToRow = new Map();
    for (let i = 0; i < idRange.length; i++) {
      if (idRange[i]) idToRow.set(idRange[i], i + 2);
    }

    // Read current column state once
    const catRange = sheet.getRange(2, cols.categoryCol, numDataRows, 1);
    const catValues = catRange.getValues();
    const catBgs = catRange.getBackgrounds();
    const catNotes = catRange.getNotes();

    let updateCount = 0;
    let lowConfidenceCount = 0;
    let errorCount = 0;

    // Apply results to arrays
    for (const result of parsed.results) {
      try {
        const shortcutId = String(result.shortcutId || "").trim();
        const rowIdRaw = Number(result.rowId || 0);
        const suggested = String(result.suggestedCategory || "").trim();
        const confidence = Number(result.confidence || 0);

        if (!suggested) continue;

        // ✅ Prefer stable shortcutId mapping
        let targetRow = shortcutId ? idToRow.get(shortcutId) : null;

        // Fallback to rowId if present
        if (!targetRow && rowIdRaw >= 2) targetRow = rowIdRaw;

        if (!targetRow || targetRow < 2 || targetRow > lastRow) {
          Logger.log(`⚠️ Invalid target row. shortcutId=${shortcutId}, rowId=${rowIdRaw}`);
          errorCount++;
          continue;
        }

        const arrIndex = targetRow - 2; // row 2 => index 0
        catValues[arrIndex][0] = suggested;

        // Color by confidence
        if (confidence < 0.3) {
          catBgs[arrIndex][0] = "#FFE5E5";
          lowConfidenceCount++;
        } else if (confidence < 0.6) {
          catBgs[arrIndex][0] = "#FFF4E5";
        } else {
          catBgs[arrIndex][0] = "#E5F5E5";
        }

        // Note
        let note = `🤖 ML Categorized\n`;
        note += `Confidence: ${(confidence * 100).toFixed(1)}%\n`;

        if (result.alternatives && result.alternatives.length > 0) {
          note += `\nAlternatives:\n`;
          for (const alt of result.alternatives) {
            const c = String(alt.category || "").trim();
            const conf = Number(alt.confidence || 0);
            if (!c) continue;
            note += `• ${c} (${(conf * 100).toFixed(1)}%)\n`;
          }
        }

        catNotes[arrIndex][0] = note;
        updateCount++;

      } catch (rowError) {
        Logger.log(`⚠️ Error applying one result: ${rowError.message}`);
        errorCount++;
      }
    }

    // Write back once (FAST 🚀)
    catRange.setValues(catValues);
    catRange.setBackgrounds(catBgs);
    catRange.setNotes(catNotes);

    // Archive results file safely
    archiveIfExists_(folder, BRIDGE_CONFIG.RESULTS_FILE, "results_latest_archived");

    const elapsed = (new Date() - startTime) / 1000;

    ui.alert(
      `✅ Categorization Import Complete!\n\n` +
      `📊 Updated: ${updateCount} items\n` +
      `⚠️ Low confidence (<30%): ${lowConfidenceCount}\n` +
      `❌ Errors: ${errorCount}\n` +
      `⏱️ Time: ${elapsed.toFixed(2)}s\n\n` +
      `Processed at: ${parsed.processedAt || 'Unknown'}\n\n` +
      `💡 Tip: Review red/orange cells for manual verification 🙂`
    );

  } catch (error) {
    Logger.log(`❌ Ingestion error: ${error.toString()}`);
    ui.alert(`❌ Error: ${error.message}`);
    throw error;
  } finally {
    lock.releaseLock();
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

      if (name === BRIDGE_CONFIG.PENDING_FILE) {
        try {
          const content = JSON.parse(file.getBlob().getDataAsString());
          pendingTasks = content.totalTasks || (content.tasks ? content.tasks.length : 0);
        } catch (e) {
          pendingTasks = "⚠️ unreadable JSON";
        }
      }

      if (name === BRIDGE_CONFIG.RESULTS_FILE) {
        resultsReady = true;
      }
    }

    let status = `🌉 Bridge Status\n\n`;
    status += `📁 Folder: ${folder.getName()}\n`;
    status += `🆔 Folder ID: ${folder.getId()}\n`;
    status += `📄 Files: ${fileList.length}\n\n`;

    if (pendingTasks !== null) {
      status += `⏳ Pending Tasks: ${pendingTasks}\n`;
      status += `   (Waiting for Python processing)\n\n`;
    }

    if (resultsReady) {
      status += `✅ Results Ready!\n`;
      status += `   Click '📥 Import Results' to apply.\n\n`;
    }

    if (pendingTasks === null && !resultsReady) {
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
 * If you already have onOpen in Code.gs, call addBridgeMenu() from there instead 🙂
 */
function onOpenBridge(e) {
  addBridgeMenu();
}


// ============================================================================
// SMALL UTILITIES
// ============================================================================

function unique_(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr || []) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
