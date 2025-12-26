/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ PART 1 of 3: src/favorites.gs - Core Logic Unification                        ║
║ Lines: 1 to ~200 | Completion: 33%                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/
// ============================================================================
// FILE: src/favorites.gs
// SECTION: Core Favorites Logic (Single Source of Truth)
// STATUS: COMPLETE
// ============================================================================

/**
 * INTERNAL: FAVORITES CORE LOGIC
 * Handles all reads, writes, and updates to the Favorites sheet.
 * Enforces uniqueness and handles concurrency via LockService.
 */

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Lists favorites for the current user (internal).
 * @return {Array<Object>} Favorites list [{ key, createdAt }].
 */
function listMyFavorites_() {
  const userEmail = getUserEmail_();
  if (!userEmail) return [];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const favSheet = getSheet_(CFG.SHEET_FAVORITES);
    const data = favSheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    const header = data[0];
    const col = getFavoritesColumnMap_(header);

    const out = [];
    const seenKeys = new Set();
    const rowsToDelete = [];
    
    for (let i = 1; i < data.length; i++) {
      const email = String(data[i][col.userEmail] || '').trim();
      const key = String(data[i][col.key] || '').trim();
      const createdAt = String(data[i][col.createdAt] || '').trim();
      
      if (email === userEmail && key) {
        if (!seenKeys.has(key)) {
          out.push({ key, createdAt });
          seenKeys.add(key);
        } else {
          rowsToDelete.push(i + 1);
        }
      }
    }

    if (rowsToDelete.length > 0) {
      rowsToDelete.sort((a, b) => b - a);
      for (let i = 0; i < rowsToDelete.length; i++) {
        favSheet.deleteRow(rowsToDelete[i]);
      }
    }

    return out;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Gets column map for Favorites sheet.
 * @param {Array} header - Header row.
 * @return {Object} Column indices.
 */
function getFavoritesColumnMap_(header) {
  const idx = indexHeader_(header);
  return {
    userEmail: idx['UserEmail'],
    key: idx['Snippet Name'],
    createdAt: idx['CreatedAt'],
  };
}

// ============================================================================
// WRITE OPERATIONS (ATOMIC)
// ============================================================================

/**
 * Master function to update favorite status.
 * Handles both Toggling and Forcing (Set/Add/Remove).
 * AUTO-HEALS duplicates by deleting all matches before adding (if needed).
 * 
 * @param {string} snippetName - The shortcut key.
 * @param {Object} options - { mode: 'toggle'|'force_add'|'force_remove' }
 * @return {Object} result - { status: 'added'|'removed'|'unchanged'|'error', snippet: snippetName }
 */
function updateFavoriteStatus_(snippetName, options = { mode: 'toggle' }) {
  // 🔥 FIX: Use getUserEmail_() helper instead of direct Session call
  const userEmail = getUserEmail_();
  if (!userEmail) {
    console.error('[updateFavoriteStatus_] User email not available');
    return { 
      status: 'error', 
      snippet: snippetName, 
      message: 'User email not available. Please reload the app.' 
    };
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CFG.SHEET_FAVORITES);
  
  if (!sheet) {
    console.error('[updateFavoriteStatus_] Favorites sheet not found');
    return {
      status: 'error',
      snippet: snippetName,
      message: 'Favorites sheet not found.'
    };
  }
  
  // 🔒 Use DocumentLock to synchronize with all other users/processes
  const lock = LockService.getScriptLock();
  
  try {
    // Wait up to 10 seconds for the lock
    lock.waitLock(10000);
    
    const data = sheet.getDataRange().getValues();
    
    // Ensure headers exist if sheet is empty
    if (data.length === 0) {
      sheet.appendRow(HEADERS_FAVORITES);
    }
    
    const header = data.length > 0 ? data[0] : HEADERS_FAVORITES;
    const col = getFavoritesColumnMap_(header);
    
    const targetEmail = String(userEmail || '').trim();
    const targetKey = String(snippetName || '').trim();
    
    if (!targetKey) {
      return { 
        status: 'error', 
        snippet: '', 
        message: 'Invalid snippet name.' 
      };
    }
    
    const rowsToDelete = [];
    
    // 🔍 Step 1: Find ALL existing entries for this user/key
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = String(row[col.userEmail] || '').trim();
      const rowKey = String(row[col.key] || '').trim();
      
      if (rowEmail === targetEmail && rowKey === targetKey) {
        rowsToDelete.push(i + 1); // Store 1-based row index
      }
    }
    
    // 🧠 Step 2: Determine Action based on Mode and Existence
    const exists = rowsToDelete.length > 0;
    let shouldAdd = false;
    let shouldDelete = false;
    let resultStatus = 'unchanged';
    
    if (options.mode === 'toggle') {
      if (exists) {
        shouldDelete = true;
        resultStatus = 'removed';
      } else {
        shouldAdd = true;
        resultStatus = 'added';
      }
    } else if (options.mode === 'force_add') {
      if (exists) {
        if (rowsToDelete.length > 1) {
             shouldDelete = true;
             shouldAdd = true;
             resultStatus = 'added';
        } else {
             resultStatus = 'added';
        }
      } else {
        shouldAdd = true;
        resultStatus = 'added';
      }
    } else if (options.mode === 'force_remove') {
      if (exists) {
        shouldDelete = true;
        resultStatus = 'removed';
      } else {
        resultStatus = 'removed';
      }
    }
    
    // 🚜 Step 3: Execute Changes
    
    // Delete first (reverse order to preserve indices)
    if (shouldDelete && rowsToDelete.length > 0) {
      rowsToDelete.sort((a, b) => b - a);
      for (let i = 0; i < rowsToDelete.length; i++) {
        sheet.deleteRow(rowsToDelete[i]);
      }
    }
    
    // Add if needed
    if (shouldAdd) {
      sheet.appendRow([userEmail, targetKey, new Date().toISOString()]);
    }
    
    return { status: resultStatus, snippet: targetKey };
    
  } catch (e) {
    console.error(`[updateFavoriteStatus_] Error: ${e.toString()}`);
    // 🔥 FIX: Return error object instead of throwing
    return { 
      status: 'error', 
      snippet: snippetName, 
      message: `Failed to update favorite: ${e.message}` 
    };
    
  } finally {
    lock.releaseLock();
  }
}

