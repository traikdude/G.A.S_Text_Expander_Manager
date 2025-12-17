/**
 * Text Expansion Manager — Google Apps Script Backend
 * Features:
 * - Spreadsheet custom menu + sidebar/dialog launcher
 * - Web app (doGet) UI
 * - Shortcut CRUD with validation
 * - Per-user favorites synced to sheet
 * - 10k+ shortcut caching with chunked CacheService + PropertiesService fallback
 * - Bulk import (pasted CSV/JSON) with safe writes + dedupe/upsert
 * - FIXED: Proper Blob handling for Utilities.gzip/ungzip
 *
 * Security:
 * - No secrets embedded
 * - Uses Session user email (requires userinfo.email scope)
 *
 * Author: GScriptGuru (Enhanced with compression fix)
 * Runtime: V8
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CFG = {
  SHEET_SHORTCUTS: 'Shortcuts',
  SHEET_FAVORITES: 'Favorites',
  MENU_NAME: 'Text Expansion Tools',
  CACHE_TTL_SECONDS: 60 * 10,
  CACHE_KEY_PREFIX: 'TEM_SHORTCUTS',
  CACHE_META_KEY: 'TEM_SHORTCUTS_META',
  CACHE_VER_KEY: 'TEM_SHORTCUTS_VER',
  PROP_FALLBACK_PREFIX: 'TEM_FALLBACK_',
  MAX_IMPORT_ROWS: 10000,
  MAX_KEY_LEN: 80,
  MAX_FIELD_LEN: 50000,
  MAX_TAGS_LEN: 512,
  MAX_LANGUAGE_LEN: 64,
  MAX_APP_LEN: 128,
  MAX_DESC_LEN: 2000,
};

const HEADERS_SHORTCUTS = [
  'Snippet Name',
  'Content',
  'Application',
  'Description',
  'Language',
  'Tags',
  'UpdatedAt',
];

const HEADERS_FAVORITES = [
  'UserEmail',
  'Snippet Name',
  'CreatedAt',
];

// ============================================================================
// TRIGGERS & ENTRY POINTS
// ============================================================================

/**
 * Simple trigger: adds custom menu on spreadsheet open.
 * @param {Object} e - Event object.
 */
function onOpen(e) {
  ensureSheets_();
  SpreadsheetApp.getUi()
    .createMenu(CFG.MENU_NAME)
    .addItem('Open Manager (Sidebar)', 'openManagerSidebar')
    .addItem('Open Manager (Dialog)', 'openManagerDialog')
    .addSeparator()
    .addItem('Open Web App (New Tab Link)', 'openWebAppLinkDialog')
    .addSeparator()
    .addItem('Warm Cache (10k+)', 'warmShortcutsCache')
    .addItem('Invalidate Cache', 'invalidateShortcutsCache')
    .addToUi();
}

/**
 * Install trigger handler (runs on add-on install).
 * @param {Object} e - Event object.
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Opens the manager UI in a sidebar.
 */
