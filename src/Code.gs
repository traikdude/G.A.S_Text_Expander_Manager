/**
 * Text Expansion Manager — Google Apps Script Backend (Revised + Snapshot Fix ✅)
 * Author: traikdude + enhancements
 * Runtime: V8
 *
 * ✅ Fixes:
 * 1) Added CFG.SNAPSHOT_TTL_SECONDS (was missing → snapshot creation could throw) 🧯
 * 2) Snapshot now caches ONLY metadata; paging reads directly from the Sheet (more reliable for 10k+ rows) 🚀
 * 3) Added missing UI handlers used by the frontend: beginShortcutsSnapshotHandler + fetchNextShortcutsPageHandler 🧩
 * 4) Improved cache invalidation to remove chunk keys too 🧼
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

  // ✅ FIX: Snapshot TTL MUST exist (Cache putAll expects an Integer 1..21600)
  SNAPSHOT_TTL_SECONDS: 60 * 5, // 5 minutes 🕔
  SNAPSHOT_DRIVE_FOLDER_NAME: '_TEM_Snapshots', // Drive fallback folder
  SNAPSHOT_MAX_DRIVE_FILES: 25, // Keep last N snapshots in Drive
  SNAPSHOT_CHUNK_SIZE: 90000, // ~100KB safety margin for CacheService
  SNAPSHOT_CACHE_RETRIES: 2, // Retry count before Drive fallback

  // Import constraints
  MAX_IMPORT_ROWS: 10000,
  MAX_KEY_LEN: 80,
  MAX_FIELD_LEN: 50000,
  MAX_TAGS_LEN: 512,
  MAX_LANGUAGE_LEN: 64,
  MAX_APP_LEN: 128,
  MAX_DESC_LEN: 2000,

  // Paging
  INITIAL_PAGE_SIZE: 200, // keep modest to avoid client payload limits 📦
  DEBUG_MODE: true,

  // Tools
  PYTHON_URLS: {
    ML_CATEGORIZER: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/MLCategorizer.ipynb',
    DATA_QUALITY: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/DataQualityAnalyzer.ipynb',
    DUPLICATE_FINDER: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/DuplicateFinder.ipynb',
    ANALYTICS: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/AnalyticsDashboard.ipynb',
    BACKUP_SYSTEM: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/BackupSystem.ipynb',
    DRIVE_BRIDGE: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/DriveCategorizerBridge.ipynb',
    FONT_CATEGORIZER: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/FontAwareCategorizer.ipynb',
    FOLDER: 'https://drive.google.com/drive/u/0/my-drive'
  }
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
  // Optional enhanced dropdown columns (v2.x)
  'MainCategory',
  'Subcategory',
  'FontStyle',
  'Platform',
  'UsageFrequency',
];

const HEADERS_FAVORITES = [
  'UserEmail',
  'Snippet Name',
  'CreatedAt',
];

// ============================================================================
// SNAPSHOT & PAGING API (REVISED ✅)
// ============================================================================

/**
 * Creates a snapshot token + metadata (NO giant dataset caching).
 * Pages are read directly from the sheet for reliability 🧱
 * @return {Object} Snapshot metadata
 */
