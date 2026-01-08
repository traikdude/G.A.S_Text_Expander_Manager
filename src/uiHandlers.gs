/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║ src/uiHandlers.gs - Logic Delegation (Revised ✅)                             ║
║ Fixes:                                                                        ║
║ 1) Lock pattern: waitLock inside try/finally 🔒                               ║
║ 2) handleClipboardFavorite checks backend response 🎯                         ║
║ 3) Snapshot mappings include new dropdown fields 🏷️                          ║
║ 4) Added mapFontStyleToStyleToken_ helper 🎨                                  ║
║ 5) Fixed bulkImport updated/inserted counts 📊                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/
// ============================================================================
// FILE: src/uiHandlers.gs
// SECTION: Public API & UI Handlers
// STATUS: COMPLETE + REVISED 2026-01-08
// ============================================================================

/**
 * PUBLIC API FUNCTIONS (Called from HTML UI via google.script.run)
 * Delegates complex logic to specialized internal files.
 */

// ============================================================================
// STYLE TOKEN MAPPER (for frontend style filter compatibility)
// ============================================================================

/**
 * Maps FontStyle column values (e.g., "N007 - Bold") to filter tokens (e.g., "bold").
 * This ensures the HTML style filter works with dropdown values.
 * @param {string} fontStyle - Raw FontStyle value from sheet.
 * @return {string} Style token for frontend filtering.
 */
function mapFontStyleToStyleToken_(fontStyle) {
  const v = String(fontStyle || '').toLowerCase();
  if (!v) return '';
  if (v.includes('bold italic') || v.includes('bold-italic')) return 'bold-italic';
  if (v.includes('sans-serif-bold-italic')) return 'sans-serif-bold-italic';
  if (v.includes('sans-serif-bold')) return 'sans-serif-bold';
  if (v.includes('sans-serif-italic')) return 'sans-serif-italic';
  if (v.includes('sans-serif')) return 'sans-serif';
  if (v.includes('bold script')) return 'bold-script';
  if (v.includes('bold fraktur')) return 'bold-fraktur';
  if (v.includes('bold')) return 'bold';
  if (v.includes('italic')) return 'italic';
  if (v.includes('script')) return 'script';
  if (v.includes('fraktur')) return 'fraktur';
  if (v.includes('monospace')) return 'monospace';
  if (v.includes('double') || v.includes('struck')) return 'double-struck';
  if (v.includes('full width') || v.includes('fullwidth')) return 'fullwidth';
  if (v.includes('small caps') || v.includes('smallcaps')) return 'smallcaps';
  if (v.includes('superscript')) return 'superscript';
  if (v.includes('subscript')) return 'subscript';
  if (v.includes('circled')) return 'circled';
  if (v.includes('squared')) return 'squared';
  if (v.includes('negative')) return 'negative-squared';
  if (v.includes('parenthesized')) return 'parenthesized';
  if (v.includes('upside') || v.includes('down')) return 'upside-down';
  if (v.includes('kaomoji')) return 'kaomoji';
  if (v.includes('emoticon')) return 'emoticons';
  if (v.includes('multi')) return 'multiline';
  return ''; // unknown style
}

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
 * ✅ FIX: Now includes all dropdown fields + style token for frontend filters.
 */
function beginShortcutsSnapshotHandler() {
  try {
    const meta = beginShortcutsSnapshot();
    const batch = fetchSnapshotPage_(meta.snapshotToken, 0, CFG.INITIAL_PAGE_SIZE);
    
    if (batch.error) throw new Error(batch.error);

    // Map favorites
    const favorites = listMyFavorites_();
    const favSet = new Set(favorites.map(f => f.key));
    
    // ✅ FIX: Include all v2.0 dropdown fields + computed style token
    batch.items = batch.items.map(s => {
      const rawFontStyle = s.fontStyle || s.FontStyle || '';
      return {
        id: s.id,
        key: s.key,
        expansion: s.expansion,
        application: s.application,
        description: s.description,
        language: s.language,
        tags: s.tags,
        updatedAt: s.updatedAt,
        // ✅ NEW: Enhanced dropdown fields (v2.0)
        mainCategory: s.mainCategory || s.MainCategory || '',
        subcategory: s.subcategory || s.Subcategory || '',
        fontStyle: rawFontStyle,
        style: mapFontStyleToStyleToken_(rawFontStyle), // For frontend filter
        platform: s.platform || s.Platform || '',
        usageFrequency: s.usageFrequency || s.UsageFrequency || '',
        // ⭐ Favorites
        favorite: favSet.has(s.key),
      };
    });

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
 * ✅ FIX: Now includes all dropdown fields + style token.
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

    // ✅ FIX: Include all v2.0 dropdown fields + computed style token
    const mapped = batch.items.map(s => {
      const rawFontStyle = s.fontStyle || s.FontStyle || '';
      return {
        id: s.id,
        key: s.key,
        expansion: s.expansion,
        application: s.application,
        description: s.description,
        language: s.language,
        tags: s.tags,
        updatedAt: s.updatedAt,
        // ✅ NEW: Enhanced dropdown fields (v2.0)
        mainCategory: s.mainCategory || s.MainCategory || '',
        subcategory: s.subcategory || s.Subcategory || '',
        fontStyle: rawFontStyle,
        style: mapFontStyleToStyleToken_(rawFontStyle), // For frontend filter
        platform: s.platform || s.Platform || '',
        usageFrequency: s.usageFrequency || s.UsageFrequency || '',
        // ⭐ Favorites
        favorite: favSet.has(s.key),
      };
    });

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
 * ✅ FIX: Lock pattern—waitLock inside try/finally.
 * @param {Object} payload - Shortcut data.
 * @return {Object} Result object.
 */
function upsertShortcut(payload) {
  ensureSheets_();
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); // ✅ FIX: Inside try block

    const v = validateShortcutPayload_(payload);
    if (!v.ok) return v;

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const { header, col } = getShortcutsHeaderAndColMap_(sheet);
    const width = header.length;

    const nowIso = new Date().toISOString();
    const key = String(payload.key).trim();

    // Find ALL rows with this key, not just the first
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

    // Delete ALL existing duplicates first (reverse order to preserve indices)
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
    try { lock.releaseLock(); } catch (e) {} // ✅ Safe release
  }
}