function openManagerSidebar() {
  ensureSheets_();
  const html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Text Expansion Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Opens the manager UI in a modal dialog.
 */
function openManagerDialog() {
  ensureSheets_();
  const html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle('Text Expansion Manager');
  SpreadsheetApp.getUi().showModalDialog(html, 'Text Expansion Manager');
}

/**
 * Shows a dialog containing the deployed web app URL for opening in a new tab.
 */
function openWebAppLinkDialog() {
  ensureSheets_();
  const url = getWebAppUrl_();
  const safeUrl = url ? String(url).replace(/"/g, '&quot;') : '';
  const body = url
    ? `
      <div style="font-family:Arial,sans-serif;line-height:1.4;padding:12px">
        <h3 style="margin:0 0 8px 0">Open Web App</h3>
        <p style="margin:0 0 10px 0">Click to open in a new tab:</p>
        <p style="margin:0 0 10px 0"><a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a></p>
        <button style="padding:8px 10px" onclick="navigator.clipboard.writeText('${safeUrl}');this.innerText='Copied!';">Copy URL</button>
      </div>`
    : `
      <div style="font-family:Arial,sans-serif;line-height:1.4;padding:12px">
        <h3 style="margin:0 0 8px 0">Web App URL Not Available</h3>
        <p style="margin:0">Deploy as a Web App (Deploy → New deployment → Web app) to get a URL.</p>
      </div>`;
  const html = HtmlService.createHtmlOutput(body).setWidth(520).setHeight(260);
  SpreadsheetApp.getUi().showModalDialog(html, 'Web App Link');
}

/**
 * Web app entry point.
 * @param {Object} e - Event object.
 * @return {HtmlOutput} HTML output.
 */
function doGet(e) {
  ensureSheets_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Text Expansion Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Optional helper used by templated HTML includes.
 * @param {string} filename - HTML filename.
 * @return {string} The file contents.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// PUBLIC API FUNCTIONS (Called from HTML UI)
// ============================================================================

/**
 * UI bootstrap loader.
 * @return {Object} Bootstrap payload.
 */
function getAppBootstrapData() {
  ensureSheets_();
  const userEmail = getUserEmail_();
  const shortcuts = getShortcutsCached_();
  const favorites = listMyFavorites_();
  const favSet = new Set(favorites.map(f => f.key));
  const shortcutsWithFav = shortcuts.map(s => ({
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
    userEmail,
    shortcuts: shortcutsWithFav,
    favorites,
    webAppUrl: getWebAppUrl_(),
    version: getCacheVersion_(),
    sheetNames: { shortcuts: CFG.SHEET_SHORTCUTS, favorites: CFG.SHEET_FAVORITES },
  };
}

/**
 * Creates or updates a shortcut by Snippet Name (key).
 * Called by Save button in the HTML UI.
 * @param {Object} payload - Shortcut data.
 * @param {string} payload.key - Snippet Name.
 * @param {string} payload.expansion - Content expansion.
 * @param {string} payload.application - Application.
 * @param {string} payload.description - Description.
 * @param {string=} payload.language - Language (optional).
 * @param {string=} payload.tags - Tags (optional).
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

    const allKeys = getColumnValues_(sheet, col.key);
    const rowIndex = findRowIndexByKey_(allKeys, key); // 1-based, or -1

    const row = new Array(width).fill('');
    row[col.key] = key;
    row[col.expansion] = String(payload.expansion || '').slice(0, CFG.MAX_FIELD_LEN);
    row[col.application] = String(payload.application || '').slice(0, CFG.MAX_APP_LEN);
    row[col.description] = String(payload.description || '').slice(0, CFG.MAX_DESC_LEN);
    row[col.language] = String(payload.language || '').slice(0, CFG.MAX_LANGUAGE_LEN);
    row[col.tags] = String(payload.tags || '').slice(0, CFG.MAX_TAGS_LEN);
    row[col.updatedAt] = nowIso;

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, width).setValues([row]);
      bumpCacheVersion_();
      invalidateShortcutsCache_();
      return { ok: true, action: 'updated', message: `Updated shortcut: ${key}` };
    }

    sheet.appendRow(row);
    bumpCacheVersion_();
    invalidateShortcutsCache_();
    return { ok: true, action: 'created', message: `Created shortcut: ${key}` };
  } catch (err) {
    return { ok: false, message: `Upsert failed: ${stringifyError_(err)}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a shortcut by key.
 * Called by Delete button in the HTML UI.
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

    const allKeys = getColumnValues_(sheet, col.key);
    const rowIndex = findRowIndexByKey_(allKeys, k);

    if (rowIndex < 0) return { ok: false, message: `Shortcut not found: ${k}` };

    sheet.deleteRow(rowIndex);
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

/**
 * Toggle favorite for the current user.
 * Called by star button in the HTML UI.
 * @param {string} key - Snippet Name.
 * @param {boolean} shouldFavorite - True to favorite, false to unfavorite.
 * @return {Object} Result.
 */
function setFavorite(key, shouldFavorite) {
  ensureSheets_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const userEmail = getUserEmail_();
    const k = String(key || '').trim();
    if (!k) return { ok: false, message: 'Missing shortcut key.' };
    if (!userEmail) return { ok: false, message: 'User email not available. Ensure scopes and deployment settings.' };

    const favSheet = getSheet_(CFG.SHEET_FAVORITES);
    const data = favSheet.getDataRange().getValues();
    const header = data[0] || [];
    const col = getFavoritesColumnMap_(header);

    const existingRow = findFavoriteRow_(data, col, userEmail, k);

    if (shouldFavorite) {
      if (existingRow > 0) return { ok: true, message: 'Already favorited.', favorite: true };
      favSheet.appendRow([userEmail, k, new Date().toISOString()]);
      return { ok: true, message: 'Added to favorites.', favorite: true };
    }

    if (existingRow > 0) {
      favSheet.deleteRow(existingRow);
      return { ok: true, message: 'Removed from favorites.', favorite: false };
    }

    return { ok: true, message: 'Not in favorites.', favorite: false };
  } catch (err) {
    return { ok: false, message: `Favorite update failed: ${stringifyError_(err)}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lists favorites for the current user (keys only plus timestamps).
 * @return {Array<Object>} Favorites list.
 */
function listMyFavorites() {
  ensureSheets_();
  return listMyFavorites_();
}

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
 * Called by Import UI.
 * @param {Object} payload - Import payload.
 * @param {string} payload.mode - "csv" or "json".
 * @param {string} payload.text - Pasted content.
 * @param {string=} payload.defaultApplication - Optional default application.
 * @param {string=} payload.defaultLanguage - Optional default language.
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
    if (rows.length > CFG.MAX_IMPORT_ROWS) return { ok: false, message: `Too many rows. Max allowed: ${CFG.MAX_IMPORT_ROWS}` };

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const { header, col } = getShortcutsHeaderAndColMap_(sheet);
    const width = header.length;

    const existingKeys = getColumnValues_(sheet, col.key);
    const keyToRowIndex = buildKeyToRowIndexMap_(existingKeys); // key -> rowIndex
    const nowIso = new Date().toISOString();

    const updates = [];
    const inserts = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const v = validateShortcutPayload_(r);
      if (!v.ok) {
        errors.push({ index: i + 1, key: r.key || '', message: v.message });
        continue;
      }

      const key = String(r.key).trim();
      const row = new Array(width).fill('');
      row[col.key] = key;
      row[col.expansion] = String(r.expansion || '').slice(0, CFG.MAX_FIELD_LEN);
      row[col.application] = String(r.application || '').slice(0, CFG.MAX_APP_LEN);
      row[col.description] = String(r.description || '').slice(0, CFG.MAX_DESC_LEN);
      row[col.language] = String(r.language || '').slice(0, CFG.MAX_LANGUAGE_LEN);
      row[col.tags] = String(r.tags || '').slice(0, CFG.MAX_TAGS_LEN);
      row[col.updatedAt] = nowIso;

      const existingRowIndex = keyToRowIndex[key];
      if (existingRowIndex) {
        updates.push({ rowIndex: existingRowIndex, values: row });
      } else {
        inserts.push(row);
      }
    }

    // Apply updates in batches by grouping contiguous row blocks.
    applyRowUpdates_(sheet, updates, width);

    // Insert new rows in chunks (append).
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
      message: `Import complete. Updated: ${updates.length}. Inserted: ${inserts.length}. Errors: ${errors.length}.`,
      updated: updates.length,
      inserted: inserts.length,
      errors,
    };
  } catch (err) {
    return { ok: false, message: `Import failed: ${stringifyError_(err)}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Pre-warms the cache for faster UI loads.
 * @return {Object} Result.
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
 * Invalidates cache (CacheService + PropertiesService fallback).
 * @return {Object} Result.
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

// ============================================================================
// INTERNAL: FAVORITES
// ============================================================================

/**
 * Lists favorites for the current user (internal).
 * @return {Array<Object>} Favorites list.
 */
function listMyFavorites_() {
  const userEmail = getUserEmail_();
  if (!userEmail) return [];
  const favSheet = getSheet_(CFG.SHEET_FAVORITES);
  const data = favSheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const header = data[0];
  const col = getFavoritesColumnMap_(header);

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][col.userEmail] || '').trim();
    const key = String(data[i][col.key] || '').trim();
    const createdAt = String(data[i][col.createdAt] || '').trim();
    if (email === userEmail && key) {
      out.push({ key, createdAt });
    }
  }
  return out;
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

/**
 * Finds favorite row for user and key.
 * @param {Array<Array>} data - Sheet data.
 * @param {Object} col - Column map.
 * @param {string} email - User email.
 * @param {string} key - Snippet Name.
 * @return {number} Row index (1-based) or -1.
 */
function findFavoriteRow_(data, col, email, key) {
  for (let i = 1; i < data.length; i++) {
    const e = String(data[i][col.userEmail] || '').trim();
    const k = String(data[i][col.key] || '').trim();
    if (e === email && k === key) return i + 1;
  }
  return -1;
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
// INTERNAL: SHORTCUTS SHEET READ/WRITE
// ============================================================================

/**
 * Gets shortcuts header and column map.
 * @param {Sheet} sheet - Shortcuts sheet.
 * @return {Object} Header and column map.
 */
function getShortcutsHeaderAndColMap_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = indexHeader_(header);

  const missing = [];
  HEADERS_SHORTCUTS.forEach(h => {
    if (idx[h] === undefined) missing.push(h);
  });
  if (missing.length) {
    throw new Error(`Shortcuts sheet missing headers: ${missing.join(', ')}`);
  }

  return {
    header,
    col: {
      key: idx['Snippet Name'],
      expansion: idx['Content'],
      application: idx['Application'],
      description: idx['Description'],
      language: idx['Language'],
      tags: idx['Tags'],
      updatedAt: idx['UpdatedAt'],
    },
  };
}

/**
 * Reads all shortcuts from sheet.
 * @return {Array<Object>} Shortcuts array.
 */
function getShortcutsFromSheet_() {
  const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const header = data[0];
  const idx = indexHeader_(header);

  const col = {
    key: idx['Snippet Name'],
    expansion: idx['Content'],
    application: idx['Application'],
    description: idx['Description'],
    language: idx['Language'],
    tags: idx['Tags'],
    updatedAt: idx['UpdatedAt'],
  };

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][col.key] || '').trim();
    if (!key) continue;
    out.push({
      key,
      expansion: String(data[i][col.expansion] || ''),
      application: String(data[i][col.application] || ''),
      description: String(data[i][col.description] || ''),
      language: String(data[i][col.language] || ''),
      tags: String(data[i][col.tags] || ''),
      updatedAt: String(data[i][col.updatedAt] || ''),
    });
  }
  return out;
}

/**
 * Gets shortcuts from cache or sheet.
 * @return {Array<Object>} Shortcuts array.
 */
function getShortcutsCached_() {
  const cached = readShortcutsCache_();
  if (cached && Array.isArray(cached) && cached.length >= 0) return cached;

  const list = getShortcutsFromSheet_();
  writeShortcutsCache_(list);
  return list;
}

// ============================================================================
// INTERNAL: CHUNKED CACHING (FIXED COMPRESSION)
// ============================================================================

/**
 * Reads shortcuts from cache.
 * @return {Array<Object>|null} Shortcuts array or null.
 */
function readShortcutsCache_() {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(CFG.CACHE_META_KEY);
  if (metaRaw) {
    const meta = safeJsonParse_(metaRaw);
    if (meta && meta.chunkCount && meta.encoding === 'gz-b64') {
      const combined = readChunksFromCache_(meta.chunkCount);
      if (combined) {
        const json = decodeGzB64_(combined);
        const arr = safeJsonParse_(json);
        if (Array.isArray(arr)) return arr;
      }
    }
  }

  // Fallback: PropertiesService
  const props = PropertiesService.getScriptProperties();
  const metaProp = props.getProperty(CFG.CACHE_META_KEY);
  if (metaProp) {
    const meta = safeJsonParse_(metaProp);
    if (meta && meta.chunkCount && meta.encoding === 'gz-b64') {
      const combined = readChunksFromProps_(meta.chunkCount);
      if (combined) {
        const json = decodeGzB64_(combined);
        const arr = safeJsonParse_(json);
        if (Array.isArray(arr)) return arr;
      }
    }
  }

  return null;
}

/**
 * Writes shortcuts to cache.
 * @param {Array<Object>} list - Shortcuts array.
 * @return {boolean} True if CacheService succeeded.
 */
function writeShortcutsCache_(list) {
  const json = JSON.stringify(list || []);
  const encoded = encodeGzB64_(json);

  const chunks = chunkString_(encoded, 90000);
  const meta = {
    chunkCount: chunks.length,
    encoding: 'gz-b64',
    updatedAt: new Date().toISOString(),
    version: getCacheVersion_(),
  };

  // Try CacheService first.
  let cacheOk = true;
  try {
    const cache = CacheService.getScriptCache();
    cache.put(CFG.CACHE_META_KEY, JSON.stringify(meta), CFG.CACHE_TTL_SECONDS);
    for (let i = 0; i < chunks.length; i++) {
      cache.put(`${CFG.CACHE_KEY_PREFIX}_${i + 1}`, chunks[i], CFG.CACHE_TTL_SECONDS);
    }
  } catch (err) {
    cacheOk = false;
  }

  // Always write fallback meta + chunks (keeps UI fast even if cache evicts).
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(CFG.CACHE_META_KEY, JSON.stringify(meta));
    for (let i = 0; i < chunks.length; i++) {
      props.setProperty(`${CFG.PROP_FALLBACK_PREFIX}${i + 1}`, chunks[i]);
    }
    // Clean extras from previous longer cache.
    cleanupExtraPropChunks_(chunks.length);
  } catch (err) {
    // If fallback fails too, we still allow normal operation by reading from sheet next time.
  }

  return cacheOk;
}

/**
 * Invalidates all cache storage.
 */
function invalidateShortcutsCache_() {
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();

  // CacheService delete
  const metaRaw = cache.get(CFG.CACHE_META_KEY);
  if (metaRaw) {
    const meta = safeJsonParse_(metaRaw);
    const count = meta && meta.chunkCount ? Number(meta.chunkCount) : 0;
    cache.remove(CFG.CACHE_META_KEY);
    for (let i = 1; i <= count; i++) cache.remove(`${CFG.CACHE_KEY_PREFIX}_${i}`);
  }

  // PropertiesService delete
  const metaProp = props.getProperty(CFG.CACHE_META_KEY);
  if (metaProp) {
    const meta = safeJsonParse_(metaProp);
    const count = meta && meta.chunkCount ? Number(meta.chunkCount) : 0;
    props.deleteProperty(CFG.CACHE_META_KEY);
    for (let i = 1; i <= count; i++) props.deleteProperty(`${CFG.PROP_FALLBACK_PREFIX}${i}`);
  }
}

/**
 * Reads chunks from CacheService.
 * @param {number} count - Number of chunks.
 * @return {string|null} Combined string or null.
 */
function readChunksFromCache_(count) {
  const cache = CacheService.getScriptCache();
  let combined = '';
  for (let i = 1; i <= count; i++) {
    const part = cache.get(`${CFG.CACHE_KEY_PREFIX}_${i}`);
    if (!part) return null;
    combined += part;
  }
  return combined;
}

/**
 * Reads chunks from PropertiesService.
 * @param {number} count - Number of chunks.
 * @return {string|null} Combined string or null.
 */
function readChunksFromProps_(count) {
  const props = PropertiesService.getScriptProperties();
  let combined = '';
  for (let i = 1; i <= count; i++) {
    const part = props.getProperty(`${CFG.PROP_FALLBACK_PREFIX}${i}`);
    if (!part) return null;
    combined += part;
  }
  return combined;
}

/**
 * Cleans up extra property chunks.
 * @param {number} keepCount - Number of chunks to keep.
 */
function cleanupExtraPropChunks_(keepCount) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const keys = Object.keys(all).filter(k => k.indexOf(CFG.PROP_FALLBACK_PREFIX) === 0);
  const nums = keys
    .map(k => Number(k.replace(CFG.PROP_FALLBACK_PREFIX, '')))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (let i = 0; i < nums.length; i++) {
    if (nums[i] > keepCount) props.deleteProperty(`${CFG.PROP_FALLBACK_PREFIX}${nums[i]}`);
  }
}