function beginShortcutsSnapshot() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Server busy. Please try again.');
  }

  try {
    ensureSheets_();

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const total = Math.max(sheet.getLastRow() - 1, 0);
    const token = Utilities.getUuid();
    const nowIso = new Date().toISOString();

    // We store meta in cache so client can page consistently for a short window
    const meta = {
      snapshotToken: token,
      total,
      pageSize: CFG.INITIAL_PAGE_SIZE,
      builtAt: nowIso,
      sheetId: sheet.getSheetId(),
      spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
      lastRow: sheet.getLastRow(),
      lastCol: sheet.getLastColumn(),
    };

    writeSnapshotMeta_(token, meta);

    if (CFG.DEBUG_MODE) {
      console.log(`[Snapshot] Created token=${token} total=${total} pageSize=${meta.pageSize}`);
    }

    return meta;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fetch a page using a snapshot token (reads sheet rows directly).
 * @param {string} snapshotToken
 * @param {number} offset
 * @param {number} limit
 * @return {Object}
 */
function fetchSnapshotPage_(snapshotToken, offset, limit) {
  const meta = readSnapshotMeta_(snapshotToken);
  if (!meta) {
    if (CFG.DEBUG_MODE) console.warn(`[Snapshot] Missing/Expired meta token=${snapshotToken}`);
    return { error: 'SNAPSHOT_EXPIRED' };
  }

  const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = indexHeader_(header);

  const total = Math.max(sheet.getLastRow() - 1, 0);
  const start = Math.max(Number(offset) || 0, 0);
  const count = Math.max(Math.min(Number(limit) || meta.pageSize || CFG.INITIAL_PAGE_SIZE, 2000), 1);

  if (start >= total) {
    return {
      items: [],
      offset: start,
      total,
      hasMore: false,
      snapshotToken
    };
  }

  const startRow = start + 2; // +1 header, +1 1-based
  const numRows = Math.min(count, total - start);
  const numCols = sheet.getLastColumn();

  const values = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  const items = valuesToShortcuts_(values, idx);

  return {
    items,
    offset: start + items.length,
    total,
    hasMore: (start + items.length) < total,
    snapshotToken
  };
}

/**
 * Convert sheet rows -> shortcut objects
 * @param {Array<Array<any>>} rows
 * @param {Object} idx header index map
 * @return {Array<Object>}
 */
function valuesToShortcuts_(rows, idx) {
  const hasId = idx['ID'] !== undefined;

  const col = {
    id: hasId ? idx['ID'] : -1,
    key: idx['Snippet Name'],
    expansion: idx['Content'],
    application: idx['Application'],
    description: idx['Description'],
    language: idx['Language'],
    tags: idx['Tags'],
    updatedAt: idx['UpdatedAt'],
    mainCategory: idx['MainCategory'],
    subcategory: idx['Subcategory'],
    fontStyle: idx['FontStyle'],
    platform: idx['Platform'],
    usageFrequency: idx['UsageFrequency'],
  };

  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const key = String(r[col.key] || '').trim();
    if (!key) continue;

    const id = hasId && r[col.id] ? String(r[col.id]) : `ROW-${i + 1}`;

    out.push({
      id,
      key,
      expansion: String(r[col.expansion] || ''),
      application: String(r[col.application] || ''),
      description: String(r[col.description] || ''),
      language: String(r[col.language] || ''),
      tags: String(r[col.tags] || ''),
      updatedAt: String(r[col.updatedAt] || ''),
      mainCategory: col.mainCategory !== undefined ? String(r[col.mainCategory] || '') : '',
      subcategory: col.subcategory !== undefined ? String(r[col.subcategory] || '') : '',
      fontStyle: col.fontStyle !== undefined ? String(r[col.fontStyle] || '') : '',
      platform: col.platform !== undefined ? String(r[col.platform] || '') : '',
      usageFrequency: col.usageFrequency !== undefined ? String(r[col.usageFrequency] || '') : '',
    });
  }
  return out;
}

// --- Snapshot meta cache (small + safe) ---

function writeSnapshotMeta_(token, meta) {
  const cache = CacheService.getScriptCache();
  const key = `SNAP_META_${token}`;
  cache.put(key, JSON.stringify(meta), CFG.SNAPSHOT_TTL_SECONDS);
}

function readSnapshotMeta_(token) {
  const cache = CacheService.getScriptCache();
  const key = `SNAP_META_${token}`;
  const raw = cache.get(key);
  return raw ? safeJsonParse_(raw) : null;
}

// ============================================================================
// UI HANDLERS (Frontend calls these via google.script.run ✅)
// ============================================================================

/**
 * Called by UI on load to create snapshot + return first page + favorites.
 * @return {Object}
 */
