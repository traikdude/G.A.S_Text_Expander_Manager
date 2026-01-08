/**
 * SnapshotStore.gs ✅
 * ==========================================================
 * Fixes "Failed to create data snapshot" by:
 * 1) Ensuring CFG.SNAPSHOT_TTL_SECONDS exists
 * 2) Adding robust snapshot storage with retries
 * 3) Falling back to Drive storage if CacheService fails
 *
 * Designed for: Text Expansion Manager
 * Author: GAS Master 🤖✨
 * Date: 2026-01-08
 */

// ============================================================================
// CONFIG PATCH (Safe Defaults)
// ============================================================================

/**
 * Ensures snapshot-related CFG fields exist (non-destructive).
 * Call from beginShortcutsSnapshot() before writing snapshots.
 */
function ensureSnapshotConfig_() {
  if (typeof CFG !== 'object' || !CFG) throw new Error('CFG missing or invalid.');

  // Default TTL: 5 minutes (300s) if not set
  if (typeof CFG.SNAPSHOT_TTL_SECONDS !== 'number' || !isFinite(CFG.SNAPSHOT_TTL_SECONDS)) {
    CFG.SNAPSHOT_TTL_SECONDS = 60 * 5;
  }

  // Snapshot Drive fallback folder name
  if (!CFG.SNAPSHOT_DRIVE_FOLDER_NAME) {
    CFG.SNAPSHOT_DRIVE_FOLDER_NAME = '_TEM_Snapshots';
  }

  // Snapshot Drive fallback cleanup cap
  if (typeof CFG.SNAPSHOT_MAX_DRIVE_FILES !== 'number' || !isFinite(CFG.SNAPSHOT_MAX_DRIVE_FILES)) {
    CFG.SNAPSHOT_MAX_DRIVE_FILES = 25;
  }

  // Chunk size tuned for CacheService ~100KB per key safety margin
  if (typeof CFG.SNAPSHOT_CHUNK_SIZE !== 'number' || !isFinite(CFG.SNAPSHOT_CHUNK_SIZE)) {
    CFG.SNAPSHOT_CHUNK_SIZE = 90000;
  }

  // Retry counts
  if (typeof CFG.SNAPSHOT_CACHE_RETRIES !== 'number' || !isFinite(CFG.SNAPSHOT_CACHE_RETRIES)) {
    CFG.SNAPSHOT_CACHE_RETRIES = 2;
  }
}

// ============================================================================
// SNAPSHOT CACHE WRAPPERS (CacheService + Drive Fallback)
// ============================================================================

/**
 * Writes snapshot data using CacheService. Falls back to Drive if needed.
 * @param {string} token
 * @param {Array<Object>} list
 * @return {Object} { ok: true, storage: 'cache'|'drive' }
 */
function writeSnapshot_(token, list) {
  ensureSnapshotConfig_();

  const prefix = `SNAP_${token}`;
  const ttl = CFG.SNAPSHOT_TTL_SECONDS;

  // Try CacheService first (fast) 🚀
  for (let attempt = 0; attempt <= CFG.SNAPSHOT_CACHE_RETRIES; attempt++) {
    try {
      const ok = writeSnapshotCacheByKey_(prefix, list, ttl, CFG.SNAPSHOT_CHUNK_SIZE);
      if (ok) return { ok: true, storage: 'cache' };
    } catch (e) {
      console.warn(`⚠️ Snapshot cache write attempt ${attempt + 1} failed: ${e.message}`);
      Utilities.sleep(150 + Math.floor(Math.random() * 250));
    }
  }

  // Fallback to Drive (reliable) 💾
  const driveOk = writeSnapshotToDrive_(token, list);
  return { ok: driveOk, storage: 'drive' };
}

/**
 * Reads snapshot data from CacheService; if missing, tries Drive fallback.
 * @param {string} token
 * @return {Array<Object>|null}
 */
function readSnapshot_(token) {
  ensureSnapshotConfig_();

  const prefix = `SNAP_${token}`;

  try {
    const fromCache = readSnapshotCacheByKey_(prefix);
    if (Array.isArray(fromCache)) return fromCache;
  } catch (e) {
    console.warn(`⚠️ Snapshot cache read failed: ${e.message}`);
  }

  // Fallback
  try {
    const fromDrive = readSnapshotFromDrive_(token);
    if (Array.isArray(fromDrive)) return fromDrive;
  } catch (e) {
    console.warn(`⚠️ Snapshot drive read failed: ${e.message}`);
  }

  return null;
}

/**
 * Deletes snapshot in CacheService and Drive fallback (best effort).
 * @param {string} token
 */