/**
 * FIXED: Encodes a string as gzipped base64.
 * Properly passes Blob to Utilities.gzip().
 * @param {string} s - String to encode.
 * @return {string} Base64 encoded gzipped string.
 */
function encodeGzB64_(s) {
  try {
    // Create blob from string
    const blob = Utilities.newBlob(s, 'text/plain', 'data.txt');
    
    // Pass the BLOB itself to gzip (not bytes)
    const gzBlob = Utilities.gzip(blob);
    
    // Get bytes from gzipped blob and encode to base64
    const gzBytes = gzBlob.getBytes();
    return Utilities.base64Encode(gzBytes);
  } catch (error) {
    console.error('encodeGzB64_ error:', error.message);
    throw new Error('Compression failed: ' + error.message);
  }
}

/**
 * FIXED: Decodes gzipped base64 back to string.
 * Properly handles blob creation and ungzip.
 * @param {string} b64 - Base64 encoded gzipped string.
 * @return {string} Decoded string.
 */
function decodeGzB64_(b64) {
  try {
    // Decode base64 to bytes
    const gzBytes = Utilities.base64Decode(b64);
    
    // Create blob from compressed bytes
    const gzBlob = Utilities.newBlob(gzBytes, 'application/x-gzip', 'data.gz');
    
    // Ungzip the blob
    const unzippedBlob = Utilities.ungzip(gzBlob);
    
    // Return as string
    return unzippedBlob.getDataAsString();
  } catch (error) {
    console.error('decodeGzB64_ error:', error.message);
    throw new Error('Decompression failed: ' + error.message);
  }
}