/**
 * Deletes a shortcut by key.
 * ✅ FIX: Lock pattern—waitLock inside try/finally.
 * @param {string} key - Snippet Name.
 * @return {Object} Result.
 */
function deleteShortcut(key) {
  ensureSheets_();
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); // ✅ FIX: Inside try block

    const k = String(key || '').trim();
    if (!k) return { ok: false, message: 'Missing shortcut key.' };

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const { col } = getShortcutsHeaderAndColMap_(sheet);

    // Find ALL rows with this key, not just the first
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
    try { lock.releaseLock(); } catch (e) {} // ✅ Safe release
  }
}

// ============================================================================
// FAVORITES (Delegated to favorites.gs)
// ============================================================================

/**
 * Unified handler for clipboard favoriting (auto-favorites on copy).
 * ✅ FIX: Now checks backend response and maps to UI format.
 * @param {string} key - Snippet Name.
 * @return {Object} Result.
 */
function handleClipboardFavorite(key) {
  try {
    const res = addToFavorites(key); // Defined in favorites.gs
    
    // ✅ FIX: Check if backend returned an error
    if (res && res.status === 'error') {
      return { ok: false, message: res.message || 'Failed to add to favorites.' };
    }
    
    // Map internal result to UI expected format
    return {
      ok: true,
      message: res && res.status === 'added' ? 'Added to favorites.' : 'Already in favorites.',
      favorite: true
    };
  } catch (err) {
    return { ok: false, message: `Clipboard favorite failed: ${stringifyError_(err)}` };
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
 * ✅ FIX: Lock pattern + accurate updated/inserted counts.
 * @param {Object} payload - Import payload.
 * @return {Object} Import result.
 */
function bulkImport(payload) {
  ensureSheets_();
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); // ✅ FIX: Inside try block

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

    // ✅ FIX: Capture existing keys BEFORE deletion for accurate counting
    const existingKeys = getColumnValues_(sheet, col.key).map(v => String(v || '').trim()).filter(Boolean);
    const existingSet = new Set(existingKeys);

    // Count how many import keys already exist (will be updates)
    const updatedKeysCount = Array.from(processedKeys).filter(k => existingSet.has(k)).length;
    const insertedKeysCount = validRows.length - updatedKeysCount;

    // Find rows to delete (those matching import keys)
    const rowsToDelete = [];
    for (let i = 0; i < existingKeys.length; i++) {
      const existingKey = existingKeys[i];
      if (processedKeys.has(existingKey)) {
        rowsToDelete.push(i + 2); // +2: 1-based + header row
      }
    }

    // Delete in reverse order to preserve indices
    rowsToDelete.sort((a, b) => b - a);
    for (let i = 0; i < rowsToDelete.length; i++) {
      sheet.deleteRow(rowsToDelete[i]);
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

    return {
      ok: true,
      message: `Import complete. Updated: ${updatedKeysCount}. Inserted: ${insertedKeysCount}. Errors: ${errors.length}.`,
      updated: updatedKeysCount,
      inserted: insertedKeysCount,
      errors,
    };
  } catch (err) {
    return { ok: false, message: `Import failed: ${stringifyError_(err)}` };
  } finally {
    try { lock.releaseLock(); } catch (e) {} // ✅ Safe release
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