function beginShortcutsSnapshotHandler() {
  try {
    const meta = beginShortcutsSnapshot();
    const page = fetchSnapshotPage_(meta.snapshotToken, 0, meta.pageSize);
    if (page.error) return { ok: false, error: page.error };

    return {
      ok: true,
      snapshotToken: meta.snapshotToken,
      builtAt: meta.builtAt,
      total: page.total,
      offset: page.offset,
      hasMore: page.hasMore,
      pageSize: meta.pageSize,
      shortcuts: page.items,
      favorites: listMyFavorites_(),
      userEmail: getUserEmail_()
    };
  } catch (err) {
    console.error('beginShortcutsSnapshotHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

/**
 * Called by UI to fetch additional pages.
 * @param {string} snapshotToken
 * @param {number} offset
 * @param {number} limit
 * @return {Object}
 */
function fetchNextShortcutsPageHandler(snapshotToken, offset, limit) {
  try {
    const page = fetchSnapshotPage_(snapshotToken, offset, limit);
    if (page.error) return { ok: false, error: page.error };

    return {
      ok: true,
      snapshotToken: page.snapshotToken,
      total: page.total,
      offset: page.offset,
      hasMore: page.hasMore,
      shortcuts: page.items
    };
  } catch (err) {
    console.error('fetchNextShortcutsPageHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

// ============================================================================
// TRIGGERS & ENTRY POINTS
// ============================================================================

function onOpen(e) {
  ensureSheets_();
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('📝 Text Expansion Tools')
    .addItem('🚀 Open Manager (Sidebar)', 'openManagerSidebar')
    .addItem('🖼️ Open Manager (Dialog)', 'openManagerDialog')
    .addSeparator()
    .addSubMenu(ui.createMenu('🐍 Python Tools (Colab)')
      .addItem('🧠 Run ML Categorizer', 'openMLCategorizer')
      .addItem('🛡️ Run Data Quality Check', 'openDataQuality')
      .addItem('👯 Run Duplicate Finder', 'openDuplicateFinder')
      .addItem('📊 Run Analytics', 'openAnalytics')
      .addSeparator()
      .addItem('💾 Run Backup System', 'openBackupSystem')
      .addItem('🌉 Run Drive Bridge', 'openDriveBridge')
      .addItem('✨ Run Font Categorizer', 'openFontCategorizer')
      .addSeparator()
      .addItem('📂 Open Tools Folder', 'openToolsFolder')
    )
    .addSeparator()
    .addItem('🌐 Open Web App (New Tab)', 'openWebAppLinkDialog')
    .addSeparator()
    .addItem('🔄 Warm Cache (10k+)', 'warmShortcutsCache')
    .addItem('🗑️ Invalidate Cache', 'invalidateShortcutsCache')
    .addSeparator()
    .addSubMenu(ui.createMenu('🧹 Cleanup')
      .addItem('📋 Cleanup Shortcuts Only', 'cleanupDuplicateShortcuts')
      .addItem('⭐ Cleanup Favorites Only', 'cleanupDuplicateFavorites')
      .addItem('🧼 Cleanup Both', 'cleanupAllDuplicates')
    )
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function openManagerSidebar() {
  ensureSheets_();
  const html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Text Expansion Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  SpreadsheetApp.getUi().showSidebar(html);
}

function openManagerDialog() {
  ensureSheets_();
  const html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle('Text Expansion Manager');
  SpreadsheetApp.getUi().showModalDialog(html, 'Text Expansion Manager');
}

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

function doGet(e) {
  ensureSheets_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Text Expansion Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// PYTHON TOOLS LAUNCHERS
// ============================================================================

function openMLCategorizer() { openUrl_(CFG.PYTHON_URLS.ML_CATEGORIZER, 'ML Categorizer'); }
function openDataQuality() { openUrl_(CFG.PYTHON_URLS.DATA_QUALITY, 'Data Quality Check'); }
function openDuplicateFinder() { openUrl_(CFG.PYTHON_URLS.DUPLICATE_FINDER, 'Duplicate Finder'); }
function openAnalytics() { openUrl_(CFG.PYTHON_URLS.ANALYTICS, 'Analytics Dashboard'); }
function openBackupSystem() { openUrl_(CFG.PYTHON_URLS.BACKUP_SYSTEM, 'Backup System'); }
function openDriveBridge() { openUrl_(CFG.PYTHON_URLS.DRIVE_BRIDGE, 'Drive Bridge Worker'); }
function openFontCategorizer() { openUrl_(CFG.PYTHON_URLS.FONT_CATEGORIZER, 'Font Categorizer'); }
function openToolsFolder() { openUrl_(CFG.PYTHON_URLS.FOLDER, 'Python Tools Folder'); }

function openUrl_(url, title) {
  const html = HtmlService.createHtmlOutput(
    `<html>
      <script>
        window.open('${url}', '_blank');
        google.script.host.close();
      </script>
      <body style="font-family: sans-serif; padding: 20px;">
        <h3>Opening ${title}...</h3>
        <p>If the tab didn't open, <a href="${url}" target="_blank">click here</a>.</p>
      </body>
    </html>`
  ).setWidth(400).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

// ============================================================================
// SHORTCUTS CRUD (Backend API for UI) ✅
// ============================================================================

/**
 * Create or update a shortcut (upsert).
 * Expected payload fields:
 * { id?, key, expansion, application?, description?, language?, tags?, mainCategory?, subcategory?, fontStyle?, platform?, usageFrequency? }
 */
function upsertShortcutHandler(payload) {
  try {
    ensureSheets_();
    const v = validateShortcutPayload_(payload);
    if (!v.ok) return { ok: false, message: v.message };

    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = indexHeader_(header);

    const hasId = idx['ID'] !== undefined;
    const id = String(payload.id || '').trim();
    const key = String(payload.key || '').trim();

    const dataLastRow = sheet.getLastRow();
    const idCol = hasId ? idx['ID'] : -1;
    const keyCol = idx['Snippet Name'];

    let targetRow = -1;

    if (hasId && id) {
      // Find by ID (fast enough for 10k; optimize via map if needed)
      const ids = sheet.getRange(2, idCol + 1, Math.max(dataLastRow - 1, 0), 1).getValues().map(r => String(r[0] || '').trim());
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === id) { targetRow = i + 2; break; }
      }
    }

    if (targetRow === -1) {
      // Find by key
      const keys = sheet.getRange(2, keyCol + 1, Math.max(dataLastRow - 1, 0), 1).getValues().map(r => String(r[0] || '').trim());
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] === key) { targetRow = i + 2; break; }
      }
    }

    const nowIso = new Date().toISOString();
    const outId = (hasId ? (id || generateShortcutId_()) : '');

    const rowObj = {
      'ID': outId,
      'Snippet Name': key,
      'Content': String(payload.expansion || ''),
      'Application': String(payload.application || ''),
      'Description': String(payload.description || ''),
      'Language': String(payload.language || ''),
      'Tags': String(payload.tags || ''),
      'UpdatedAt': nowIso,
      'MainCategory': String(payload.mainCategory || ''),
      'Subcategory': String(payload.subcategory || ''),
      'FontStyle': String(payload.fontStyle || ''),
      'Platform': String(payload.platform || ''),
      'UsageFrequency': String(payload.usageFrequency || ''),
    };

    const rowValues = header.map(h => rowObj[String(h).trim()] !== undefined ? rowObj[String(h).trim()] : '');

    if (targetRow === -1) {
      sheet.appendRow(rowValues);
    } else {
      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    }

    invalidateShortcutsCache_();

    return {
      ok: true,
      shortcut: {
        id: outId || (targetRow !== -1 ? String(sheet.getRange(targetRow, 1).getValue()) : outId),
        key,
        expansion: rowObj['Content'],
        application: rowObj['Application'],
        description: rowObj['Description'],
        language: rowObj['Language'],
        tags: rowObj['Tags'],
        updatedAt: nowIso,
        mainCategory: rowObj['MainCategory'],
        subcategory: rowObj['Subcategory'],
        fontStyle: rowObj['FontStyle'],
        platform: rowObj['Platform'],
        usageFrequency: rowObj['UsageFrequency']
      }
    };
  } catch (err) {
    console.error('upsertShortcutHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

/**
 * Delete a shortcut by ID (preferred) or by key.
 * @param {{id?:string, key?:string}} payload
 */
function deleteShortcutHandler(payload) {
  try {
    ensureSheets_();
    const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = indexHeader_(header);

    const hasId = idx['ID'] !== undefined;
    const id = String(payload && payload.id ? payload.id : '').trim();
    const key = String(payload && payload.key ? payload.key : '').trim();

    if (!id && !key) return { ok: false, message: 'Provide id or key.' };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { ok: true, deleted: 0 };

    const numRows = lastRow - 1;
    let targetRow = -1;

    if (hasId && id) {
      const ids = sheet.getRange(2, idx['ID'] + 1, numRows, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim() === id) { targetRow = i + 2; break; }
      }
    }

    if (targetRow === -1 && key) {
      const keys = sheet.getRange(2, idx['Snippet Name'] + 1, numRows, 1).getValues();
      for (let i = 0; i < keys.length; i++) {
        if (String(keys[i][0] || '').trim() === key) { targetRow = i + 2; break; }
      }
    }

    if (targetRow === -1) return { ok: true, deleted: 0 };

    sheet.deleteRow(targetRow);
    invalidateShortcutsCache_();
    return { ok: true, deleted: 1 };
  } catch (err) {
    console.error('deleteShortcutHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

// ============================================================================
// FAVORITES (Per-user) ⭐
// ============================================================================

function listMyFavoritesHandler() {
  try {
    return { ok: true, favorites: listMyFavorites_(), userEmail: getUserEmail_() };
  } catch (err) {
    console.error('listMyFavoritesHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

function toggleFavoriteHandler(snippetName) {
  try {
    ensureSheets_();
    const name = String(snippetName || '').trim();
    if (!name) return { ok: false, message: 'Missing snippet name.' };

    const email = getUserEmail_();
    if (!email) return { ok: false, message: 'User email not available. Enable userinfo.email scope.' };

    const sheet = getSheet_(CFG.SHEET_FAVORITES);
    const data = sheet.getDataRange().getValues();
    const header = data[0] || [];
    const idx = indexHeader_(header);

    const emailCol = idx['UserEmail'];
    const nameCol = idx['Snippet Name'];

    let foundRow = -1;
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][emailCol] || '').trim() === email && String(data[r][nameCol] || '').trim() === name) {
        foundRow = r + 1;
        break;
      }
    }

    if (foundRow !== -1) {
      sheet.deleteRow(foundRow);
      return { ok: true, favorited: false, favorites: listMyFavorites_() };
    }

    sheet.appendRow([email, name, new Date().toISOString()]);
    return { ok: true, favorited: true, favorites: listMyFavorites_() };
  } catch (err) {
    console.error('toggleFavoriteHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

function addFavoriteHandler(snippetName) {
  try {
    ensureSheets_();
    const name = String(snippetName || '').trim();
    if (!name) return { ok: false, message: 'Missing snippet name.' };

    const email = getUserEmail_();
    if (!email) return { ok: false, message: 'User email not available. Enable userinfo.email scope.' };

    const sheet = getSheet_(CFG.SHEET_FAVORITES);
    const data = sheet.getDataRange().getValues();
    const header = data[0] || [];
    const idx = indexHeader_(header);

    const emailCol = idx['UserEmail'];
    const nameCol = idx['Snippet Name'];

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][emailCol] || '').trim() === email && String(data[r][nameCol] || '').trim() === name) {
        return { ok: true, favorites: listMyFavorites_() };
      }
    }

    sheet.appendRow([email, name, new Date().toISOString()]);
    return { ok: true, favorites: listMyFavorites_() };
  } catch (err) {
    console.error('addFavoriteHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

function removeFavoriteHandler(snippetName) {
  try {
    ensureSheets_();
    const name = String(snippetName || '').trim();
    if (!name) return { ok: false, message: 'Missing snippet name.' };

    const email = getUserEmail_();
    if (!email) return { ok: false, message: 'User email not available. Enable userinfo.email scope.' };

    const sheet = getSheet_(CFG.SHEET_FAVORITES);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { ok: true, favorites: [] };

    const header = data[0] || [];
    const idx = indexHeader_(header);
    const emailCol = idx['UserEmail'];
    const nameCol = idx['Snippet Name'];

    let deleted = 0;
    for (let r = data.length - 1; r >= 1; r--) {
      if (String(data[r][emailCol] || '').trim() === email && String(data[r][nameCol] || '').trim() === name) {
        sheet.deleteRow(r + 1);
        deleted++;
      }
    }
    return { ok: true, deleted, favorites: listMyFavorites_() };
  } catch (err) {
    console.error('removeFavoriteHandler error:', stringifyError_(err));
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

function listMyFavorites_() {
  const email = getUserEmail_();
  if (!email) return [];

  const sheet = getSheet_(CFG.SHEET_FAVORITES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const header = data[0] || [];
  const idx = indexHeader_(header);
  const emailCol = idx['UserEmail'];
  const nameCol = idx['Snippet Name'];

  const out = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][emailCol] || '').trim() === email) {
      const name = String(data[r][nameCol] || '').trim();
      if (name) out.push(name);
    }
  }
  return out;
}

// ============================================================================
// CACHE (Chunked gzip+b64) - Optional accelerator 🚀
// ============================================================================

function warmShortcutsCache() {
  ensureSheets_();
  const list = getShortcutsFromSheet_();
  const ok = writeShortcutsCache_(list);
  return { ok, cached: list.length };
}

function invalidateShortcutsCache() {
  invalidateShortcutsCache_();
  return { ok: true };
}

function getShortcutsFromSheet_() {
  const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const header = data[0];
  const idx = indexHeader_(header);

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
    mainCategory: idx['MainCategory'],
    subcategory: idx['Subcategory'],
    fontStyle: idx['FontStyle'],
    platform: idx['Platform'],
    usageFrequency: idx['UsageFrequency'],
  };

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][col.key] || '').trim();
    if (!key) continue;

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
      mainCategory: col.mainCategory !== undefined ? String(data[i][col.mainCategory] || '') : '',
      subcategory: col.subcategory !== undefined ? String(data[i][col.subcategory] || '') : '',
      fontStyle: col.fontStyle !== undefined ? String(data[i][col.fontStyle] || '') : '',
      platform: col.platform !== undefined ? String(data[i][col.platform] || '') : '',
      usageFrequency: col.usageFrequency !== undefined ? String(data[i][col.usageFrequency] || '') : '',
    });
  }
  return out;
}

function readShortcutsCache_() {
  const prefix = CFG.CACHE_KEY_PREFIX || 'TEM_SHORTCUTS_';
  return readCacheByKey_(prefix);
}

function writeShortcutsCache_(list) {
  const prefix = CFG.CACHE_KEY_PREFIX || 'TEM_SHORTCUTS_';
  const ttl = CFG.CACHE_TTL_SECONDS || 600;
  return writeCacheByKey_(prefix, list, ttl);
}

function invalidateShortcutsCache_() {
  const prefix = CFG.CACHE_KEY_PREFIX || 'TEM_SHORTCUTS_';
  removeCacheByKey_(prefix);
  bumpCacheVersion_();
  if (CFG.DEBUG_MODE) console.log('✓ Cache invalidated (meta + chunks removed)');
}

function readCacheByKey_(prefix) {
  const metaKey = `${prefix}_META`;
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(metaKey);

  if (!metaRaw) return null;

  const meta = safeJsonParse_(metaRaw);
  if (!meta || !meta.chunkCount || meta.encoding !== 'gz-b64') return null;

  const combined = readChunksByKey_(prefix, meta.chunkCount);
  if (!combined) return null;

  const json = decodeGzB64_(combined);
  const arr = safeJsonParse_(json);
  return Array.isArray(arr) ? arr : null;
}

function writeCacheByKey_(prefix, list, ttl) {
  const json = JSON.stringify(list || []);
  const encoded = encodeGzB64_(json);

  // Keep each cache entry below ~100KB (CacheService limit)
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

    // putAll(values, expirationInSeconds) — expiration must be Integer 1..21600
    const exp = Math.max(1, Math.min(Number(ttl) || 600, 21600));
    cache.putAll(payload, exp);
    return true;
  } catch (err) {
    console.error('Cache write failed:', stringifyError_(err));
    return false;
  }
}

function removeCacheByKey_(prefix) {
  const cache = CacheService.getScriptCache();
  const metaKey = `${prefix}_META`;
  const metaRaw = cache.get(metaKey);

  if (metaRaw) {
    const meta = safeJsonParse_(metaRaw);
    if (meta && meta.chunkCount) {
      const keys = [metaKey];
      for (let i = 1; i <= meta.chunkCount; i++) keys.push(`${prefix}_${i}`);
      cache.removeAll(keys);
      return;
    }
  }

  // Fallback: remove meta only
  cache.remove(metaKey);
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

function encodeGzB64_(s) {
  try {
    const blob = Utilities.newBlob(s, 'text/plain', 'data.txt');
    const gzBlob = Utilities.gzip(blob);
    return Utilities.base64Encode(gzBlob.getBytes());
  } catch (error) {
    console.error('encodeGzB64_ error:', error.message);
    throw new Error('Compression failed: ' + error.message);
  }
}

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

function chunkString_(str, chunkSize) {
  const out = [];
  for (let i = 0; i < str.length; i += chunkSize) out.push(str.substring(i, i + chunkSize));
  return out;
}

function getCacheVersion_() {
  const props = PropertiesService.getScriptProperties();
  const v = props.getProperty(CFG.CACHE_VER_KEY);
  return v ? String(v) : '1';
}

function bumpCacheVersion_() {
  const props = PropertiesService.getScriptProperties();
  const v = Number(props.getProperty(CFG.CACHE_VER_KEY) || '1');
  props.setProperty(CFG.CACHE_VER_KEY, String(v + 1));
}

// ============================================================================
// CLEANUP (Duplicates) 🧹
// ============================================================================

function cleanupDuplicateShortcuts() {
  ensureSheets_();
  const sheet = getSheet_(CFG.SHEET_SHORTCUTS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 2) return { ok: true, removed: 0 };

  const header = data[0];
  const idx = indexHeader_(header);
  const keyCol = idx['Snippet Name'];
  const updatedCol = idx['UpdatedAt'];

  // Keep the newest UpdatedAt per key (fallback: keep last occurrence)
  const bestRowByKey = new Map(); // key -> {rowIndex, updatedAt}
  for (let r = 1; r < data.length; r++) {
    const key = String(data[r][keyCol] || '').trim();
    if (!key) continue;

    const ts = String(data[r][updatedCol] || '').trim();
    const prev = bestRowByKey.get(key);

    if (!prev) {
      bestRowByKey.set(key, { rowIndex: r + 1, updatedAt: ts });
    } else {
      const prevTime = Date.parse(prev.updatedAt) || 0;
      const curTime = Date.parse(ts) || 0;
      if (curTime >= prevTime) bestRowByKey.set(key, { rowIndex: r + 1, updatedAt: ts });
    }
  }

  const keepRows = new Set(Array.from(bestRowByKey.values()).map(v => v.rowIndex));
  let removed = 0;

  for (let r = data.length; r >= 2; r--) {
    if (!keepRows.has(r)) {
      sheet.deleteRow(r);
      removed++;
    }
  }

  invalidateShortcutsCache_();
  return { ok: true, removed };
}

function cleanupDuplicateFavorites() {
  ensureSheets_();
  const sheet = getSheet_(CFG.SHEET_FAVORITES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 2) return { ok: true, removed: 0 };

  const header = data[0];
  const idx = indexHeader_(header);
  const emailCol = idx['UserEmail'];
  const nameCol = idx['Snippet Name'];

  const seen = new Set();
  let removed = 0;

  for (let r = data.length; r >= 2; r--) {
    const email = String(data[r - 1][emailCol] || '').trim();
    const name = String(data[r - 1][nameCol] || '').trim();
    const k = `${email}|||${name}`;
    if (!email || !name) {
      sheet.deleteRow(r);
      removed++;
      continue;
    }
    if (seen.has(k)) {
      sheet.deleteRow(r);
      removed++;
      continue;
    }
    seen.add(k);
  }

  return { ok: true, removed };
}

function cleanupAllDuplicates() {
  const a = cleanupDuplicateShortcuts();
  const b = cleanupDuplicateFavorites();
  return { ok: true, shortcutsRemoved: a.removed, favoritesRemoved: b.removed };
}

// ============================================================================
// VALIDATIONS ✅
// ============================================================================

function validateShortcutPayload_(payload) {
  if (!payload) return { ok: false, message: 'Missing payload.' };

  const key = String(payload.key || '').trim();
  const expansion = String(payload.expansion || '').trim();

  if (!key) return { ok: false, message: 'Snippet Name is required.' };
  if (key.length > CFG.MAX_KEY_LEN) return { ok: false, message: 'Snippet Name too long.' };
  if (!expansion) return { ok: false, message: 'Content is required.' };

  // Optional field bounds (defensive)
  if (String(payload.tags || '').length > CFG.MAX_TAGS_LEN) return { ok: false, message: 'Tags too long.' };
  if (String(payload.language || '').length > CFG.MAX_LANGUAGE_LEN) return { ok: false, message: 'Language too long.' };
  if (String(payload.application || '').length > CFG.MAX_APP_LEN) return { ok: false, message: 'Application too long.' };
  if (String(payload.description || '').length > CFG.MAX_DESC_LEN) return { ok: false, message: 'Description too long.' };

  return { ok: true };
}

// ============================================================================
// SPREADSHEET SETUP + UTILITIES 🧰
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
    if (h) {
      idx[h] = i;
      idx[h.toLowerCase()] = i;
    }
  }
  return idx;
}

function safeJsonParse_(s) {
  try { return JSON.parse(String(s)); } catch (err) { return null; }
}

function stringifyError_(err) {
  try { return err && err.stack ? String(err.stack) : String(err); } catch (e) { return 'Unknown error'; }
}

function getUserEmail_() {
  try { return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''; }
  catch (err) { return ''; }
}

function getWebAppUrl_() {
  return PropertiesService.getScriptProperties().getProperty('WEB_APP_URL')
    || PropertiesService.getScriptProperties().getProperty('WEBAPPURL')
    || '';
}

/**
 * One-time setup: store the deployed web app URL in Script Properties
 */
function storeWebAppUrl() {
  const url = "https://script.google.com/macros/s/AKfycbyR4SKUr9Fvs_3RLV1xWT5xjTTNxLoYPd94cthYADOZ/dev";
  PropertiesService.getScriptProperties().setProperty("WEBAPPURL", url);
  const saved = PropertiesService.getScriptProperties().getProperty("WEBAPPURL");
  Logger.log("✅ Web App URL stored successfully: " + saved);
  return "URL saved: " + saved;
}

function generateShortcutId_() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `SC-${timestamp}-${random}`.toUpperCase();
}