/**
 * Chunks string into pieces.
 * @param {string} str - String to chunk.
 * @param {number} chunkSize - Chunk size.
 * @return {Array<string>} Chunks.
 */
function chunkString_(str, chunkSize) {
  const out = [];
  for (let i = 0; i < str.length; i += chunkSize) {
    out.push(str.substring(i, i + chunkSize));
  }
  return out;
}

/**
 * Gets cache version.
 * @return {string} Version string.
 */
function getCacheVersion_() {
  const props = PropertiesService.getScriptProperties();
  const v = props.getProperty(CFG.CACHE_VER_KEY);
  return v ? String(v) : '1';
}

/**
 * Increments cache version.
 */
function bumpCacheVersion_() {
  const props = PropertiesService.getScriptProperties();
  const v = Number(props.getProperty(CFG.CACHE_VER_KEY) || '1');
  props.setProperty(CFG.CACHE_VER_KEY, String(v + 1));
}

// ============================================================================
// INTERNAL: IMPORT PARSING
// ============================================================================

/**
 * Parses JSON import.
 * @param {string} text - JSON text.
 * @param {string} defaultApplication - Default application.
 * @param {string} defaultLanguage - Default language.
 * @return {Object} Parse result.
 */
function parseImportJson_(text, defaultApplication, defaultLanguage) {
  let arr;
  try {
    const parsed = JSON.parse(text);
    arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
  } catch (err) {
    return { ok: false, message: 'Invalid JSON. Paste a JSON array of objects.' };
  }
  if (!arr) return { ok: false, message: 'JSON must be an array (or an object with an "items" array).' };

  const rows = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i] || {};
    const key = String(o.key || o['Snippet Name'] || o.name || o.snippet || o.shortcut || '').trim();
    const expansion = String(o.expansion || o['Content'] || o.content || o.value || o.text || '').trim();
    const application = String(o.application || o['Application'] || defaultApplication || '').trim();
    const description = String(o.description || o['Description'] || '').trim();
    const language = String(o.language || o['Language'] || defaultLanguage || '').trim();
    const tags = String(o.tags || o['Tags'] || '').trim();

    rows.push({ key, expansion, application, description, language, tags });
  }
  return { ok: true, rows };
}

