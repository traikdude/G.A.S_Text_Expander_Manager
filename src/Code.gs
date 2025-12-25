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
  INITIAL_PAGE_SIZE: 200, // Reduced further - 1000 exceeded callback payload limit (2025-12-23)
  DEBUG_MODE: true,
  SNAPSHOT_TTL_SECONDS: 60 * 5 // 5 min snapshot cache
};

const HEADERS_SHORTCUTS = [
  'ID',
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
      id: idx['ID'],
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

  // Check if ID column exists (for migration compatibility)
  const hasIdColumn = idx['ID'] !== undefined;
  
  const col = {
    id: hasIdColumn ? idx['ID'] : -1,
    key: idx['Snippet Name'],
    expansion: idx['Content'],
    application: idx['Application'],
    description: idx['Description'],
    language: idx['Language'],
    tags: idx['Tags'],
    updatedAt: idx['UpdatedAt'],
  };

  const out = [];
  
  // NO DEDUPLICATION - return ALL rows with unique IDs
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][col.key] || '').trim();
    if (!key) continue;
    
    // Generate a row-based ID if no ID column exists yet
    const id = hasIdColumn && data[i][col.id] 
      ? String(data[i][col.id]) 
      : `ROW-${i + 1}`;

    out.push({
      id,
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

// DUPLICATE REMOVED: Canonical getShortcutsCached_() is at line ~320

// ============================================================================
// LEGACY CACHE WRAPPERS (Backwards Compatibility)
// Delegate to generic readCacheByKey_/writeCacheByKey_ system
// ============================================================================

/**
 * Reads global shortcuts cache.
 * @return {Array<Object>|null} Cached shortcuts or null if expired/missing
 */
function readShortcutsCache_() {
  const prefix = CFG.CACHE_KEY_PREFIX || 'TEM_SHORTCUTS_';
  return readCacheByKey_(prefix);
}

/**
 * Writes shortcuts to global cache.
 * @param {Array<Object>} list - Shortcuts array to cache
 * @return {boolean} Success status
 */
function writeShortcutsCache_(list) {
  const prefix = CFG.CACHE_KEY_PREFIX || 'TEM_SHORTCUTS_';
  const ttl = CFG.CACHE_TTL_SECONDS || 600;
  return writeCacheByKey_(prefix, list, ttl);
}

/**
 * Invalidates global shortcuts cache + bumps version.
 */
function invalidateShortcutsCache_() {
  const cache = CacheService.getScriptCache();
  const prefix = CFG.CACHE_KEY_PREFIX || 'TEM_SHORTCUTS_';
  cache.remove(prefix + '_META');
  bumpCacheVersion_();
  if (CFG.DEBUG_MODE) {
    console.log('✓ Global cache invalidated, version bumped');
  }
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

// ============================================================================
// VERIFICATION: Tests cache wrappers + snapshot integrity
// Run via: clasp run testCacheAndSnapshotIntegrity
// ============================================================================

/**
 * VERIFICATION: Tests cache wrappers + snapshot integrity.
 * Run via: clasp run testCacheAndSnapshotIntegrity
 */
function testCacheAndSnapshotIntegrity() {
  console.log('=== Cache & Snapshot Integrity Test ===\n');

  try {
    // TEST A: Cache wrappers exist
    console.log('TEST A: Verifying cache wrappers...');
    const cached = readShortcutsCache_();
    console.log('✅ readShortcutsCache_() exists:', cached !== undefined);

    // TEST B: Write + Read cycle
    console.log('\nTEST B: Write/Read cycle...');
    const testData = [
      { key: 'test1', expansion: 'value1' },
      { key: 'test2', expansion: 'value2' }
    ];
    const writeOk = writeShortcutsCache_(testData);
    console.log('✅ Write successful:', writeOk);

    const readBack = readShortcutsCache_();
    const dataMatch = JSON.stringify(readBack) === JSON.stringify(testData);
    console.log('✅ Read matches write:', dataMatch);
    if (!dataMatch) throw new Error('Cache read/write mismatch');

    // TEST C: Invalidation
    console.log('\nTEST C: Cache invalidation...');
    invalidateShortcutsCache_();
    const afterInvalidate = readShortcutsCache_();
    console.log('✅ Cache cleared:', afterInvalidate === null);

    // TEST D: Snapshot model (NO sheet reads during paging)
    console.log('\nTEST D: Snapshot integrity...');
    const meta = beginShortcutsSnapshot();
    console.log('✅ Snapshot created:', meta.snapshotToken);

    const batch1 = fetchSnapshotPage_(meta.snapshotToken, 0, 10);
    const batch2 = fetchSnapshotPage_(meta.snapshotToken, 10, 10);
    console.log('✅ Batch 1 items:', batch1.items.length);
    console.log('✅ Batch 2 items:', batch2.items.length);

    // Check for duplicate keys across batches
    const allKeys = [...batch1.items.map(i => i.key), ...batch2.items.map(i => i.key)];
    const uniqueKeys = new Set(allKeys);
    const noDuplicates = uniqueKeys.size === allKeys.length;
    console.log('✅ No duplicate keys across batches:', noDuplicates);

    console.log('\n🎉 ALL TESTS PASSED');
    return { success: true, message: 'Cache and snapshot integrity verified' };
  } catch (err) {
    console.error('❌ TEST FAILED:', err.message);
    console.error(err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * SMOKE TEST: Validates paging determinism and snapshot integrity.
 * Run via: clasp run testPagingDeterminism
 */
function testPagingDeterminism() {
  console.log('=== Paging Determinism Test ===\n');

  try {
    // TEST A: Create snapshot
    const meta = beginShortcutsSnapshot();
    console.log('✅ Snapshot created:', meta.snapshotToken.substring(0, 8) + '...');

    // TEST B: Fetch three consecutive pages
    const page1 = fetchSnapshotPage_(meta.snapshotToken, 0, 10);
    const page2 = fetchSnapshotPage_(meta.snapshotToken, 10, 10);
    const page3 = fetchSnapshotPage_(meta.snapshotToken, 20, 10);

    console.log('✅ Page 1 items:', page1.items.length);
    console.log('✅ Page 2 items:', page2.items.length);
    console.log('✅ Page 3 items:', page3.items.length);

    // TEST C: Check for duplicate keys across pages
    const allKeys = [
      ...page1.items.map(i => i.key),
      ...page2.items.map(i => i.key),
      ...page3.items.map(i => i.key)
    ];
    const uniqueKeys = new Set(allKeys);
    const hasDuplicates = allKeys.length !== uniqueKeys.size;

    console.log('✅ Total keys:', allKeys.length);
    console.log('✅ Unique keys:', uniqueKeys.size);
    console.log('✅ No duplicates:', !hasDuplicates);

    if (hasDuplicates) {
      throw new Error('Duplicate keys detected across pages!');
    }

    // TEST D: Verify deterministic ordering (fetch page 1 again)
    const page1Again = fetchSnapshotPage_(meta.snapshotToken, 0, 10);
    const orderMatch = JSON.stringify(page1.items) === JSON.stringify(page1Again.items);
    console.log('✅ Page 1 deterministic:', orderMatch);

    if (!orderMatch) {
      throw new Error('Page 1 returned different data on second fetch!');
    }

    // TEST E: Test snapshot expiry detection
    const cache = CacheService.getScriptCache();
    cache.remove('SNAP_' + meta.snapshotToken + '_META');
    const expiredFetch = fetchSnapshotPage_(meta.snapshotToken, 0, 10);
    const isExpired = expiredFetch.error === 'SNAPSHOT_EXPIRED';
    console.log('✅ Expiry handled correctly:', isExpired);

    if (!isExpired) {
      throw new Error('Snapshot expiry not detected!');
    }

    console.log('\n🎉 ALL PAGING TESTS PASSED');
    return { success: true, message: 'Paging determinism verified' };
  } catch (err) {
    console.error('❌ TEST FAILED:', err.message);
    console.error(err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * BENCHMARKING: Tests performance of different page sizes for snapshot reads.
 * Run via: clasp run testPageSizePerformance
 */
function testPageSizePerformance() {
  console.log('=== Snapshot Paging Performance Test ===\\n');

  try {
    // Stage 1: Create a stable snapshot to test against
    console.log('1. Creating data snapshot...');
    const meta = beginShortcutsSnapshot();
    const totalItems = meta.total;
    const snapshotToken = meta.snapshotToken;
    
    if (!totalItems || !snapshotToken) {
      throw new Error('Failed to create a valid snapshot. Ensure sheet has data.');
    }
    console.log(`  -> Snapshot created: ${snapshotToken} (${totalItems} items)`);

    // Stage 2: Define batch sizes and run tests
    const pageSizesToTest = [500, 1000, 2000, 5000, 8000, 10000];
    const results = [];

    console.log(`\\n2. Benchmarking ${pageSizesToTest.length} page sizes...`);

    pageSizesToTest.forEach(pageSize => {
      console.log(`\\n  -> Testing page size: ${pageSize}`);
      const startTime = new Date();
      let offset = 0;
      let pagesFetched = 0;
      let hasMore = true;

      while (hasMore) {
        const pageResult = fetchSnapshotPage_(snapshotToken, offset, pageSize);
        if (pageResult.error) {
          throw new Error(`Snapshot fetch failed: ${pageResult.error}`);
        }
        
        offset = pageResult.offset;
        hasMore = pageResult.hasMore;
        pagesFetched++;
      }

      const endTime = new Date();
      const durationMs = endTime - startTime;
      
      results.push({
        pageSize: pageSize,
        durationMs: durationMs,
        pages: pagesFetched
      });

      console.log(`     - Done in ${durationMs}ms (${pagesFetched} pages)`);
    });

    // Stage 3: Summarize results
    console.log('\\n=== SUMMARY ===');
    results.forEach(r => {
      console.log(`Page Size: ${r.pageSize.toString().padEnd(5)} | Duration: ${r.durationMs.toString().padEnd(6)} ms | Pages: ${r.pages}`);
    });
    console.log('\\n🎉 Benchmark complete.');

    return { success: true, results: results };

  } catch (err) {
    console.error('\\n❌ BENCHMARK FAILED:', err.message);
    console.error(err.stack);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// DIAGNOSTIC: Verify Active Configuration (for deployment debugging)
// Run via GAS Editor: Run → verifyActiveConfig, then View → Logs
// ============================================================================

/**
 * Diagnostic function to verify the active configuration.
 * Use this to confirm which version of code is running on the deployed Web App.
 * @return {Object} Current configuration and environment info
 */
function verifyActiveConfig() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    config: {
      INITIAL_PAGE_SIZE: CFG.INITIAL_PAGE_SIZE,
      SNAPSHOT_TTL_SECONDS: CFG.SNAPSHOT_TTL_SECONDS,
      DEBUG_MODE: CFG.DEBUG_MODE,
      CACHE_TTL_SECONDS: CFG.CACHE_TTL_SECONDS
    },
    environment: {
      scriptId: ScriptApp.getScriptId(),
      timezone: Session.getScriptTimeZone(),
      userEmail: getUserEmail_() || 'unknown'
    },
    verification: {
      expectedPageSize: 1000,
      actualPageSize: CFG.INITIAL_PAGE_SIZE,
      isCorrect: CFG.INITIAL_PAGE_SIZE === 1000
    }
  };

  // Log for easy reading in GAS Editor
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   🔍 ACTIVE CONFIGURATION DIAGNOSTICS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Timestamp:', diagnostics.timestamp);
  console.log('');
  console.log('📊 CONFIG VALUES:');
  console.log('   INITIAL_PAGE_SIZE:', CFG.INITIAL_PAGE_SIZE);
  console.log('   SNAPSHOT_TTL_SECONDS:', CFG.SNAPSHOT_TTL_SECONDS);
  console.log('   DEBUG_MODE:', CFG.DEBUG_MODE);
  console.log('');
  console.log('🔧 ENVIRONMENT:');
  console.log('   Script ID:', ScriptApp.getScriptId());
  console.log('   Timezone:', Session.getScriptTimeZone());
  console.log('');
  console.log('✅ VERIFICATION:');
  console.log('   Expected INITIAL_PAGE_SIZE: 1000');
  console.log('   Actual INITIAL_PAGE_SIZE:', CFG.INITIAL_PAGE_SIZE);
  console.log('   Status:', diagnostics.verification.isCorrect ? '✅ CORRECT' : '❌ MISMATCH - REDEPLOYMENT NEEDED');
  console.log('═══════════════════════════════════════════════════════════');

  return diagnostics;
}

// ============================================================================
// DIAGNOSTIC: Full Pipeline Test (for debugging loading failures)
// Run via GAS Editor: Run → testFullPipeline, then View → Logs
// ============================================================================

/**
 * Comprehensive diagnostic that tests every layer of the data loading pipeline.
 * This helps identify exactly where a loading failure occurs.
 * @return {Object} Detailed diagnostic results
 */
function testFullPipeline() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 🔧 FULL PIPELINE DIAGNOSTIC TEST                                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const results = {
    timestamp: new Date().toISOString(),
    steps: [],
    passed: 0,
    failed: 0,
    finalStatus: 'UNKNOWN'
  };
  
  function logStep(step, status, details) {
    const icon = status === 'PASS' ? '✅' : (status === 'FAIL' ? '❌' : '⚠️');
    console.log(`${icon} STEP ${step.num}: ${step.name}`);
    if (details) console.log(`   ${details}`);
    results.steps.push({ ...step, status, details });
    if (status === 'PASS') results.passed++;
    if (status === 'FAIL') results.failed++;
  }
  
  // STEP 1: Configuration Check
  try {
    const step1 = { num: 1, name: 'Configuration Values' };
    const configOk = CFG.INITIAL_PAGE_SIZE === 1000;
    logStep(step1, configOk ? 'PASS' : 'FAIL', 
      `INITIAL_PAGE_SIZE=${CFG.INITIAL_PAGE_SIZE}, Expected=1000`);
  } catch (e) {
    logStep({ num: 1, name: 'Configuration Values' }, 'FAIL', e.message);
  }
  
  // STEP 2: Sheet Access
  let shortcutsSheet = null;
  try {
    const step2 = { num: 2, name: 'Shortcuts Sheet Access' };
    shortcutsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
    if (shortcutsSheet) {
      logStep(step2, 'PASS', `Sheet "${CFG.SHEET_SHORTCUTS}" found`);
    } else {
      logStep(step2, 'FAIL', `Sheet "${CFG.SHEET_SHORTCUTS}" NOT FOUND`);
    }
  } catch (e) {
    logStep({ num: 2, name: 'Shortcuts Sheet Access' }, 'FAIL', e.message);
  }
  
  // STEP 3: Read Data From Sheet
  let allData = [];
  try {
    const step3 = { num: 3, name: 'Read Data From Sheet' };
    allData = getShortcutsFromSheet_();
    logStep(step3, 'PASS', `Read ${allData.length} shortcuts from sheet`);
  } catch (e) {
    logStep({ num: 3, name: 'Read Data From Sheet' }, 'FAIL', e.message);
  }
  
  // STEP 4: Data Integrity Check
  try {
    const step4 = { num: 4, name: 'Data Integrity Check' };
    if (allData.length === 0) {
      logStep(step4, 'WARN', 'No shortcuts found in sheet - is the sheet empty?');
    } else {
      const sample = allData[0];
      const hasKey = sample && sample.key;
      const hasExpansion = sample && sample.expansion;
      logStep(step4, hasKey && hasExpansion ? 'PASS' : 'FAIL',
        `Sample: key="${sample?.key?.substring(0,20)}...", hasExpansion=${!!hasExpansion}`);
    }
  } catch (e) {
    logStep({ num: 4, name: 'Data Integrity Check' }, 'FAIL', e.message);
  }
  
  // STEP 5: Cache Service Available
  try {
    const step5 = { num: 5, name: 'CacheService Available' };
    const cache = CacheService.getScriptCache();
    cache.put('TEST_KEY', 'TEST_VALUE', 60);
    const retrieved = cache.get('TEST_KEY');
    cache.remove('TEST_KEY');
    logStep(step5, retrieved === 'TEST_VALUE' ? 'PASS' : 'FAIL',
      `Write/Read test: ${retrieved === 'TEST_VALUE' ? 'Success' : 'Failed'}`);
  } catch (e) {
    logStep({ num: 5, name: 'CacheService Available' }, 'FAIL', e.message);
  }
  
  // STEP 6: Snapshot Creation
  let snapshotMeta = null;
  try {
    const step6 = { num: 6, name: 'Snapshot Creation' };
    snapshotMeta = beginShortcutsSnapshot();
    logStep(step6, snapshotMeta && snapshotMeta.snapshotToken ? 'PASS' : 'FAIL',
      `Token: ${snapshotMeta?.snapshotToken?.substring(0,8)}..., Total: ${snapshotMeta?.total}`);
  } catch (e) {
    logStep({ num: 6, name: 'Snapshot Creation' }, 'FAIL', e.message);
  }
  
  // STEP 7: Fetch First Page
  let firstPage = null;
  try {
    const step7 = { num: 7, name: 'Fetch First Page' };
    if (snapshotMeta && snapshotMeta.snapshotToken) {
      firstPage = fetchSnapshotPage_(snapshotMeta.snapshotToken, 0, CFG.INITIAL_PAGE_SIZE);
      if (firstPage && firstPage.items) {
        logStep(step7, 'PASS',
          `Fetched ${firstPage.items.length} items, hasMore=${firstPage.hasMore}`);
      } else if (firstPage && firstPage.error) {
        logStep(step7, 'FAIL', `Error: ${firstPage.error}`);
      } else {
        logStep(step7, 'FAIL', 'Unknown response format');
      }
    } else {
      logStep(step7, 'FAIL', 'No snapshot token available from Step 6');
    }
  } catch (e) {
    logStep({ num: 7, name: 'Fetch First Page' }, 'FAIL', e.message);
  }
  
  // STEP 8: Payload Size Check
  try {
    const step8 = { num: 8, name: 'Payload Size Check' };
    if (firstPage && firstPage.items) {
      const jsonSize = JSON.stringify(firstPage).length;
      const sizeKB = (jsonSize / 1024).toFixed(2);
      const isOk = jsonSize < 500000; // 500KB safe limit
      logStep(step8, isOk ? 'PASS' : 'WARN',
        `First page JSON size: ${sizeKB}KB (${isOk ? 'OK' : 'May be too large'})`);
    } else {
      logStep(step8, 'FAIL', 'No first page data to measure');
    }
  } catch (e) {
    logStep({ num: 8, name: 'Payload Size Check' }, 'FAIL', e.message);
  }
  
  // STEP 9: UI Handler Test
  try {
    const step9 = { num: 9, name: 'beginShortcutsSnapshotHandler Test' };
    const result = beginShortcutsSnapshotHandler();
    if (result && result.ok) {
      logStep(step9, 'PASS',
        `Handler returned ok=true, ${result.shortcuts?.length} shortcuts, hasMore=${result.hasMore}`);
    } else {
      logStep(step9, 'FAIL', `Handler failed: ${result?.message || 'Unknown error'}`);
    }
  } catch (e) {
    logStep({ num: 9, name: 'beginShortcutsSnapshotHandler Test' }, 'FAIL', e.message);
  }
  
  // STEP 10: Favorites Access
  try {
    const step10 = { num: 10, name: 'Favorites Access' };
    const favs = listMyFavorites_();
    logStep(step10, 'PASS', `Retrieved ${favs.length} favorites for current user`);
  } catch (e) {
    logStep({ num: 10, name: 'Favorites Access' }, 'FAIL', e.message);
  }
  
  // FINAL SUMMARY
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 📊 DIAGNOSTIC SUMMARY                                                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⚠️  Warnings: ${results.steps.filter(s => s.status === 'WARN').length}`);
  console.log('');
  
  if (results.failed === 0) {
    results.finalStatus = 'ALL TESTS PASSED';
    console.log('🎉 ALL TESTS PASSED - Server-side pipeline is healthy!');
    console.log('   If the UI still shows "Loading...", the issue is likely:');
    console.log('   1. Stale Web App deployment (redeploy via GAS Editor)');
    console.log('   2. Browser cache (hard refresh with Ctrl+Shift+R)');
    console.log('   3. Client-side JavaScript error (check browser console)');
  } else {
    results.finalStatus = 'TESTS FAILED';
    console.log('🔴 SOME TESTS FAILED - Review the failures above.');
    console.log('   Focus on the FIRST failed step - later failures may be cascading.');
  }
  
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return results;
}

// ============================================================================
// DIAGNOSTIC: Analyze Raw vs Unique Shortcuts (Missing Data Investigation)
// Run via GAS Editor: Run → diagnoseShortcutCount, then View → Logs
// ============================================================================

/**
 * FIX COLUMN MISALIGNMENT: Rotate columns B, C, D to correct positions
 * 
 * Current (Wrong):
 *   Column B (Snippet Name): Contains expansion text (should be in Content)
 *   Column C (Content): Contains category (should be in Application)
 *   Column D (Application): Contains trigger phrase (should be in Snippet Name)
 * 
 * After Fix:
 *   Column B (Snippet Name): trigger phrase (e.g., "dates")
 *   Column C (Content): expansion text (e.g., "0️⃣1️⃣/2️⃣0️⃣2️⃣6️⃣")
 *   Column D (Application): category (e.g., "english")
 */
function fixColumnMisalignment() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 🔧 FIX COLUMN MISALIGNMENT                                                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { error: 'Sheet not found' };
  }
  
  const lastRow = sheet.getLastRow();
  const numDataRows = lastRow - 1;
  
  if (numDataRows <= 0) {
    console.log('❌ ERROR: No data rows found!');
    return { error: 'No data' };
  }
  
  console.log(`📊 Processing ${numDataRows} rows...`);
  
  // Read columns B, C, D (indices 2, 3, 4 in 1-based)
  const colB = sheet.getRange(2, 2, numDataRows, 1).getValues(); // B = Current expansion (should be Snippet Name)
  const colC = sheet.getRange(2, 3, numDataRows, 1).getValues(); // C = Current category (should be Content)
  const colD = sheet.getRange(2, 4, numDataRows, 1).getValues(); // D = Current trigger (should be Application)
  
  // PREVIEW: Show what will change
  console.log('');
  console.log('📋 PREVIEW (First 3 rows):');
  for (let i = 0; i < 3 && i < numDataRows; i++) {
    console.log(`Row ${i + 2}:`);
    console.log(`  B (Snippet Name): "${String(colD[i][0]).substring(0, 30)}" ← was in D`);
    console.log(`  C (Content): "${String(colB[i][0]).substring(0, 30)}" ← was in B`);
    console.log(`  D (Application): "${String(colC[i][0]).substring(0, 20)}" ← was in C`);
  }
  
  // Create rotated data:
  // New B (Snippet Name) = Old D (trigger phrase)
  // New C (Content) = Old B (expansion text)
  // New D (Application) = Old C (category)
  const newColB = colD.map(row => [row[0]]);  // D → B
  const newColC = colB.map(row => [row[0]]);  // B → C
  const newColD = colC.map(row => [row[0]]);  // C → D
  
  // Write the rotated data
  console.log('');
  console.log('✍️ Writing corrected data...');
  
  sheet.getRange(2, 2, numDataRows, 1).setValues(newColB); // New Snippet Name
  sheet.getRange(2, 3, numDataRows, 1).setValues(newColC); // New Content
  sheet.getRange(2, 4, numDataRows, 1).setValues(newColD); // New Application
  
  // Invalidate cache
  invalidateShortcutsCache_();
  bumpCacheVersion_();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`🎉 SUCCESS! Fixed ${numDataRows} rows`);
  console.log('   Column B (Snippet Name): Now contains trigger phrases');
  console.log('   Column C (Content): Now contains expansion text');
  console.log('   Column D (Application): Now contains categories');
  console.log('');
  console.log('   Please refresh the web app to see correct data!');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    success: true,
    rowsFixed: numDataRows
  };
}

/**
 * Debug function to check spreadsheet structure and sample data
 */
function debugSpreadsheetStructure() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  
  console.log('=== SPREADSHEET HEADERS ===');
  header.forEach((h, i) => console.log(`Column ${i} (${String.fromCharCode(65 + i)}): "${h}"`));
  
  // Find Content column index
  const contentIdx = header.indexOf('Content');
  console.log(`\nContent column index: ${contentIdx}`);
  
  // Sample content values from different rows
  console.log('\n=== SAMPLE CONTENT VALUES ===');
  const sampleRows = [1, 10, 100, 500, 1000, 2000];
  sampleRows.forEach(rowIdx => {
    if (rowIdx < data.length) {
      const snippetName = String(data[rowIdx][1] || '').substring(0, 30);
      const content = String(data[rowIdx][contentIdx] || '').substring(0, 50);
      console.log(`Row ${rowIdx}: "${snippetName}" => Content: "${content}"`);
    }
  });
  
  // Count unique content values
  const contentCounts = {};
  for (let i = 1; i < data.length; i++) {
    const content = String(data[i][contentIdx] || '').substring(0, 20);
    contentCounts[content] = (contentCounts[content] || 0) + 1;
  }
  
  console.log('\n=== TOP 10 CONTENT VALUES ===');
  Object.entries(contentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([content, count]) => console.log(`  "${content}..." × ${count}`));
  
  return {
    headers: header,
    sampleRow: data[1] || [],
    totalRows: data.length - 1
  };
}



/**
 * Diagnostic function to analyze why not all shortcuts are loading.
 * Compares raw row count vs unique Snippet Names to identify duplicates.
 * 
 * Run this from the GAS Editor to see detailed analysis.
 * @return {Object} Diagnostic report with counts and duplicate info
 */
function diagnoseShortcutCount() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 🔍 SHORTCUT COUNT DIAGNOSTIC                                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { error: 'Sheet not found' };
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  console.log('📊 SHEET STATISTICS:');
  console.log(`   Sheet Name: ${CFG.SHEET_SHORTCUTS}`);
  console.log(`   Total Rows (including header): ${lastRow}`);
  console.log(`   Total Data Rows: ${lastRow - 1}`);
  console.log(`   Total Columns: ${lastCol}`);
  console.log('');
  
  // Read all data
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  
  // Find Snippet Name column index
  let keyColIdx = -1;
  for (let i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === 'Snippet Name') {
      keyColIdx = i;
      break;
    }
  }
  
  if (keyColIdx === -1) {
    console.log('❌ ERROR: "Snippet Name" column not found!');
    return { error: 'Snippet Name column not found' };
  }
  
  console.log(`   Snippet Name Column Index: ${keyColIdx} (Column ${String.fromCharCode(65 + keyColIdx)})`);
  console.log('');
  
  // Analyze keys
  const allKeys = [];
  const keyCount = {};
  let emptyKeyRows = 0;
  
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][keyColIdx] || '').trim();
    if (!key) {
      emptyKeyRows++;
      continue;
    }
    allKeys.push(key);
    keyCount[key] = (keyCount[key] || 0) + 1;
  }
  
  const uniqueKeys = Object.keys(keyCount);
  const duplicateKeys = uniqueKeys.filter(k => keyCount[k] > 1);
  const totalDuplicateRows = duplicateKeys.reduce((sum, k) => sum + keyCount[k] - 1, 0);
  
  console.log('📈 KEY ANALYSIS:');
  console.log(`   Total Non-Empty Keys: ${allKeys.length}`);
  console.log(`   Unique Snippet Names: ${uniqueKeys.length}`);
  console.log(`   Empty Key Rows (skipped): ${emptyKeyRows}`);
  console.log('');
  console.log('🔴 DUPLICATE ANALYSIS:');
  console.log(`   Keys with Duplicates: ${duplicateKeys.length}`);
  console.log(`   Extra Rows (duplicates): ${totalDuplicateRows}`);
  console.log(`   Expected UI Display: ${uniqueKeys.length} shortcuts`);
  console.log('');
  
  if (duplicateKeys.length > 0) {
    console.log('⚠️  TOP 20 DUPLICATE KEYS:');
    // Sort by count descending
    const sortedDupes = duplicateKeys.sort((a, b) => keyCount[b] - keyCount[a]).slice(0, 20);
    sortedDupes.forEach((key, idx) => {
      console.log(`   ${idx + 1}. "${key.substring(0, 40)}${key.length > 40 ? '...' : ''}" → ${keyCount[key]} occurrences`);
    });
    console.log('');
  }
  
  // Recommendation
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  if (duplicateKeys.length > 0) {
    console.log('💡 RECOMMENDATION:');
    console.log(`   You have ${totalDuplicateRows} duplicate rows that are being filtered out.`);
    console.log('   Run cleanupDuplicateShortcuts() to remove them and retain full data.');
    console.log('   Or run cleanupAllDuplicates() to clean both Shortcuts and Favorites.');
  } else {
    console.log('✅ NO DUPLICATES FOUND');
    console.log('   All shortcuts should be loading. Check snapshot TTL or network issues.');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    totalDataRows: lastRow - 1,
    emptyKeyRows: emptyKeyRows,
    totalNonEmptyKeys: allKeys.length,
    uniqueKeys: uniqueKeys.length,
    duplicateKeyCount: duplicateKeys.length,
    duplicateRowsFiltered: totalDuplicateRows,
    topDuplicates: duplicateKeys.slice(0, 20).map(k => ({ key: k, count: keyCount[k] })),
    recommendation: duplicateKeys.length > 0 
      ? 'Run cleanupDuplicateShortcuts() to remove duplicate rows'
      : 'No duplicates found - check snapshot/cache TTL'
  };
}

// ============================================================================
// MIGRATION: Add ID Column to Shortcuts Sheet
// Run ONCE via GAS Editor: Run → migrateAddIdColumn, then View → Logs
// ============================================================================

/**
 * DIAGNOSTIC: Check for duplicate IDs in the ID column
 * Run this to see if the ID column has duplicates
 */
function diagnoseDuplicateIds() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 🔍 DUPLICATE ID DIAGNOSTIC                                                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { error: 'Sheet not found' };
  }
  
  const lastRow = sheet.getLastRow();
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Check if ID column exists
  if (String(header[0] || '').trim() !== 'ID') {
    console.log('❌ ERROR: ID column not found at position A!');
    return { error: 'ID column not found' };
  }
  
  console.log(`📊 Reading ${lastRow - 1} IDs...`);
  
  const idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const idCount = {};
  let emptyIds = 0;
  
  for (let i = 0; i < idColumn.length; i++) {
    const id = String(idColumn[i][0] || '').trim();
    if (!id) {
      emptyIds++;
      continue;
    }
    idCount[id] = (idCount[id] || 0) + 1;
  }
  
  const uniqueIds = Object.keys(idCount);
  const duplicateIds = uniqueIds.filter(id => idCount[id] > 1);
  const totalDupeRows = duplicateIds.reduce((sum, id) => sum + idCount[id] - 1, 0);
  
  console.log('');
  console.log('📈 ID ANALYSIS:');
  console.log(`   Total Rows: ${lastRow - 1}`);
  console.log(`   Empty IDs: ${emptyIds}`);
  console.log(`   Unique IDs: ${uniqueIds.length}`);
  console.log(`   IDs with Duplicates: ${duplicateIds.length}`);
  console.log(`   Extra Duplicate Rows: ${totalDupeRows}`);
  
  if (duplicateIds.length > 0) {
    console.log('');
    console.log('⚠️  TOP 20 DUPLICATE IDs:');
    const sorted = duplicateIds.sort((a, b) => idCount[b] - idCount[a]).slice(0, 20);
    sorted.forEach((id, idx) => {
      console.log(`   ${idx + 1}. "${id}" → ${idCount[id]} occurrences`);
    });
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  if (duplicateIds.length > 0 || emptyIds > 0) {
    console.log('💡 RECOMMENDATION: Run regenerateAllIds() to fix duplicate/missing IDs');
  } else {
    console.log('✅ All IDs are unique!');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    totalRows: lastRow - 1,
    emptyIds,
    uniqueIds: uniqueIds.length,
    duplicateIdCount: duplicateIds.length,
    duplicateRows: totalDupeRows
  };
}

/**
 * REGENERATE ALL IDs: Create truly unique IDs for every row
 * Uses timestamp + row index for guaranteed uniqueness
 */
function regenerateAllIds() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 🔄 REGENERATING ALL IDs                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { error: 'Sheet not found' };
  }
  
  const lastRow = sheet.getLastRow();
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  if (String(header[0] || '').trim() !== 'ID') {
    console.log('❌ ERROR: ID column not found at position A!');
    return { error: 'ID column not found' };
  }
  
  const numDataRows = lastRow - 1;
  console.log(`📊 Generating ${numDataRows} unique IDs...`);
  
  const timestamp = Date.now().toString(36).toUpperCase();
  const ids = [];
  
  for (let i = 0; i < numDataRows; i++) {
    // Format: SC-[timestamp]-[row padded 6 digits]
    ids.push([`SC-${timestamp}-${String(i + 1).padStart(6, '0')}`]);
  }
  
  sheet.getRange(2, 1, numDataRows, 1).setValues(ids);
  
  // Invalidate cache
  invalidateShortcutsCache_();
  bumpCacheVersion_();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`🎉 SUCCESS! Generated ${numDataRows} unique IDs`);
  console.log('   Format: SC-[timestamp]-[row number]');
  console.log('   Please refresh the web app to see all shortcuts.');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    success: true,
    rowsUpdated: numDataRows,
    sampleId: ids[0][0]
  };
}


/**
 * ONE-TIME MIGRATION: Adds an 'ID' column to the Shortcuts sheet.
 * Inserts a new column A, names it 'ID', and generates unique IDs for all rows.
 * 
 * SAFE TO RUN: Will skip if ID column already exists.
 * 
 * @return {Object} Migration result
 */
function migrateAddIdColumn() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 🔄 MIGRATION: Adding ID Column to Shortcuts Sheet                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CFG.SHEET_SHORTCUTS);
  
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { success: false, error: 'Sheet not found' };
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  console.log(`📊 Current sheet: ${lastRow} rows, ${lastCol} columns`);
  
  // Check if ID column already exists
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const firstHeader = String(header[0] || '').trim();
  
  if (firstHeader === 'ID') {
    console.log('✅ ID column already exists! Checking for empty IDs...');
    
    // Check for rows without IDs and fill them
    const idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    let emptyCount = 0;
    const updates = [];
    
    for (let i = 0; i < idColumn.length; i++) {
      if (!idColumn[i][0]) {
        emptyCount++;
        updates.push([`SC-${String(i + 2).padStart(6, '0')}`]);
      } else {
        updates.push([idColumn[i][0]]);
      }
    }
    
    if (emptyCount > 0) {
      console.log(`   Found ${emptyCount} rows without IDs. Filling...`);
      sheet.getRange(2, 1, updates.length, 1).setValues(updates);
      console.log(`   ✅ Filled ${emptyCount} missing IDs`);
    } else {
      console.log('   All rows already have IDs. Nothing to do.');
    }
    
    return { 
      success: true, 
      message: 'ID column exists', 
      emptyIdsFilled: emptyCount 
    };
  }
  
  console.log('📝 Inserting new ID column at position A...');
  
  // Insert new column at position A
  sheet.insertColumnBefore(1);
  
  // Set header
  sheet.getRange(1, 1).setValue('ID').setFontWeight('bold');
  
  console.log('🔢 Generating unique IDs for all rows...');
  
  // Generate IDs for all data rows
  const numDataRows = lastRow - 1;
  if (numDataRows > 0) {
    const ids = [];
    for (let i = 0; i < numDataRows; i++) {
      // Format: SC-000001, SC-000002, etc.
      ids.push([`SC-${String(i + 1).padStart(6, '0')}`]);
    }
    
    sheet.getRange(2, 1, numDataRows, 1).setValues(ids);
    console.log(`   ✅ Generated ${numDataRows} unique IDs`);
  }
  
  // Invalidate cache since schema changed
  invalidateShortcutsCache_();
  bumpCacheVersion_();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🎉 MIGRATION COMPLETE!');
  console.log(`   Added ID column with ${numDataRows} unique IDs`);
  console.log('   Cache invalidated. Please refresh the web app.');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    success: true,
    message: 'ID column added successfully',
    rowsProcessed: numDataRows,
    newColumnCount: lastCol + 1
  };
}

/**
 * Generates a unique ID for new shortcuts.
 * @return {string} New unique ID in format SC-XXXXXX
 */
function generateShortcutId_() {
  const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
  const lastRow = sheet.getLastRow();
  // Use timestamp + random for guaranteed uniqueness
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `SC-${timestamp}-${random}`.toUpperCase();
}

// ============================================================================
// SHEET ORGANIZATION & STRUCTURE ANALYSIS
// Run via GAS Editor: Run → analyzeSheetStructure, then View → Logs
// ============================================================================

/**
 * DIAGNOSTIC: Analyze the current sheet structure and compare against expected headers.
 * Run this first to understand the current state before any reorganization.
 * @return {Object} Detailed analysis report
 */
function analyzeSheetStructure() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 📊 SHEET STRUCTURE ANALYSIS                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { error: 'Sheet not found' };
  }
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const data = sheet.getDataRange().getValues();
  const currentHeaders = data[0];
  
  console.log('📋 CURRENT HEADERS:');
  currentHeaders.forEach((h, i) => {
    const colLetter = String.fromCharCode(65 + i);
    console.log(`   Column ${colLetter}: "${h}"`);
  });
  
  console.log('');
  console.log('📋 EXPECTED HEADERS:');
  HEADERS_SHORTCUTS.forEach((h, i) => {
    const colLetter = String.fromCharCode(65 + i);
    console.log(`   Column ${colLetter}: "${h}"`);
  });
  
  // Compare headers
  console.log('');
  console.log('🔍 HEADER COMPARISON:');
  const headerIssues = [];
  const maxCols = Math.max(currentHeaders.length, HEADERS_SHORTCUTS.length);
  
  for (let i = 0; i < maxCols; i++) {
    const current = String(currentHeaders[i] || '').trim();
    const expected = HEADERS_SHORTCUTS[i] || '(none)';
    const colLetter = String.fromCharCode(65 + i);
    
    if (current === expected) {
      console.log(`   ✅ Column ${colLetter}: "${current}" matches`);
    } else {
      console.log(`   ❌ Column ${colLetter}: "${current}" ≠ expected "${expected}"`);
      headerIssues.push({ column: colLetter, index: i, current, expected });
    }
  }
  
  // Sample data analysis
  console.log('');
  console.log('📊 SAMPLE DATA (First 5 rows):');
  for (let row = 1; row < Math.min(6, data.length); row++) {
    console.log(`   Row ${row + 1}:`);
    for (let col = 0; col < Math.min(5, currentHeaders.length); col++) {
      const colLetter = String.fromCharCode(65 + col);
      const value = String(data[row][col] || '').substring(0, 40);
      console.log(`      ${colLetter}: "${value}${value.length >= 40 ? '...' : ''}"`);
    }
  }
  
  // Content pattern detection
  console.log('');
  console.log('🔬 CONTENT PATTERN ANALYSIS:');
  const patterns = detectColumnPatterns_(data);
  Object.entries(patterns).forEach(([colLetter, detectedType]) => {
    console.log(`   Column ${colLetter}: Detected as "${detectedType}"`);
  });
  
  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  if (headerIssues.length === 0) {
    console.log('✅ HEADERS ARE CORRECT!');
    console.log('   No reorganization needed. Run migrateAddIdColumn() if ID column is missing.');
  } else {
    console.log(`⚠️  FOUND ${headerIssues.length} HEADER MISMATCH(ES)`);
    console.log('   Run reorganizeSheetStructure(true) to preview fixes.');
    console.log('   Run reorganizeSheetStructure(false) to apply fixes.');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    totalRows: lastRow,
    totalColumns: lastCol,
    currentHeaders: currentHeaders,
    expectedHeaders: HEADERS_SHORTCUTS,
    headerIssues: headerIssues,
    detectedPatterns: patterns,
    needsReorganization: headerIssues.length > 0
  };
}

/**
 * Helper: Detect what type of data each column contains based on patterns.
 * @param {Array} data - 2D array of sheet data
 * @return {Object} Column letter -> detected type mapping
 */
function detectColumnPatterns_(data) {
  if (data.length < 2) return {};
  
  const patterns = {};
  const sampleSize = Math.min(100, data.length - 1);
  
  for (let col = 0; col < data[0].length; col++) {
    const colLetter = String.fromCharCode(65 + col);
    const samples = [];
    
    // Collect samples from data rows (skip header)
    for (let row = 1; row <= sampleSize; row++) {
      if (data[row] && data[row][col]) {
        samples.push(String(data[row][col]));
      }
    }
    
    if (samples.length === 0) {
      patterns[colLetter] = 'empty';
      continue;
    }
    
    // Detect patterns
    const avgLength = samples.reduce((sum, s) => sum + s.length, 0) / samples.length;
    const hasNewlines = samples.some(s => s.includes('\n'));
    const startsWithSC = samples.filter(s => s.match(/^SC-|^ROW-/i)).length > samples.length * 0.5;
    const shortStrings = samples.filter(s => s.length < 50).length > samples.length * 0.8;
    const hasTimestamps = samples.filter(s => s.match(/^\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/)).length > samples.length * 0.3;
    
    if (startsWithSC) {
      patterns[colLetter] = 'ID';
    } else if (hasTimestamps) {
      patterns[colLetter] = 'UpdatedAt';
    } else if (avgLength > 100 || hasNewlines) {
      patterns[colLetter] = 'Content (long text)';
    } else if (shortStrings && avgLength < 30) {
      patterns[colLetter] = 'Short text (Name/App)';
    } else {
      patterns[colLetter] = 'Mixed content';
    }
  }
  
  return patterns;
}

/**
 * REORGANIZE: Fix column order to match expected structure.
 * 
 * @param {boolean} dryRun - If true, only previews changes. If false, applies changes.
 * @return {Object} Reorganization result
 */
function reorganizeSheetStructure(dryRun = true) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ 🔧 SHEET REORGANIZATION ${dryRun ? '(PREVIEW MODE)' : '(EXECUTE MODE)'}                          ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  if (dryRun) {
    console.log('⚠️  PREVIEW MODE: No changes will be made.');
    console.log('   To apply changes, run: reorganizeSheetStructure(false)');
    console.log('');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { error: 'Sheet not found' };
  }
  
  const data = sheet.getDataRange().getValues();
  const currentHeaders = data[0].map(h => String(h).trim());
  
  // Build mapping: expected header -> current column index
  console.log('📊 COLUMN MAPPING:');
  const columnMap = {};
  const missingHeaders = [];
  
  HEADERS_SHORTCUTS.forEach((expected, targetIdx) => {
    const currentIdx = currentHeaders.indexOf(expected);
    const targetLetter = String.fromCharCode(65 + targetIdx);
    
    if (currentIdx === -1) {
      console.log(`   ⚠️  "${expected}" → NOT FOUND (will create at Column ${targetLetter})`);
      missingHeaders.push({ header: expected, targetIdx });
    } else if (currentIdx === targetIdx) {
      console.log(`   ✅ "${expected}" → Column ${targetLetter} (already correct)`);
    } else {
      const currentLetter = String.fromCharCode(65 + currentIdx);
      console.log(`   🔄 "${expected}" → Move from Column ${currentLetter} to ${targetLetter}`);
    }
    columnMap[expected] = currentIdx;
  });
  
  // Check if already organized
  const needsReorg = HEADERS_SHORTCUTS.some((h, i) => columnMap[h] !== i);
  const hasMissing = missingHeaders.length > 0;
  
  if (!needsReorg && !hasMissing) {
    console.log('');
    console.log('✅ SHEET IS ALREADY CORRECTLY ORGANIZED!');
    console.log('   No changes needed.');
    return { success: true, message: 'Already organized', changes: 0 };
  }
  
  if (dryRun) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('📋 PREVIEW COMPLETE');
    console.log(`   Columns to reorder: ${needsReorg ? 'Yes' : 'No'}`);
    console.log(`   Missing columns to add: ${missingHeaders.length}`);
    console.log('');
    console.log('   To apply these changes, run:');
    console.log('   reorganizeSheetStructure(false)');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    
    return {
      success: true,
      dryRun: true,
      needsReorg,
      missingHeaders: missingHeaders.map(m => m.header)
    };
  }
  
  // EXECUTE MODE: Apply changes
  console.log('');
  console.log('🔄 APPLYING CHANGES...');
  
  // Step 1: Build new data array with correct column order
  const newData = [];
  
  for (let row = 0; row < data.length; row++) {
    const newRow = [];
    
    HEADERS_SHORTCUTS.forEach((expectedHeader, targetIdx) => {
      const sourceIdx = columnMap[expectedHeader];
      
      if (row === 0) {
        // Header row: use expected header name
        newRow.push(expectedHeader);
      } else if (sourceIdx === -1) {
        // Missing column: fill with empty or default
        if (expectedHeader === 'ID') {
          newRow.push(`SC-${String(row).padStart(6, '0')}`);
        } else if (expectedHeader === 'UpdatedAt') {
          newRow.push(new Date().toISOString());
        } else {
          newRow.push('');
        }
      } else {
        // Copy from source column
        newRow.push(data[row][sourceIdx]);
      }
    });
    
    newData.push(newRow);
  }
  
  // Step 2: Clear sheet and write new data
  console.log('   Clearing existing data...');
  sheet.clear();
  
  console.log('   Writing reorganized data...');
  sheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
  
  // Step 3: Format header row
  console.log('   Formatting header row...');
  sheet.getRange(1, 1, 1, HEADERS_SHORTCUTS.length)
    .setFontWeight('bold')
    .setBackground('#4a86e8')
    .setFontColor('#ffffff');
  
  // Step 4: Invalidate cache
  console.log('   Invalidating cache...');
  invalidateShortcutsCache_();
  bumpCacheVersion_();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🎉 REORGANIZATION COMPLETE!');
  console.log(`   Processed ${newData.length - 1} data rows`);
  console.log(`   Organized ${HEADERS_SHORTCUTS.length} columns`);
  console.log('');
  console.log('   Please refresh the web app to see the changes.');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return {
    success: true,
    dryRun: false,
    rowsProcessed: newData.length - 1,
    columnsOrganized: HEADERS_SHORTCUTS.length
  };
}

/**
 * SORT BY CATEGORY: Sorts the shortcuts sheet by Application (category) column.
 * Keeps header row in place, sorts all data rows alphabetically by category.
 * 
 * @param {boolean} dryRun - If true, only previews. If false, applies sort.
 * @return {Object} Sort result
 */
function sortSheetByCategory(dryRun = true) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ 📑 SORT SHEET BY CATEGORY ${dryRun ? '(PREVIEW)' : '(EXECUTE)'}                               ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_SHORTCUTS);
  if (!sheet) {
    console.log('❌ ERROR: Shortcuts sheet not found!');
    return { error: 'Sheet not found' };
  }
  
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  
  // Find Application column
  const appColIdx = header.indexOf('Application');
  if (appColIdx === -1) {
    console.log('❌ ERROR: Application column not found!');
    return { error: 'Application column not found' };
  }
  
  console.log(`📊 Application column found at index ${appColIdx} (Column ${String.fromCharCode(65 + appColIdx)})`);
  
  // Count categories
  const categories = {};
  for (let i = 1; i < data.length; i++) {
    const cat = String(data[i][appColIdx] || '').trim() || '(empty)';
    categories[cat] = (categories[cat] || 0) + 1;
  }
  
  console.log('');
  console.log('📋 CATEGORIES FOUND:');
  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([cat, count]) => {
      console.log(`   "${cat}": ${count} shortcuts`);
    });
  
  if (Object.keys(categories).length > 15) {
    console.log(`   ... and ${Object.keys(categories).length - 15} more categories`);
  }
  
  if (dryRun) {
    console.log('');
    console.log('⚠️  PREVIEW MODE: Run sortSheetByCategory(false) to apply sort.');
    return { success: true, dryRun: true, categories: Object.keys(categories).length };
  }
  
  // Execute sort
  console.log('');
  console.log('🔄 Sorting data...');
  
  // Sort data rows (keep header)
  const dataRows = data.slice(1);
  dataRows.sort((a, b) => {
    const catA = String(a[appColIdx] || '').toLowerCase();
    const catB = String(b[appColIdx] || '').toLowerCase();
    return catA.localeCompare(catB);
  });
  
  // Write sorted data
  sheet.getRange(2, 1, dataRows.length, dataRows[0].length).setValues(dataRows);
  
  // Invalidate cache
  invalidateShortcutsCache_();
  bumpCacheVersion_();
  
  console.log('');
  console.log('✅ SORT COMPLETE!');
  console.log(`   Sorted ${dataRows.length} rows by category.`);
  
  return { success: true, dryRun: false, rowsSorted: dataRows.length };
}

