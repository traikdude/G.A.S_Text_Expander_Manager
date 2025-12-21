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
  INITIAL_PAGE_SIZE: 1000,
  DEBUG_MODE: true,
  SNAPSHOT_TTL_SECONDS: 60 * 5, // 5 minutes per snapshot
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
// SNAPSHOT & PAGING API
// ============================================================================ 

/**
 * Creates a stable snapshot of the current sheet data.
 * @return {Object} Snapshot metadata { snapshotToken, total, pageSize, builtAt }.
 */
function beginShortcutsSnapshot() {
  const lock = LockService.getScriptLock();
  // Short lock just to serialize snapshot creation if spam-clicked
  if (lock.tryLock(5000)) {
    try {
      const allShortcuts = getShortcutsFromSheet_();
      const token = Utilities.getUuid();
      const now = new Date().toISOString();
      
      const meta = {
        snapshotToken: token,
        total: allShortcuts.length,
        builtAt: now,
        pageSize: CFG.INITIAL_PAGE_SIZE
      };

      // Write full dataset to private snapshot cache
      writeSnapshotCache_(token, allShortcuts);
      
      if (CFG.DEBUG_MODE) {
        console.log(`[Snapshot] Created ${token}. Items: ${meta.total}`);
      }

      return meta;
    } finally {
      lock.releaseLock();
    }
  } else {
    throw new Error('Server busy. Please try again.');
  }
}

/**
 * Reads a page from a specific snapshot.
 * @param {string} snapshotToken - The snapshot ID.
 * @param {number} offset - Start index.
 * @param {number} limit - Number of items.
 * @return {Object} Page data or error if expired.
 */
function fetchSnapshotPage_(snapshotToken, offset, limit) {
  const allData = readSnapshotCache_(snapshotToken);
  
  if (!allData) {
    if (CFG.DEBUG_MODE) console.warn(`[Snapshot] Missing/Expired token: ${snapshotToken}`);
    return { error: 'SNAPSHOT_EXPIRED' };
  }

  const start = Number(offset) || 0;
  const count = Number(limit) || CFG.INITIAL_PAGE_SIZE;
  const slice = allData.slice(start, start + count);
  const hasMore = allData.length > (start + count);

  return {
    items: slice,
    offset: start + slice.length,
    total: allData.length,
    hasMore: hasMore,
    snapshotToken: snapshotToken
  };
}

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
    .addSeparator()
    .addItem('Cleanup All Duplicates', 'cleanupAllDuplicates')
    .addItem('Cleanup Shortcuts Only', 'cleanupDuplicateShortcuts')
    .addItem('Cleanup Favorites Only', 'cleanupDuplicateFavorites')
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
  const seenKeys = new Set();
  
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][col.key] || '').trim();
    if (!key) continue;
    
    // Deduplicate: Keep the first occurrence only
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

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
// INTERNAL: CHUNKED CACHING (SNAPSHOT SUPPORT)
// ============================================================================ 

/**
 * Reads data from a specific snapshot token.
 */
function readSnapshotCache_(token) {
  return readCacheByKey_(`SNAP_${token}`);
}

/**
 * Writes data to a specific snapshot token.
 */
function writeSnapshotCache_(token, list) {
  writeCacheByKey_(`SNAP_${token}`, list, CFG.SNAPSHOT_TTL_SECONDS);
}

/**
 * Reads from cache using a dynamic prefix.
 */