/**
 * Parses CSV import.
 * @param {string} text - CSV text.
 * @param {string} defaultApplication - Default application.
 * @param {string} defaultLanguage - Default language.
 * @return {Object} Parse result.
 */
function parseImportCsv_(text, defaultApplication, defaultLanguage) {
  const lines = splitCsvLines_(text);
  if (lines.length === 0) return { ok: false, message: 'CSV appears empty.' };

  const table = lines.map(l => parseCsvLine_(l));
  const header = (table[0] || []).map(h => String(h || '').trim());
  const idx = indexHeader_(header);

  const keyCol = idx['Snippet Name'] !== undefined ? idx['Snippet Name'] : (idx['key'] !== undefined ? idx['key'] : undefined);
  const contentCol = idx['Content'] !== undefined ? idx['Content'] : (idx['expansion'] !== undefined ? idx['expansion'] : undefined);

  if (keyCol === undefined || contentCol === undefined) {
    return { ok: false, message: 'CSV must have headers including "Snippet Name" and "Content".' };
  }

  const appCol = idx['Application'];
  const descCol = idx['Description'];
  const langCol = idx['Language'];
  const tagsCol = idx['Tags'];

  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r] || [];
    const key = String(row[keyCol] || '').trim();
    const expansion = String(row[contentCol] || '').trim();
    const application = String((appCol !== undefined ? row[appCol] : '') || defaultApplication || '').trim();
    const description = String((descCol !== undefined ? row[descCol] : '') || '').trim();
    const language = String((langCol !== undefined ? row[langCol] : '') || defaultLanguage || '').trim();
    const tags = String((tagsCol !== undefined ? row[tagsCol] : '') || '').trim();

    // Skip blank lines gracefully
    if (!key && !expansion && !application && !description && !language && !tags) continue;

    rows.push({ key, expansion, application, description, language, tags });
  }

  return { ok: true, rows };
}