// ============================================================================
// DIAGNOSTIC: Full Pipeline Test 🔍
// ============================================================================

function testFullPipeline() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║ 🔧 FULL PIPELINE DIAGNOSTIC TEST                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const results = { timestamp: new Date().toISOString(), passed: 0, failed: 0, steps: [] };

  function step(name, fn) {
    try {
      const out = fn();
      console.log(`✅ ${name}`);
      results.passed++;
      results.steps.push({ name, status: 'PASS', out });
    } catch (e) {
      console.log(`❌ ${name} -> ${e.message}`);
      results.failed++;
      results.steps.push({ name, status: 'FAIL', error: e.message, stack: e.stack });
    }
  }

  step('Ensure sheets + headers', () => ensureSheets_());
  step('Read shortcuts from sheet', () => getShortcutsFromSheet_().length);
  step('CacheService write/read smoke', () => {
    const cache = CacheService.getScriptCache();
    cache.put('TEMP_TEST', 'OK', 60);
    const v = cache.get('TEMP_TEST');
    cache.remove('TEMP_TEST');
    if (v !== 'OK') throw new Error('Cache read/write failed');
    return true;
  });
  step('Begin snapshot', () => beginShortcutsSnapshot());
  step('Begin snapshot handler (UI)', () => beginShortcutsSnapshotHandler());

  console.log(`📊 Passed: ${results.passed}, Failed: ${results.failed}`);
  return results;
}
