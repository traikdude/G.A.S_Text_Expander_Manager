/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ 🎉 FINAL PART (3 of 3) - PROJECT COMPLETE                                     ║
║ Lines: 1 to ~70 | Completion: 100%                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/
// ============================================================================ 
// FILE: src/cleanup.gs
// SECTION: Administrative Utilities
// STATUS: COMPLETE
// ============================================================================ 

/**
 * 🧹 ONE-TIME CLEANUP TOOL
 * Run this function manually from the editor to remove existing duplicates
 * in the "Favorites" sheet.
 * This function uses the robust, mapping-aware logic to ensure safety.
 */
function cleanupDuplicateFavorites() {
  console.log('--- Starting Favorites Cleanup ---');
  
  try {
    // Call the internal cleanup logic defined in favorites.gs
    // This logic handles dynamic column mapping and DocumentLocking.
    const report = cleanupDuplicateFavorites_();
    
    const msg = report.removedCount > 0 
      ? `✅ Cleanup Complete: Removed ${report.removedCount} duplicate entries.`
      : "✨ No duplicates found. Database is clean.";
    
    console.log(msg);
    console.log(`Initial Row Count: ${report.initialCount}`);
    console.log(`Duplicates Removed: ${report.removedCount}`);
    console.log(`Final Row Count: ${report.finalCount}`);
    
    // Provide UI feedback to the user via Message Box
    try {
      Browser.msgBox(msg + `\n\nFinal count: ${report.finalCount} unique favorites.`);
    } catch (e) {
      // Fallback for non-UI context (e.g. running from clasp/console)
      console.log('UI notification skipped (not running in bound spreadsheet context).');
    }
    
    return report;
    
  } catch (err) {
    console.error('Cleanup Failed: ' + err.message);
    try { 
      Browser.msgBox("Error during cleanup: " + err.message); 
    } catch(e) {}
    throw err;
  }
}

/**
 * ALIAS: runManualCleanup
 * Identical to cleanupDuplicateFavorites, provided for backwards compatibility.
 */
function runManualCleanup() {
  return cleanupDuplicateFavorites();
}

/**
 * Utility to verify column mapping.
 * Run this to check if the script correctly identifies your sheet structure.
 */
function debugFavoritesColumns() {
  const sheet = getSheet_(CFG.SHEET_FAVORITES);
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colMap = getFavoritesColumnMap_(header);

  console.log('Current Headers:', header);
  console.log('Mapped Indices:', colMap);

  return colMap;
}

// ============================================================================
// SHORTCUTS CLEANUP UTILITIES
// ============================================================================

/**
 * ONE-TIME CLEANUP: Removes all duplicate shortcuts from the "Shortcuts" sheet.
 * Keeps the FIRST occurrence of each Snippet Name, removes subsequent duplicates.
 * Run this manually from the Apps Script editor to clean existing duplicates.
 *
 * @return {Object} Report { initialCount, removedCount, finalCount, duplicateKeys }
 */