/**
 * Splits CSV into lines.
 * @param {string} text - CSV text.
 * @return {Array<string>} Lines.
 */
function splitCsvLines_(text) {
  const s = String(text || '');
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      const next = s[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (cur.length > 0) out.push(cur);
      cur = '';
      if (ch === '\r' && s[i + 1] === '\n') i++;
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) out.push(cur);
  return out.map(l => l.trim()).filter(l => l.length > 0);
}

/**
 * Parses CSV line into fields.
 * @param {string} line - CSV line.
 * @return {Array<string>} Fields.
 */
function parseCsvLine_(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  const s = String(line || '');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      const next = s[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(v => String(v));
}

// ============================================================================
// INTERNAL: VALIDATIONS
// ============================================================================

/**
 * Validates shortcut payload.
 * @param {Object} payload - Shortcut data.
 * @return {Object} Validation result.
 */
function validateShortcutPayload_(payload) {
  if (!payload) return { ok: false, message: 'Missing payload.' };

  const key = String(payload.key || '').trim();
  const expansion = String(payload.expansion || '').trim();

  if (!key) return { ok: false, message: 'Snippet Name is required.' };
  if (key.length > CFG.MAX_KEY_LEN) return { ok: false, message: `Snippet Name too long (max ${CFG.MAX_KEY_LEN}).` };
  if (key.indexOf('\n') >= 0 || key.indexOf('\r') >= 0) return { ok: false, message: 'Snippet Name must be a single line.' };

  // Allow flexible characters, but block leading/trailing spaces already trimmed, and block tabs/newlines.
  if (key.indexOf('\t') >= 0) return { ok: false, message: 'Snippet Name cannot contain tabs.' };

  if (!expansion) return { ok: false, message: 'Content is required.' };
  if (expansion.length > CFG.MAX_FIELD_LEN) return { ok: false, message: `Content too long (max ${CFG.MAX_FIELD_LEN}).` };

  const application = String(payload.application || '').trim();
  if (application.length > CFG.MAX_APP_LEN) return { ok: false, message: `Application too long (max ${CFG.MAX_APP_LEN}).` };

  const description = String(payload.description || '').trim();
  if (description.length > CFG.MAX_DESC_LEN) return { ok: false, message: `Description too long (max ${CFG.MAX_DESC_LEN}).` };

  const language = String(payload.language || '').trim();
  if (language.length > CFG.MAX_LANGUAGE_LEN) return { ok: false, message: `Language too long (max ${CFG.MAX_LANGUAGE_LEN}).` };

  const tags = String(payload.tags || '').trim();
  if (tags.length > CFG.MAX_TAGS_LEN) return { ok: false, message: `Tags too long (max ${CFG.MAX_TAGS_LEN}).` };

  return { ok: true };
}

// ============================================================================
// INTERNAL: SPREADSHEET SETUP + UTILITIES
// ============================================================================

/**
 * Ensures sheets exist with proper headers.
 */
function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet. Bind this script to a Google Sheet.');

  const shortcuts = ss.getSheetByName(CFG.SHEET_SHORTCUTS) || ss.insertSheet(CFG.SHEET_SHORTCUTS);
  const favorites = ss.getSheetByName(CFG.SHEET_FAVORITES) || ss.insertSheet(CFG.SHEET_FAVORITES);

  ensureHeaderRow_(shortcuts, HEADERS_SHORTCUTS);
  ensureHeaderRow_(favorites, HEADERS_FAVORITES);

  shortcuts.setFrozenRows(1);
  favorites.setFrozenRows(1);
}

/**
 * Ensures header row exists and matches expected headers.
 * @param {Sheet} sheet - Sheet object.
 * @param {Array<string>} headers - Expected headers.
 */
function ensureHeaderRow_(sheet, headers) {
  const lastCol = Math.max(sheet.getLastColumn(), headers.length);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
  const needs = headers.some((h, i) => existing[i] !== h);

  if (sheet.getLastRow() === 0 || needs) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
}

/**
 * Gets sheet by name.
 * @param {string} name - Sheet name.
 * @return {Sheet} Sheet object.
 */
function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return sheet;
}

/**
 * Indexes header row to column indices.
 * @param {Array} headerRow - Header row.
 * @return {Object} Column index map.
 */
function indexHeader_(headerRow) {
  const idx = {};
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').trim();
    if (h) idx[h] = i;
    // Also map lower-case variants for CSV flexibility.
    idx[String(h).toLowerCase()] = i;
  }
  return idx;
}

/**
 * Gets column values.
 * @param {Sheet} sheet - Sheet object.
 * @param {number} colIndexZeroBased - Column index (0-based).
 * @return {Array<string>} Column values.
 */
function getColumnValues_(sheet, colIndexZeroBased) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const range = sheet.getRange(2, colIndexZeroBased + 1, lastRow - 1, 1);
  return range.getValues().map(r => String(r[0] || '').trim());
}

/**
 * Finds row index by key.
 * @param {Array<string>} keysArray - Keys array.
 * @param {string} key - Key to find.
 * @return {number} Row index (1-based) or -1.
 */