function deleteSnapshot_(token) {
  ensureSnapshotConfig_();

  const prefix = `SNAP_${token}`;

  // Remove cache keys (meta + chunks) 🧹
  try {
    removeSnapshotCacheByKey_(prefix);
  } catch (e) {
    console.warn(`⚠️ Snapshot cache cleanup failed: ${e.message}`);
  }

  // Remove Drive file if exists 🗑️
  try {
    deleteSnapshotFromDrive_(token);
  } catch (e) {
    console.warn(`⚠️ Snapshot drive cleanup failed: ${e.message}`);
  }
}

// ============================================================================
// SNAPSHOT-SPECIFIC CACHE FUNCTIONS (Named to avoid conflicts with Code.gs)
// ============================================================================

/**
 * Writes to cache using prefix for snapshots.
 * @param {string} prefix
 * @param {Array<Object>} list
 * @param {number} ttlSeconds
 * @param {number} chunkSize
 * @return {boolean}
 */
function writeSnapshotCacheByKey_(prefix, list, ttlSeconds, chunkSize) {
  const json = JSON.stringify(list || []);
  const encoded = encodeGzB64_(json);

  const chunks = chunkString_(encoded, chunkSize || 90000);

  const meta = {
    chunkCount: chunks.length,
    encoding: 'gz-b64',
    updatedAt: new Date().toISOString()
  };

  const cache = CacheService.getScriptCache();
  const payload = {};
  payload[`${prefix}_META`] = JSON.stringify(meta);

  for (let i = 0; i < chunks.length; i++) {
    payload[`${prefix}_${i + 1}`] = chunks[i];
  }

  // expirationInSeconds must be an Integer ✅
  const ttl = Math.max(1, Math.min(21600, parseInt(ttlSeconds, 10) || 600));
  cache.putAll(payload, ttl);

  return true;
}

/**
 * Reads cached snapshot data by prefix.
 * @param {string} prefix
 * @return {Array<Object>|null}
 */
function readSnapshotCacheByKey_(prefix) {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(`${prefix}_META`);
  if (!metaRaw) return null;

  const meta = safeJsonParse_(metaRaw);
  if (!meta || !meta.chunkCount || meta.encoding !== 'gz-b64') return null;

  const keys = [];
  for (let i = 1; i <= meta.chunkCount; i++) keys.push(`${prefix}_${i}`);

  const chunks = cache.getAll(keys);

  let combined = '';
  for (let i = 1; i <= meta.chunkCount; i++) {
    const part = chunks[`${prefix}_${i}`];
    if (!part) return null; // partially evicted
    combined += part;
  }

  const json = decodeGzB64_(combined);
  const arr = safeJsonParse_(json);
  return Array.isArray(arr) ? arr : null;
}

/**
 * Removes prefix META + all chunk keys in one go if possible.
 * @param {string} prefix
 */
function removeSnapshotCacheByKey_(prefix) {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(`${prefix}_META`);

  const keysToRemove = [`${prefix}_META`];

  if (metaRaw) {
    const meta = safeJsonParse_(metaRaw);
    if (meta && meta.chunkCount) {
      for (let i = 1; i <= meta.chunkCount; i++) keysToRemove.push(`${prefix}_${i}`);
    }
  }

  // removeAll is better than many remove() calls 🧹
  cache.removeAll(keysToRemove);
}

// ============================================================================
// DRIVE FALLBACK STORAGE (Reliable Snapshot Persistence)
// ============================================================================

/**
 * Gets/creates snapshot folder.
 * @return {GoogleAppsScript.Drive.Folder}
 */
function getSnapshotFolder_() {
  ensureSnapshotConfig_();

  const name = CFG.SNAPSHOT_DRIVE_FOLDER_NAME;
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();

  return DriveApp.getRootFolder().createFolder(name);
}

/**
 * Writes snapshot to Drive as gz-b64 string.
 * @param {string} token
 * @param {Array<Object>} list
 * @return {boolean}
 */
function writeSnapshotToDrive_(token, list) {
  const folder = getSnapshotFolder_();
  const fileName = `SNAP_${token}.txt`;

  // delete old same-name if any
  const old = folder.getFilesByName(fileName);
  while (old.hasNext()) old.next().setTrashed(true);

  const json = JSON.stringify(list || []);
  const encoded = encodeGzB64_(json);

  folder.createFile(fileName, encoded, MimeType.PLAIN_TEXT);

  cleanupOldSnapshotsInDrive_();
  return true;
}

/**
 * Reads snapshot from Drive.
 * @param {string} token
 * @return {Array<Object>|null}
 */
