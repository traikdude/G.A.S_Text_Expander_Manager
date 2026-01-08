/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ src/cleanup.gs - Administrative Utilities (Revised)                           ║
║ Fixes:                                                                        ║
║ 1) Never show UI dialogs while holding a LockService lock 🔒🚫                ║
║ 2) Fast duplicate removal using rebuild + setValues (no deleteRow loops) 🚀   ║
║ 3) Safe UI notifications across bound/unbound contexts 🧩                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/

/**
 * 🧹 ONE-TIME CLEANUP TOOL
 * Run manually to remove exact duplicates in Favorites sheet.
 * Delegates to favorites.gs internal cleanupDuplicateFavorites_().
 */
function cleanupDuplicateFavorites() {
  console.log('--- 🧹 Starting Favorites Cleanup ---');

  let report;
  let msg;

  try {
    // ✅ Data ops happen inside favorites.gs and its own locking logic
    report = cleanupDuplicateFavorites_();

    msg = report.removedCount > 0
      ? `✅ Cleanup Complete: Removed ${report.removedCount} duplicate favorite entr${report.removedCount === 1 ? 'y' : 'ies'}.`
      : '✨ No duplicates found. Favorites database is clean.';

    console.log(msg);
    console.log(`Initial Row Count: ${report.initialCount}`);
    console.log(`Duplicates Removed: ${report.removedCount}`);
    console.log(`Final Row Count: ${report.finalCount}`);

    // ✅ UI feedback (safe)
    notifyUser_(
      '⭐ Favorites Cleanup',
      msg + `\n\nFinal count: ${report.finalCount} unique favorites.`
    );

    return report;

  } catch (err) {
    console.error('❌ Favorites Cleanup Failed: ' + err.message);
    notifyUser_('❌ Favorites Cleanup Error', 'Error during cleanup:\n\n' + err.message);
    throw err;
  }
}

/**
 * ALIAS: runManualCleanup (Backwards compatibility)
 */
function runManualCleanup() {
  return cleanupDuplicateFavorites();
}

/**
 * Utility to verify column mapping for Favorites.
 */
function debugFavoritesColumns() {
  const sheet = getSheet_(CFG.SHEET_FAVORITES);
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colMap = getFavoritesColumnMap_(header);

  console.log('Current Headers:', header);
  console.log('Mapped Indices:', colMap);

  notifyUser_(
    '🔎 Favorites Column Map',
    'Check Logs for full details.\n\nMapped indices:\n' + JSON.stringify(colMap, null, 2)
  );

  return colMap;
}

// ============================================================================
// SHORTCUTS CLEANUP UTILITIES
// ============================================================================

/**
 * ONE-TIME CLEANUP: Removes duplicate shortcuts from the "Shortcuts" sheet.
 * Keeps the FIRST occurrence of each Snippet Name, removes subsequent duplicates.
 *
 * ✅ Revised: Uses rebuild + setValues for speed (no deleteRow loops).
 * ✅ Revised: Releases lock BEFORE any UI dialogs. 🔒🚫
 *
 * @param {Object=} options - Optional { dryRun:boolean, keyMode:string }
 *   keyMode:
 *     - 'snippet' (default): uniqueness by Snippet Name
 *     - 'snippet|application|language': stricter uniqueness
 *
 * @return {Object} Report { initialCount, removedCount, finalCount, duplicateKeys }
 */
function cleanupDuplicateShortcuts(options) {
  console.log('--- 🧹 Starting Shortcuts Cleanup ---');

  const opts = normalizeCleanupOptions_(options);

  const lock = LockService.getScriptLock();
  let report;
  let msg;

  try {
    lock.waitLock(30000);

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1) {
      msg = 'ℹ️ No data rows to clean (only header found).';
      console.log(msg);

      report = { initialCount: 0, removedCount: 0, finalCount: 0, duplicateKeys: [] };
      return report;
    }

    // Read all values at once ✅
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const header = data[0];

    // Validate required headers exist ✅
    const colMap = indexHeader_(header);
    if (colMap['Snippet Name'] === undefined || colMap['Content'] === undefined) {
      throw new Error('Shortcuts sheet is missing required headers (Snippet Name / Content).');
    }

    const keyColIdx = colMap['Snippet Name'];
    const appColIdx = colMap['Application']; // may be undefined
    const langColIdx = colMap['Language'];   // may be undefined

    const seen = new Set();
    const duplicateKeys = [];
    const keepRows = [];
    keepRows.push(header); // keep header

    // Build filtered dataset 🚀
    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      const snippet = String(row[keyColIdx] || '').trim();
      if (!snippet) continue; // Skip empty keys

      const compositeKey = buildShortcutUniqKey_(opts.keyMode, snippet, row, appColIdx, langColIdx);

      if (seen.has(compositeKey)) {
        // Duplicate found
        if (!duplicateKeys.includes(snippet)) duplicateKeys.push(snippet);
        continue;
      }

      seen.add(compositeKey);
      keepRows.push(row);
    }

    const initialCount = data.length - 1;
    const finalCount = keepRows.length - 1;
    const removedCount = initialCount - finalCount;

    report = {
      initialCount: initialCount,
      removedCount: removedCount,
      finalCount: finalCount,
      duplicateKeys: duplicateKeys
    };

    if (opts.dryRun) {
      msg = removedCount > 0
        ? `🧪 DRY RUN: Would remove ${removedCount} duplicate shortcut row${removedCount === 1 ? '' : 's'}.`
        : '🧪 DRY RUN: No duplicates found. Shortcuts sheet is clean.';
      console.log(msg);
      console.log(`Initial Row Count: ${report.initialCount}`);
      console.log(`Duplicates Would Remove: ${report.removedCount}`);
      console.log(`Final Row Count Would Be: ${report.finalCount}`);
      if (duplicateKeys.length > 0) console.log(`Duplicate Snippet Names: ${duplicateKeys.join(', ')}`);
      return report;
    }

    // Write back in one shot ✅🚀
    rewriteSheetValuesPreserveFormatting_(sheet, keepRows);

    // Invalidate cache after cleanup ✅
    if (removedCount > 0) {
      try { bumpCacheVersion_(); } catch (e) {}
      try { invalidateShortcutsCache_(); } catch (e) {}
    }

    msg = removedCount > 0
      ? `✅ Cleanup Complete: Removed ${removedCount} duplicate shortcut row${removedCount === 1 ? '' : 's'}.`
      : '✨ No duplicates found. Shortcuts sheet is clean.';

    console.log(msg);
    console.log(`Initial Row Count: ${report.initialCount}`);
    console.log(`Duplicates Removed: ${report.removedCount}`);
    console.log(`Final Row Count: ${report.finalCount}`);
    if (duplicateKeys.length > 0) console.log(`Duplicate Snippet Names: ${duplicateKeys.join(', ')}`);

    return report;

  } catch (err) {
    console.error('❌ Shortcuts Cleanup Failed: ' + err.message);
    throw err;

  } finally {
    // ✅ ALWAYS release lock ASAP 🔒
    lock.releaseLock();
  }
}