/**
 * Public wrapper: Toggles a favorite.
 * Used by UI buttons.
 */
function toggleFavorite(snippetName) {
  return updateFavoriteStatus_(snippetName, { mode: 'toggle' });
}

/**
 * Public wrapper: Adds a favorite (Idempotent).
 * Used by Clipboard actions.
 */
function addToFavorites(snippetName) {
  return updateFavoriteStatus_(snippetName, { mode: 'force_add' });
}

/**
 * Public wrapper: Removes a favorite.
 */
function removeFavorite(snippetName) {
  return updateFavoriteStatus_(snippetName, { mode: 'force_remove' });
}

/**
 * Removes favorite for all users when shortcut is deleted.
 * @param {string} key - Snippet Name.
 */
function removeFavoriteForAllUsers_(key) {
  const k = String(key || '').trim();
  if (!k) return;
  const sheet = getSheet_(CFG.SHEET_FAVORITES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const header = data[0];
  const col = getFavoritesColumnMap_(header);
  const rowsToDelete = [];

  for (let i = 1; i < data.length; i++) {
    const rowKey = String(data[i][col.key] || '').trim();
    if (rowKey === k) rowsToDelete.push(i + 1);
  }

  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }
}

// ============================================================================
// CLEANUP UTILITIES
// ============================================================================

/**
 * ADMIN: Scans the entire Favorites sheet and removes EXACT duplicates.
 * Keeps the oldest entry (lowest row index) for each User+Key pair.
 * @return {Object} Report { initialCount, removedCount, finalCount }
 */
function cleanupDuplicateFavorites_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  
  try {
    const sheet = getSheet_(CFG.SHEET_FAVORITES);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { initialCount: 0, removedCount: 0, finalCount: 0 };
    
    const header = data[0];
    const col = getFavoritesColumnMap_(header);
    
    const seen = new Set();
    const rowsToDelete = [];
    
    // Identify duplicates
    for (let i = 1; i < data.length; i++) {
      const email = String(data[i][col.userEmail] || '').trim();
      const key = String(data[i][col.key] || '').trim();
      
      // Composite key for uniqueness
      const composite = `${email}|${key}`;
      
      if (seen.has(composite)) {
        // Duplicate found! Mark for deletion.
        rowsToDelete.push(i + 1);
      } else {
        seen.add(composite);
      }
    }
    
    // Execute deletion (bottom-up)
    rowsToDelete.sort((a, b) => b - a);
    for (let i = 0; i < rowsToDelete.length; i++) {
      sheet.deleteRow(rowsToDelete[i]);
    }
    
    return {
      initialCount: data.length - 1,
      removedCount: rowsToDelete.length,
      finalCount: (data.length - 1) - rowsToDelete.length
    };
    
  } finally {
    lock.releaseLock();
  }
}

/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ END OF PART 1                                                                 ║
║ Next: Part 2 will update uiHandlers.gs to use this new logic.                 ║
║ Progress: ██████░░░░ 33%                                                      ║
╚═══════════════════════════════════════════════════════════════════════════════╝
🎯 WHAT'S NEXT:
Reply "CONTINUE" for Part 2.
🚀 YOUR 4 NAVIGATION OPTIONS:
1️⃣ CONTINUE → Proceed to Part 2 (update uiHandlers.gs)
2️⃣ REVIEW → Check the unified logic in Part 1
3️⃣ MODIFY → Change how duplicates are handled
4️⃣ EXPLAIN → Why 'force_add' logic was chosen
*/