function readSnapshotFromDrive_(token) {
  const folder = getSnapshotFolder_();
  const fileName = `SNAP_${token}.txt`;

  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) return null;

  const file = files.next();
  const encoded = file.getBlob().getDataAsString();

  const json = decodeGzB64_(encoded);
  const arr = safeJsonParse_(json);
  return Array.isArray(arr) ? arr : null;
}

/**
 * Deletes snapshot file from Drive.
 * @param {string} token
 */
function deleteSnapshotFromDrive_(token) {
  const folder = getSnapshotFolder_();
  const fileName = `SNAP_${token}.txt`;
  const files = folder.getFilesByName(fileName);

  while (files.hasNext()) files.next().setTrashed(true);
}

/**
 * Keeps only last N snapshot files in Drive.
 */
function cleanupOldSnapshotsInDrive_() {
  const folder = getSnapshotFolder_();
  const files = folder.getFiles();
  const arr = [];

  while (files.hasNext()) {
    const f = files.next();
    arr.push({ file: f, created: f.getDateCreated() });
  }

  arr.sort((a, b) => b.created - a.created);

  const maxKeep = CFG.SNAPSHOT_MAX_DRIVE_FILES;
  for (let i = maxKeep; i < arr.length; i++) {
    arr[i].file.setTrashed(true);
  }
}

// ============================================================================
// PATCHED SNAPSHOT API (Use these in handlers)
// ============================================================================

/**
 * Creates snapshot and stores it with cache+drive fallback.
 * This replaces beginShortcutsSnapshot() from Code.gs
 * @return {Object} Snapshot metadata
 */
function beginShortcutsSnapshotWithFallback() {
  ensureSnapshotConfig_();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Server busy. Please try again.');

  try {
    const allShortcuts = getShortcutsFromSheet_();

    const token = Utilities.getUuid();
    const now = new Date().toISOString();

    const storeResult = writeSnapshot_(token, allShortcuts);
    if (!storeResult.ok) throw new Error('Snapshot storage failed.');

    if (CFG.DEBUG_MODE) {
      console.log(`📸 Snapshot created: ${token} | items=${allShortcuts.length} | storage=${storeResult.storage}`);
    }

    return {
      snapshotToken: token,
      total: allShortcuts.length,
      builtAt: now,
      pageSize: CFG.INITIAL_PAGE_SIZE,
      storage: storeResult.storage
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Reads a page from a snapshot token (cache or drive).
 * This can be used as an alternative to fetchSnapshotPage_() from Code.gs
 * @param {string} snapshotToken
 * @param {number} offset
 * @param {number} limit
 * @return {Object}
 */
function fetchSnapshotPageWithFallback_(snapshotToken, offset, limit) {
  const allData = readSnapshot_(snapshotToken);

  if (!allData) {
    if (CFG.DEBUG_MODE) console.warn(`⏳ Snapshot expired/missing: ${snapshotToken}`);
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
// TEST / DIAGNOSTIC
// ============================================================================

/**
 * Test the snapshot store system.
 */
function testSnapshotStore() {
  console.log('=== SnapshotStore Test ===\n');

  console.log('TEST 1: Config patch');
  try {
    ensureSnapshotConfig_();
    console.log('  ✅ CFG.SNAPSHOT_TTL_SECONDS:', CFG.SNAPSHOT_TTL_SECONDS);
    console.log('  ✅ CFG.SNAPSHOT_DRIVE_FOLDER_NAME:', CFG.SNAPSHOT_DRIVE_FOLDER_NAME);
  } catch (e) {
    console.log('  ❌ Error:', e.message);
    return false;
  }

  console.log('\nTEST 2: Write snapshot');
  const testData = [{ id: 'test-1', key: 'hello' }, { id: 'test-2', key: 'world' }];
  const testToken = 'TEST-' + Date.now();
  try {
    const result = writeSnapshot_(testToken, testData);
    console.log('  ✅ Write result:', result);
  } catch (e) {
    console.log('  ❌ Error:', e.message);
    return false;
  }

  console.log('\nTEST 3: Read snapshot');
  try {
    const data = readSnapshot_(testToken);
    console.log('  ✅ Read result:', data ? data.length + ' items' : 'null');
  } catch (e) {
    console.log('  ❌ Error:', e.message);
    return false;
  }

  console.log('\nTEST 4: Delete snapshot');
  try {
    deleteSnapshot_(testToken);
    console.log('  ✅ Deleted');
  } catch (e) {
    console.log('  ❌ Error:', e.message);
  }

  console.log('\n=== Test Complete ✅ ===');
  return true;
}