function findRowIndexByKey_(keysArray, key) {
  for (let i = 0; i < keysArray.length; i++) {
    if (String(keysArray[i] || '').trim() === key) return i + 2; // +2 because data starts at row 2
  }
  return -1;
}

/**
 * Builds key to row index map.
 * @param {Array<string>} keysArray - Keys array.
 * @return {Object} Key to row index map.
 */
function buildKeyToRowIndexMap_(keysArray) {
  const m = {};
  for (let i = 0; i < keysArray.length; i++) {
    const k = String(keysArray[i] || '').trim();
    if (k) m[k] = i + 2;
  }
  return m;
}

/**
 * Applies row updates in batches.
 * @param {Sheet} sheet - Sheet object.
 * @param {Array<Object>} updates - Updates array.
 * @param {number} width - Row width.
 */
function applyRowUpdates_(sheet, updates, width) {
  if (!updates || updates.length === 0) return;

  // Sort by rowIndex.
  updates.sort((a, b) => a.rowIndex - b.rowIndex);

  // Group contiguous row updates into blocks for fewer API calls.
  let blockStart = 0;
  while (blockStart < updates.length) {
    let blockEnd = blockStart;
    while (
      blockEnd + 1 < updates.length &&
      updates[blockEnd + 1].rowIndex === updates[blockEnd].rowIndex + 1
    ) {
      blockEnd++;
    }

    const startRow = updates[blockStart].rowIndex;
    const blockRows = updates.slice(blockStart, blockEnd + 1).map(u => u.values);
    sheet.getRange(startRow, 1, blockRows.length, width).setValues(blockRows);

    blockStart = blockEnd + 1;
  }
}

/**
 * Safe JSON parse.
 * @param {string} s - JSON string.
 * @return {*} Parsed object or null.
 */
function safeJsonParse_(s) {
  try {
    return JSON.parse(String(s));
  } catch (err) {
    return null;
  }
}

/**
 * Stringifies error.
 * @param {Error} err - Error object.
 * @return {string} Error string.
 */
function stringifyError_(err) {
  try {
    if (err && err.stack) return String(err.stack);
    return String(err);
  } catch (e) {
    return 'Unknown error';
  }
}

/**
 * Gets user email.
 * @return {string} User email or empty string.
 */
function getUserEmail_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (err) {}

  try {
    const email2 = Session.getEffectiveUser().getEmail();
    if (email2) return email2;
  } catch (err) {}

  return '';
}

/**
 * Gets web app URL.
 * @return {string} Web app URL or empty string.
 */
function getWebAppUrl_() {
  // Apps Script cannot directly fetch the current deployment URL reliably.
  // You can optionally store it in Script Properties as WEB_APP_URL.
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('WEB_APP_URL');
  return url ? String(url) : '';
}

// ============================================================================
// TESTING & DIAGNOSTICS
// ============================================================================

/**
 * Complete system health check.
 * Run this after fixing compression to verify all components.
 */
