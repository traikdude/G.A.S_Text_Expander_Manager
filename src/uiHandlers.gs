/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ PART 2 of 3: src/uiHandlers.gs - Logic Delegation                             ║
║ Lines: 1 to ~300 | Completion: 66%                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/
// ============================================================================
// FILE: src/uiHandlers.gs
// SECTION: Public API & UI Handlers
// STATUS: COMPLETE
// ============================================================================

/**
 * PUBLIC API FUNCTIONS (Called from HTML UI via google.script.run)
 * Delegates complex logic to specialized internal files.
 */

// ============================================================================
// BOOTSTRAP
// ============================================================================

/**
 * UI bootstrap loader.
 * Returns metadata. Client must initiate snapshot creation.
 * @return {Object} Bootstrap payload.
 */
function getAppBootstrapData() {
  ensureSheets_();
  const userEmail = getUserEmail_();
  
  // Use new centralized reader
  const favorites = listMyFavorites_();
  
  return {
    ok: true,
    userEmail,
    favorites,
    webAppUrl: getWebAppUrl_(),
    version: getCacheVersion_(),
    sheetNames: { shortcuts: CFG.SHEET_SHORTCUTS, favorites: CFG.SHEET_FAVORITES },
  };
}

/**
 * Creates a snapshot and returns the first batch.
 */
function beginShortcutsSnapshotHandler() {
  try {
    const meta = beginShortcutsSnapshot();
    const batch = fetchSnapshotPage_(meta.snapshotToken, 0, CFG.INITIAL_PAGE_SIZE);
    
    if (batch.error) throw new Error(batch.error);

    // Map favorites
    const favorites = listMyFavorites_();
    const favSet = new Set(favorites.map(f => f.key));
    
    batch.items = batch.items.map(s => ({
      key: s.key,
      expansion: s.expansion,
      application: s.application,
      description: s.description,
      language: s.language,
      tags: s.tags,
      updatedAt: s.updatedAt,
      favorite: favSet.has(s.key),
    }));

    return {
      ok: true,
      snapshotToken: meta.snapshotToken,
      total: meta.total,
      builtAt: meta.builtAt,
      shortcuts: batch.items,
      offset: batch.offset,
      hasMore: batch.hasMore
    };
  } catch (err) {
    return { ok: false, message: stringifyError_(err) };
  }
}

/**
 * Fetches a specific batch of shortcuts from a snapshot.
 * @param {string} snapshotToken - The snapshot ID.
 * @param {number} offset - Start index.
 * @param {number} limit - Number of items to fetch.
 * @return {Object} Batch result.
 */
function fetchShortcutsBatch(snapshotToken, offset, limit) {
  try {
    if (!snapshotToken) return { ok: false, message: 'Missing snapshot token' };

    const batch = fetchSnapshotPage_(snapshotToken, offset, limit);
    
    if (batch.error === 'SNAPSHOT_EXPIRED') {
      return { ok: false, error: 'SNAPSHOT_EXPIRED', message: 'Snapshot expired. Reloading...' };
    }

    // Re-map favorites state (fresh read to ensure accuracy)
    const favorites = listMyFavorites_();
    const favSet = new Set(favorites.map(f => f.key));

    const mapped = batch.items.map(s => ({
      key: s.key,
      expansion: s.expansion,
      application: s.application,
      description: s.description,
      language: s.language,
      tags: s.tags,
      updatedAt: s.updatedAt,
      favorite: favSet.has(s.key),
    }));

    if (CFG.DEBUG_MODE) {
      console.log(`[FetchBatch] Token: ${snapshotToken.substring(0,8)}..., Offset: ${offset}, Limit: ${limit}, Returned: ${mapped.length}`);
    }

    return {
      ok: true,
      shortcuts: mapped,
      offset: batch.offset,
      hasMore: batch.hasMore,
      total: batch.total,
      snapshotToken: snapshotToken
    };
  } catch (err) {
    return { ok: false, message: stringifyError_(err) };
  }
}

// ============================================================================
// SHORTCUT CRUD (Create, Read, Update, Delete)
// ============================================================================

/**
 * Creates or updates a shortcut by Snippet Name (key).
 * FIXED: Now properly handles duplicates by deleting ALL matching rows before writing.
 * @param {Object} payload - Shortcut data.
 * @return {Object} Result object.
 */