function cleanupDuplicateShortcuts() {
  console.log('--- Starting Shortcuts Cleanup ---');

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      const msg = 'No data rows to clean (only header found).';
      console.log(msg);
      return { initialCount: 0, removedCount: 0, finalCount: 0, duplicateKeys: [] };
    }

    const header = data[0];
    const { col } = getShortcutsHeaderAndColMap_(sheet);

    const seen = new Set();
    const rowsToDelete = [];
    const duplicateKeys = [];

    // Scan for duplicates (keep first occurrence)
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][col.key] || '').trim();

      if (!key) continue; // Skip empty keys

      if (seen.has(key)) {
        // Duplicate found
        rowsToDelete.push(i + 1); // 1-based row index
        if (!duplicateKeys.includes(key)) {
          duplicateKeys.push(key);
        }
      } else {
        seen.add(key);
      }
    }

    // Delete duplicates (bottom-up to preserve indices)
    rowsToDelete.sort((a, b) => b - a);
    for (let i = 0; i < rowsToDelete.length; i++) {
      sheet.deleteRow(rowsToDelete[i]);
    }

    // Invalidate cache after cleanup
    if (rowsToDelete.length > 0) {
      bumpCacheVersion_();
      invalidateShortcutsCache_();
    }

    const report = {
      initialCount: data.length - 1,
      removedCount: rowsToDelete.length,
      finalCount: (data.length - 1) - rowsToDelete.length,
      duplicateKeys: duplicateKeys
    };

    const msg = report.removedCount > 0
      ? `Cleanup Complete: Removed ${report.removedCount} duplicate shortcuts.`
      : 'No duplicates found. Shortcuts sheet is clean.';

    console.log(msg);
    console.log(`Initial Row Count: ${report.initialCount}`);
    console.log(`Duplicates Removed: ${report.removedCount}`);
    console.log(`Final Row Count: ${report.finalCount}`);
    if (duplicateKeys.length > 0) {
      console.log(`Duplicate Keys: ${duplicateKeys.join(', ')}`);
    }

    // UI feedback
    try {
      Browser.msgBox(
        'Shortcuts Cleanup',
        msg + `\\n\\nDetails:\\n- Initial: ${report.initialCount} rows\\n- Removed: ${report.removedCount} duplicates\\n- Final: ${report.finalCount} rows`,
        Browser.Buttons.OK
      );
    } catch (e) {
      console.log('UI notification skipped (not running in bound spreadsheet context).');
    }

    return report;

  } catch (err) {
    console.error('Shortcuts Cleanup Failed: ' + err.message);
    try {
      Browser.msgBox('Error', 'Cleanup failed: ' + err.message, Browser.Buttons.OK);
    } catch (e) {}
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/**
 * MASTER CLEANUP: Cleans both Shortcuts and Favorites sheets.
 * Run this once to ensure your entire database is duplicate-free.
 */
function cleanupAllDuplicates() {
  console.log('=== MASTER CLEANUP STARTED ===');

  let shortcutsReport, favoritesReport;

  try {
    console.log('Step 1: Cleaning Shortcuts...');
    shortcutsReport = cleanupDuplicateShortcuts();

    console.log('Step 2: Cleaning Favorites...');
    favoritesReport = cleanupDuplicateFavorites();

    const totalRemoved = shortcutsReport.removedCount + favoritesReport.removedCount;
    const msg = totalRemoved > 0
      ? `Master Cleanup Complete!\\n\\nShortcuts: ${shortcutsReport.removedCount} duplicates removed\\nFavorites: ${favoritesReport.removedCount} duplicates removed`
      : 'No duplicates found in either sheet. Database is clean!';

    console.log('=== MASTER CLEANUP COMPLETE ===');
    console.log(`Total duplicates removed: ${totalRemoved}`);

    try {
      Browser.msgBox('Master Cleanup', msg, Browser.Buttons.OK);
    } catch (e) {}

    return {
      shortcuts: shortcutsReport,
      favorites: favoritesReport,
      totalRemoved: totalRemoved
    };

  } catch (err) {
    console.error('Master Cleanup Failed: ' + err.message);
    throw err;
  }
}

/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ ✅ DELIVERY COMPLETE - ALL FILES PROVIDED                                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
📦 COMPLETE FILE INVENTORY:
✅ src/favorites.gs (Refactored Unified Logic)
✅ src/uiHandlers.gs (Delegation Update)
✅ src/cleanup.gs (Admin Tools)

🎯 DEPLOYMENT CHECKLIST:
1. Run 'clasp push' to update your Google Apps Script project.
2. In the Apps Script Editor, select 'cleanupDuplicateFavorites' and click 'Run'.
3. Verify the "Favorites" sheet is now clean.
4. Test the Web App toggle and "Copy" actions — duplicates are now impossible.

🚀 YOUR 4 POST-DELIVERY OPTIONS:
1️⃣ VERIFY → Run 'clasp run cleanupDuplicateFavorites' to clean the sheet via CLI
2️⃣ TEST → Generate a race-condition simulation script to prove the fix
3️⃣ DOCUMENT → Generate a technical README for these changes
4️⃣ NEXT → Move to the 'gas-to-python-migration' task
*/