function readCacheByKey_(prefix) {
  const metaKey = `${prefix}_META`;
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(metaKey);
  
  if (metaRaw) {
    const meta = safeJsonParse_(metaRaw);
    if (meta && meta.chunkCount && meta.encoding === 'gz-b64') {
      const combined = readChunksByKey_(prefix, meta.chunkCount);
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
 * Writes to cache using a dynamic prefix.
 */
function writeCacheByKey_(prefix, list, ttl) {
  const json = JSON.stringify(list || []);
  const encoded = encodeGzB64_(json);
  const chunks = chunkString_(encoded, 90000);
  
  const meta = {
    chunkCount: chunks.length,
    encoding: 'gz-b64',
    updatedAt: new Date().toISOString()
  };

  try {
    const cache = CacheService.getScriptCache();
    const payload = {};
    payload[`${prefix}_META`] = JSON.stringify(meta);
    
    for (let i = 0; i < chunks.length; i++) {
      payload[`${prefix}_${i + 1}`] = chunks[i];
    }
    
    cache.putAll(payload, ttl);
    return true;
  } catch (err) {
    console.error('Cache write failed:', err);
    return false;
  }
}

function readChunksByKey_(prefix, count) {
  const cache = CacheService.getScriptCache();
  const keys = [];
  for (let i = 1; i <= count; i++) keys.push(`${prefix}_${i}`);
  
  const chunks = cache.getAll(keys);
  let combined = '';
  for (let i = 1; i <= count; i++) {
    const part = chunks[`${prefix}_${i}`];
    if (!part) return null;
    combined += part;
  }
  return combined;
}

/**
 * DEPRECATED: Legacy global cache reader (kept for backward compat if needed).
 */
function getShortcutsCached_() {
  return getShortcutsFromSheet_(); // Always read fresh for now to be safe
}

// REMOVED: Old PropertyService fallback logic to simplify Snapshot architecture.
// Snapshots are ephemeral; if CacheService fails, we retry or fail gracefully.

/**
 * FIXED: Encodes a string as gzipped base64.
 * @param {string} s - String to encode.
 * @return {string} Base64 encoded gzipped string.
 */
function encodeGzB64_(s) {
  try {
    const blob = Utilities.newBlob(s, 'text/plain', 'data.txt');
    const gzBlob = Utilities.gzip(blob);
    const gzBytes = gzBlob.getBytes();
    return Utilities.base64Encode(gzBytes);
  } catch (error) {
    console.error('encodeGzB64_ error:', error.message);
    throw new Error('Compression failed: ' + error.message);
  }
}

/**
 * FIXED: Decodes gzipped base64 back to string.
 * @param {string} b64 - Base64 encoded gzipped string.
 * @return {string} Decoded string.
 */
function decodeGzB64_(b64) {
  try {
    const gzBytes = Utilities.base64Decode(b64);
    const gzBlob = Utilities.newBlob(gzBytes, 'application/x-gzip', 'data.gz');
    const unzippedBlob = Utilities.ungzip(gzBlob);
    return unzippedBlob.getDataAsString();
  } catch (error) {
    console.error('decodeGzB64_ error:', error.message);
    throw new Error('Decompression failed: ' + error.message);
  }
}

/**
 * Chunks string into pieces.
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

function parseImportJson_(text, defaultApplication, defaultLanguage) {
  let arr;
  try {
    const parsed = JSON.parse(text);
    arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
  } catch (err) { return { ok: false, message: 'Invalid JSON.' }; }
  if (!arr) return { ok: false, message: 'JSON must be an array.' };

  const rows = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i] || {};
    rows.push({
      key: String(o.key || o['Snippet Name'] || o.name || '').trim(),
      expansion: String(o.expansion || o['Content'] || '').trim(),
      application: String(o.application || o['Application'] || defaultApplication || '').trim(),
      description: String(o.description || o['Description'] || '').trim(),
      language: String(o.language || o['Language'] || defaultLanguage || '').trim(),
      tags: String(o.tags || o['Tags'] || '').trim()
    });
  }
  return { ok: true, rows };
}

function parseImportCsv_(text, defaultApplication, defaultLanguage) {
  const lines = splitCsvLines_(text);
  if (lines.length === 0) return { ok: false, message: 'CSV appears empty.' };
  const table = lines.map(l => parseCsvLine_(l));
  const header = (table[0] || []).map(h => String(h || '').trim());
  const idx = indexHeader_(header);
  const keyCol = idx['Snippet Name'] !== undefined ? idx['Snippet Name'] : idx['key'];
  const contentCol = idx['Content'] !== undefined ? idx['Content'] : idx['expansion'];
  if (keyCol === undefined || contentCol === undefined) return { ok: false, message: 'CSV missing headers.' };

  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r] || [];
    const key = String(row[keyCol] || '').trim();
    if (!key) continue;
    rows.push({
      key,
      expansion: String(row[contentCol] || '').trim(),
      application: String((idx['Application'] !== undefined ? row[idx['Application']] : '') || defaultApplication || '').trim(),
      description: String((idx['Description'] !== undefined ? row[idx['Description']] : '') || '').trim(),
      language: String((idx['Language'] !== undefined ? row[idx['Language']] : '') || defaultLanguage || '').trim(),
      tags: String((idx['Tags'] !== undefined ? row[idx['Tags']] : '') || '').trim()
    });
  }
  return { ok: true, rows };
}

function splitCsvLines_(text) {
  const s = String(text || '');
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (cur.length > 0) out.push(cur);
      cur = '';
      if (ch === '\r' && s[i + 1] === '\n') i++;
    } else cur += ch;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

function parseCsvLine_(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  const s = String(line || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// ============================================================================ 
// INTERNAL: VALIDATIONS
// ============================================================================ 

function validateShortcutPayload_(payload) {
  if (!payload) return { ok: false, message: 'Missing payload.' };
  const key = String(payload.key || '').trim();
  const expansion = String(payload.expansion || '').trim();
  if (!key) return { ok: false, message: 'Snippet Name is required.' };
  if (key.length > CFG.MAX_KEY_LEN) return { ok: false, message: 'Snippet Name too long.' };
  if (!expansion) return { ok: false, message: 'Content is required.' };
  return { ok: true };
}

// ============================================================================ 
// INTERNAL: SPREADSHEET SETUP + UTILITIES
// ============================================================================ 

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shortcuts = ss.getSheetByName(CFG.SHEET_SHORTCUTS) || ss.insertSheet(CFG.SHEET_SHORTCUTS);
  const favorites = ss.getSheetByName(CFG.SHEET_FAVORITES) || ss.insertSheet(CFG.SHEET_FAVORITES);
  ensureHeaderRow_(shortcuts, HEADERS_SHORTCUTS);
  ensureHeaderRow_(favorites, HEADERS_FAVORITES);
  shortcuts.setFrozenRows(1);
  favorites.setFrozenRows(1);
}

function ensureHeaderRow_(sheet, headers) {
  const lastCol = Math.max(sheet.getLastColumn(), headers.length);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
  const needs = headers.some((h, i) => existing[i] !== h);
  if (sheet.getLastRow() === 0 || needs) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return sheet;
}

function indexHeader_(headerRow) {
  const idx = {};
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').trim();
    if (h) { idx[h] = i; idx[h.toLowerCase()] = i; }
  }
  return idx;
}

function getColumnValues_(sheet, colIndexZeroBased) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, colIndexZeroBased + 1, lastRow - 1, 1).getValues().map(r => String(r[0] || '').trim());
}

function findRowIndexByKey_(keysArray, key) {
  for (let i = 0; i < keysArray.length; i++) if (String(keysArray[i] || '').trim() === key) return i + 2;
  return -1;
}

/**
 * Finds ALL row indices matching a key (returns array of 1-based row numbers).
 * Used to detect and clean up duplicates.
 * @param {Array} keysArray - Array of key values (from getColumnValues_).
 * @param {string} key - Key to find.
 * @return {Array<number>} Array of 1-based row indices.
 */
function findAllRowsByKey_(keysArray, key) {
  const matches = [];
  const targetKey = String(key || '').trim();
  for (let i = 0; i < keysArray.length; i++) {
    if (String(keysArray[i] || '').trim() === targetKey) {
      matches.push(i + 2); // +2 because: +1 for 1-based, +1 for header row
    }
  }
  return matches;
}

function buildKeyToRowIndexMap_(keysArray) {
  const m = {};
  for (let i = 0; i < keysArray.length; i++) {
    const k = String(keysArray[i] || '').trim();
    if (k) m[k] = i + 2;
  }
  return m;
}

function applyRowUpdates_(sheet, updates, width) {
  if (!updates || updates.length === 0) return;
  updates.sort((a, b) => a.rowIndex - b.rowIndex);
  let blockStart = 0;
  while (blockStart < updates.length) {
    let blockEnd = blockStart;
    while (blockEnd + 1 < updates.length && updates[blockEnd + 1].rowIndex === updates[blockEnd].rowIndex + 1) blockEnd++;
    const startRow = updates[blockStart].rowIndex;
    const blockRows = updates.slice(blockStart, blockEnd + 1).map(u => u.values);
    sheet.getRange(startRow, 1, blockRows.length, width).setValues(blockRows);
    blockStart = blockEnd + 1;
  }
}

function safeJsonParse_(s) { try { return JSON.parse(String(s)); } catch (err) { return null; } }

function stringifyError_(err) {
  try { return err && err.stack ? String(err.stack) : String(err); } catch (e) { return 'Unknown error'; }
}

function getUserEmail_() {
  try { return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''; } catch (err) { return ''; }
}

function getWebAppUrl_() {
  return PropertiesService.getScriptProperties().getProperty('WEB_APP_URL') || PropertiesService.getScriptProperties().getProperty('WEBAPPURL') || '';
}

/**
 * One-time setup: Store the deployed web app URL in Script Properties
 * @return {string} Confirmation message
 */
function storeWebAppUrl() {
  const url = "https://script.google.com/macros/s/AKfycbyR4SKUr9Fvs_3RLV1xWT5xjTTNxLoYPd94cthYADOZ/dev";
  PropertiesService.getScriptProperties().setProperty("WEBAPPURL", url);
  
  // Verify it was saved
  const saved = PropertiesService.getScriptProperties().getProperty("WEBAPPURL");
  Logger.log("✅ Web App URL stored successfully: " + saved);
  
  return "URL saved: " + saved;
}