function upsertShortcut(payload) {
  ensureSheets_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const v = validateShortcutPayload_(payload);
    if (!v.ok) return v;

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const { header, col } = getShortcutsHeaderAndColMap_(sheet);
    const width = header.length;

    const nowIso = new Date().toISOString();
    const key = String(payload.key).trim();

    // FIXED: Find ALL rows with this key, not just the first
    const allKeys = getColumnValues_(sheet, col.key);
    const matchingRows = findAllRowsByKey_(allKeys, key);
    const hadExisting = matchingRows.length > 0;

    // Build the new row
    const row = new Array(width).fill('');
    row[col.key] = key;
    row[col.expansion] = String(payload.expansion || '').slice(0, CFG.MAX_FIELD_LEN);
    row[col.application] = String(payload.application || '').slice(0, CFG.MAX_APP_LEN);
    row[col.description] = String(payload.description || '').slice(0, CFG.MAX_DESC_LEN);
    row[col.language] = String(payload.language || '').slice(0, CFG.MAX_LANGUAGE_LEN);
    row[col.tags] = String(payload.tags || '').slice(0, CFG.MAX_TAGS_LEN);
    row[col.updatedAt] = nowIso;

    // FIXED: Delete ALL existing duplicates first (reverse order to preserve indices)
    if (matchingRows.length > 0) {
      matchingRows.sort((a, b) => b - a); // Descending order
      for (let i = 0; i < matchingRows.length; i++) {
        sheet.deleteRow(matchingRows[i]);
      }
    }

    // Always append the new/updated row
    sheet.appendRow(row);
    bumpCacheVersion_();
    invalidateShortcutsCache_();

    return {
      ok: true,
      action: hadExisting ? 'updated' : 'created',
      message: hadExisting ? `Updated shortcut: ${key}` : `Created shortcut: ${key}`
    };
  } catch (err) {
    return { ok: false, message: `Upsert failed: ${stringifyError_(err)}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a shortcut by key.
 * FIXED: Now deletes ALL matching rows (handles duplicates).
 * @param {string} key - Snippet Name.
 * @return {Object} Result.
 */
function deleteShortcut(key) {
  ensureSheets_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const k = String(key || '').trim();
    if (!k) return { ok: false, message: 'Missing shortcut key.' };

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const { col } = getShortcutsHeaderAndColMap_(sheet);

    // FIXED: Find ALL rows with this key, not just the first
    const allKeys = getColumnValues_(sheet, col.key);
    const matchingRows = findAllRowsByKey_(allKeys, k);

    if (matchingRows.length === 0) return { ok: false, message: `Shortcut not found: ${k}` };

    // Delete all matching rows (reverse order to preserve indices)
    matchingRows.sort((a, b) => b - a);
    for (let i = 0; i < matchingRows.length; i++) {
      sheet.deleteRow(matchingRows[i]);
    }

    // Clean up favorites using unified logic
    removeFavoriteForAllUsers_(k);

    bumpCacheVersion_();
    invalidateShortcutsCache_();
    return { ok: true, message: `Deleted shortcut: ${k}` };
  } catch (err) {
    return { ok: false, message: `Delete failed: ${stringifyError_(err)}` };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// FAVORITES (Delegated to favorites.gs)
// ============================================================================

/**
 * Unified handler for clipboard favoriting (auto-favorites on copy).
 * Now calls the centralized 'addToFavorites' which handles deduplication.
 * @param {string} key - Snippet Name.
 * @return {Object} Result.
 */
function handleClipboardFavorite(key) {
  try {
    const res = addToFavorites(key); // Defined in favorites.gs
    // Map internal result to UI expected format if needed, 
    // though UI mostly cares about success.
    return { ok: true, message: 'Added to favorites.', favorite: true };
  } catch (err) {
    return { ok: false, message: `Clipboard favorite failed: ${err.message}` };
  }
}

/**
 * Lists favorites for the current user.
 * @return {Array<Object>} Favorites list.
 */
function listMyFavorites() {
  ensureSheets_();
  return listMyFavorites_();
}

/**
 * Deprecated: Legacy setFavorite is REMOVED.
 * Use toggleFavorite() or addToFavorites() directly.
 */

// ============================================================================
// ANALYTICS & IMPORT
// ============================================================================

/**
 * Logs copy actions (optional analytics hook).
 * @param {string} shortcutKey - Shortcut key copied.
 * @return {Object} Result.
 */
function logCopyAction(shortcutKey) {
  try {
    const email = getUserEmail_() || 'unknown';
    console.log(`Copy: ${String(shortcutKey || '').trim()} by ${email}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: stringifyError_(err) };
  }
}

/**
 * Bulk import pasted CSV or JSON.
 * FIXED: Now properly cleans up duplicates before importing.
 * @param {Object} payload - Import payload.
 * @return {Object} Import result.
 */