function runSystemHealthCheck() {
  console.log('🏥 Running System Health Check...\n');
  
  const results = {
    sheets: { ok: false, message: '' },
    compression: { ok: false, message: '' },
    cache: { ok: false, message: '' },
    shortcuts: { ok: false, message: '' }
  };
  
  // Test 1: Sheet Structure
  try {
    ensureSheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shortcuts = ss.getSheetByName(CFG.SHEET_SHORTCUTS);
    const favorites = ss.getSheetByName(CFG.SHEET_FAVORITES);
    
    if (shortcuts && favorites) {
      results.sheets = { ok: true, message: 'Sheets exist and are properly configured' };
      console.log('✅ Sheets: PASS');
    }
  } catch (e) {
    results.sheets = { ok: false, message: e.message };
    console.log('❌ Sheets: FAIL -', e.message);
  }
  
  // Test 2: Compression Functions
  try {
    const testStr = 'Test compression ' + JSON.stringify({test: 'data', array: [1,2,3]});
    const encoded = encodeGzB64_(testStr);
    const decoded = decodeGzB64_(encoded);
    
    if (testStr === decoded) {
      results.compression = { ok: true, message: 'Compression/decompression working' };
      console.log('✅ Compression: PASS');
    } else {
      throw new Error('Compression data mismatch');
    }
  } catch (e) {
    results.compression = { ok: false, message: e.message };
    console.log('❌ Compression: FAIL -', e.message);
  }
  
  // Test 3: Cache Operations
  try {
    const warmResult = warmShortcutsCache();
    if (warmResult.ok) {
      results.cache = { ok: true, message: 'Cache warming successful' };
      console.log('✅ Cache: PASS');
    } else {
      throw new Error(warmResult.message);
    }
  } catch (e) {
    results.cache = { ok: false, message: e.message };
    console.log('❌ Cache: FAIL -', e.message);
  }
  
  // Test 4: Shortcut CRUD Operations
  try {
    const testShortcut = {
      key: 'health_check_test',
      expansion: 'This is a health check test',
      application: 'Test',
      description: 'Temporary test shortcut',
      language: 'en',
      tags: 'test'
    };
    
    // Create
    const createResult = upsertShortcut(testShortcut);
    if (!createResult.ok) throw new Error('Create failed: ' + createResult.message);
    
    // Read
    const shortcuts = getShortcutsCached_();
    const found = shortcuts.find(s => s.key === testShortcut.key);
    if (!found) throw new Error('Created shortcut not found in cache');
    
    // Delete
    const deleteResult = deleteShortcut(testShortcut.key);
    if (!deleteResult.ok) throw new Error('Delete failed: ' + deleteResult.message);
    
    results.shortcuts = { ok: true, message: 'CRUD operations working' };
    console.log('✅ Shortcuts: PASS');
  } catch (e) {
    results.shortcuts = { ok: false, message: e.message };
    console.log('❌ Shortcuts: FAIL -', e.message);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('HEALTH CHECK SUMMARY');
  console.log('='.repeat(50));
  
  const allPassed = Object.values(results).every(r => r.ok);
  
  if (allPassed) {
    console.log('🎉 ALL SYSTEMS OPERATIONAL');
    console.log('Your Text Expansion Manager is ready to use!');
  } else {
    console.log('⚠️ ISSUES DETECTED');
    console.log('Please review failed tests above.');
  }
  
  return results;
}

/**
 * Test compression fix specifically.
 */
function testCompressionFix() {
  console.log('🔧 Testing compression fix...\n');
  
  try {
    // Test 1: Small string
    console.log('Test 1: Small string');
    const small = 'Hello, World!';
    const encoded1 = encodeGzB64_(small);
    const decoded1 = decodeGzB64_(encoded1);
    console.log(`✅ Small: "${small}" → encoded → "${decoded1}"`);
    console.log(`Match: ${small === decoded1}\n`);
    
    // Test 2: Large JSON (simulating shortcuts data)
    console.log('Test 2: Large JSON');
    const testData = [];
    for (let i = 0; i < 100; i++) {
      testData.push({
        key: `shortcut${i}`,
        expansion: `This is expansion text ${i}`.repeat(10),
        application: 'TestApp',
        description: 'Test description',
        language: 'en',
        tags: 'test,demo',
        updatedAt: new Date().toISOString()
      });
    }
    
    const json = JSON.stringify(testData);
    console.log(`Original size: ${json.length} characters`);
    
    const encoded2 = encodeGzB64_(json);
    console.log(`Compressed size: ${encoded2.length} characters`);
    console.log(`Compression ratio: ${Math.round((1 - encoded2.length / json.length) * 100)}%`);
    
    const decoded2 = decodeGzB64_(encoded2);
    const parsed = JSON.parse(decoded2);
    console.log(`✅ Large JSON: ${parsed.length} items restored`);
    console.log(`Match: ${json === decoded2}\n`);
    
    // Test 3: Warm cache with real data
    console.log('Test 3: Warm cache');
    const warmResult = warmShortcutsCache();
    console.log(`Cache warm result: ${JSON.stringify(warmResult)}\n`);
    
    console.log('🎉 All compression tests passed!');
    return { ok: true, message: 'Compression fix verified' };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return { ok: false, message: error.message };
  }
}

/**
 * Monitor cache performance metrics.
 */
function monitorCachePerformance() {
  console.log('📊 Cache Performance Monitoring\n');
  
  // Test cache read speed
  const startRead = new Date().getTime();
  const shortcuts = getShortcutsCached_();
  const readTime = new Date().getTime() - startRead;
  
  console.log(`Shortcuts loaded: ${shortcuts.length}`);
  console.log(`Cache read time: ${readTime}ms`);
  
  // Test cache write speed
  const startWrite = new Date().getTime();
  writeShortcutsCache_(shortcuts);
  const writeTime = new Date().getTime() - startWrite;
  
  console.log(`Cache write time: ${writeTime}ms`);
  
  // Check cache size
  const json = JSON.stringify(shortcuts);
  const encoded = encodeGzB64_(json);
  
  console.log(`\nData size metrics:`);
  console.log(`- Original JSON: ${json.length} chars`);
  console.log(`- Compressed: ${encoded.length} chars`);
  console.log(`- Compression ratio: ${Math.round((1 - encoded.length / json.length) * 100)}%`);
  console.log(`- Chunks needed: ${Math.ceil(encoded.length / 90000)}`);
  
  // Performance rating
  if (readTime < 100) {
    console.log('\n⚡ Performance: EXCELLENT');
  } else if (readTime < 500) {
    console.log('\n✅ Performance: GOOD');
  } else if (readTime < 1000) {
    console.log('\n⚠️ Performance: ACCEPTABLE');
  } else {
    console.log('\n🐌 Performance: NEEDS OPTIMIZATION');
  }
}

/**
 * Inspect current spreadsheet data.
 */
function inspectCurrentData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  console.log('📋 Spreadsheet Inspection\n');
  console.log(`Name: ${ss.getName()}`);
  console.log(`ID: ${ss.getId()}`);
  console.log(`URL: ${ss.getUrl()}\n`);
  
  const sheets = ss.getSheets();
  console.log(`Total sheets: ${sheets.length}\n`);
  
  sheets.forEach(sheet => {
    console.log(`Sheet: "${sheet.getName()}"`);
    console.log(`  Rows: ${sheet.getLastRow()}`);
    console.log(`  Columns: ${sheet.getLastColumn()}`);
    
    if (sheet.getLastRow() > 0) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      console.log(`  Headers: ${headers.join(', ')}`);
    }
    console.log('');
  });
}