/**
 * MASTER CLEANUP: Cleans both Shortcuts and Favorites.
 */
function cleanupAllDuplicates() {
  console.log('=== 🧹 MASTER CLEANUP STARTED ===');

  let shortcutsReport;
  let favoritesReport;

  try {
    console.log('Step 1: Cleaning Shortcuts...');
    shortcutsReport = cleanupDuplicateShortcuts({ dryRun: false, keyMode: 'snippet' });

    console.log('Step 2: Cleaning Favorites...');
    favoritesReport = cleanupDuplicateFavorites();

    const totalRemoved = (shortcutsReport.removedCount || 0) + (favoritesReport.removedCount || 0);

    const msg = totalRemoved > 0
      ? `✅ Master Cleanup Complete!\n\nShortcuts: ${shortcutsReport.removedCount} removed\nFavorites: ${favoritesReport.removedCount} removed`
      : '✨ No duplicates found in either sheet. Database is clean!';

    console.log('=== ✅ MASTER CLEANUP COMPLETE ===');
    console.log(`Total duplicates removed: ${totalRemoved}`);

    // ✅ UI feedback (safe) — IMPORTANT: no locks are held here
    notifyUser_('🧼 Master Cleanup', msg);

    return {
      shortcuts: shortcutsReport,
      favorites: favoritesReport,
      totalRemoved: totalRemoved
    };

  } catch (err) {
    console.error('❌ Master Cleanup Failed: ' + err.message);
    notifyUser_('❌ Master Cleanup Error', err.message);
    throw err;
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Safe UI notifier: uses Spreadsheet UI if available, else logs only.
 * UI only works for container-bound scripts in an active editor session.
 * Also avoids suspending script mid-lock by being called only after locks are released.
 */
function notifyUser_(title, message) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(String(title || 'Notice'), String(message || ''), ui.ButtonSet.OK);
  } catch (e) {
    console.log(`(UI skipped) ${title}: ${message}`);
  }
}

/**
 * Normalize cleanup options.
 */
function normalizeCleanupOptions_(options) {
  const o = options || {};
  return {
    dryRun: !!o.dryRun,
    keyMode: String(o.keyMode || 'snippet')
  };
}

/**
 * Build uniqueness key based on selected mode.
 */
function buildShortcutUniqKey_(mode, snippet, row, appColIdx, langColIdx) {
  if (mode === 'snippet|application|language') {
    const app = appColIdx !== undefined ? String(row[appColIdx] || '').trim() : '';
    const lang = langColIdx !== undefined ? String(row[langColIdx] || '').trim() : '';
    return `${snippet}||${app}||${lang}`;
  }
  // default 'snippet'
  return snippet;
}

/**
 * Rewrite sheet values while preserving formatting/validations as much as possible.
 * Strategy:
 * - Clear contents in used range
 * - Write new values
 * - Clear leftover rows (if any) to avoid ghost data
 */
function rewriteSheetValuesPreserveFormatting_(sheet, values2d) {
  const newRowCount = values2d.length;
  const newColCount = values2d[0].length;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // Clear only contents, not formatting 🎨
  if (lastRow > 0 && lastCol > 0) {
    sheet.getRange(1, 1, lastRow, lastCol).clearContent();
  }

  // Write new dataset ✅
  sheet.getRange(1, 1, newRowCount, newColCount).setValues(values2d);

  // If old range bigger, clear the rest 🧹
  if (lastRow > newRowCount) {
    sheet.getRange(newRowCount + 1, 1, lastRow - newRowCount, lastCol).clearContent();
  }
}

/**
 * Quick debug helper: preview duplicate removal without making changes.
 * (Optional convenience)
 */
function previewDuplicateShortcutsCleanup() {
  const report = cleanupDuplicateShortcuts({ dryRun: true, keyMode: 'snippet' });
  notifyUser_(
    '🧪 Preview Shortcuts Cleanup',
    `Initial: ${report.initialCount}\nWould Remove: ${report.removedCount}\nFinal: ${report.finalCount}\n\n(See logs for duplicate keys)`
  );
  return report;
}