function bulkImport(payload) {
  ensureSheets_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const mode = String(payload && payload.mode || '').toLowerCase().trim();
    const text = String(payload && payload.text || '');
    const defaultApplication = String(payload && payload.defaultApplication || '').trim();
    const defaultLanguage = String(payload && payload.defaultLanguage || '').trim();

    if (!mode || (mode !== 'csv' && mode !== 'json')) {
      return { ok: false, message: 'Import mode must be "csv" or "json".' };
    }
    if (!text.trim()) {
      return { ok: false, message: 'Paste CSV or JSON content first.' };
    }

    const parsedRows = mode === 'json'
      ? parseImportJson_(text, defaultApplication, defaultLanguage)
      : parseImportCsv_(text, defaultApplication, defaultLanguage);

    if (!parsedRows.ok) return parsedRows;

    const rows = parsedRows.rows;
    if (rows.length === 0) return { ok: false, message: 'No rows parsed from input.' };

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const { header, col } = getShortcutsHeaderAndColMap_(sheet);
    const width = header.length;
    const nowIso = new Date().toISOString();

    // Collect unique keys from import data
    const processedKeys = new Set();
    const validRows = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const v = validateShortcutPayload_(r);
      if (!v.ok) {
        errors.push({ index: i + 1, key: r.key || '', message: v.message });
        continue;
      }
      const key = String(r.key).trim();
      if (processedKeys.has(key)) continue; // Skip duplicate keys in import
      processedKeys.add(key);
      validRows.push(r);
    }

    // FIXED: First, delete ALL existing rows for the keys we're importing
    // This ensures no duplicates remain
    const existingKeys = getColumnValues_(sheet, col.key);
    const rowsToDelete = [];

    for (let i = 0; i < existingKeys.length; i++) {
      const existingKey = String(existingKeys[i] || '').trim();
      if (processedKeys.has(existingKey)) {
        rowsToDelete.push(i + 2); // +2: 1-based + header row
      }
    }

    // Delete in reverse order to preserve indices
    rowsToDelete.sort((a, b) => b - a);
    let updatedCount = 0;
    for (let i = 0; i < rowsToDelete.length; i++) {
      sheet.deleteRow(rowsToDelete[i]);
      updatedCount++;
    }

    // Now insert all valid rows
    const inserts = [];
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const row = new Array(width).fill('');
      row[col.key] = String(r.key).trim();
      row[col.expansion] = String(r.expansion || '').slice(0, CFG.MAX_FIELD_LEN);
      row[col.application] = String(r.application || '').slice(0, CFG.MAX_APP_LEN);
      row[col.description] = String(r.description || '').slice(0, CFG.MAX_DESC_LEN);
      row[col.language] = String(r.language || '').slice(0, CFG.MAX_LANGUAGE_LEN);
      row[col.tags] = String(r.tags || '').slice(0, CFG.MAX_TAGS_LEN);
      row[col.updatedAt] = nowIso;
      inserts.push(row);
    }

    // Batch insert all rows
    for (let start = 0; start < inserts.length; start += 500) {
      const chunk = inserts.slice(start, start + 500);
      if (chunk.length > 0) {
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, chunk.length, width).setValues(chunk);
      }
    }

    bumpCacheVersion_();
    invalidateShortcutsCache_();

    // Count how many were updates vs new inserts
    const insertedCount = inserts.length - (rowsToDelete.length > 0 ? Math.min(rowsToDelete.length, inserts.length) : 0);

    return {
      ok: true,
      message: `Import complete. Updated: ${Math.min(rowsToDelete.length, inserts.length)}. Inserted: ${Math.max(0, inserts.length - rowsToDelete.length)}. Errors: ${errors.length}.`,
      updated: Math.min(rowsToDelete.length, inserts.length),
      inserted: Math.max(0, inserts.length - rowsToDelete.length),
      errors,
    };
  } catch (err) {
    return { ok: false, message: `Import failed: ${stringifyError_(err)}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Pre-warms the cache.
 */
function warmShortcutsCache() {
  ensureSheets_();
  try {
    const list = getShortcutsFromSheet_();
    const ok = writeShortcutsCache_(list);
    return { ok: true, message: ok ? 'Cache warmed.' : 'Cache warmed with fallback storage.' };
  } catch (err) {
    return { ok: false, message: `Warm cache failed: ${stringifyError_(err)}` };
  }
}

/**
 * Invalidates cache.
 */
function invalidateShortcutsCache() {
  ensureSheets_();
  try {
    invalidateShortcutsCache_();
    return { ok: true, message: 'Cache invalidated.' };
  } catch (err) {
    return { ok: false, message: `Invalidate failed: ${stringifyError_(err)}` };
  }
}

/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ END OF PART 2                                                                 ║
║ Next: Part 3 will provide the cleanup.gs script.                              ║
║ Progress: ██████████░ 66%                                                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
🎯 WHAT'S NEXT:
Reply "CONTINUE" for Part 3.
🚀 YOUR 4 NAVIGATION OPTIONS:
1️⃣ CONTINUE → Proceed to Part 3 (cleanup.gs)
2️⃣ REVIEW → Validate changes in uiHandlers.gs
3️⃣ MODIFY → Request changes to UI handlers
4️⃣ EXPLAIN → How deletion is delegated
*/