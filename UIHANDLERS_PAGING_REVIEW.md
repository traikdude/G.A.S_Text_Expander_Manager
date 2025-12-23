# Paging Logic Review: src/uiHandlers.gs

## 1. Logic Analysis

### **Initial Load: `beginShortcutsSnapshotHandler()`**
- **Function:** Calls `beginShortcutsSnapshot()` (in `Code.gs`) to create a stable, time-locked snapshot of the entire dataset.
- **Caching:** The full dataset is normalized and stored in `CacheService` under a unique `snapshotToken`.
- **Fetching:** Immediately fetches the first batch (Page 0) from this snapshot.
- **Drift Risk:** **NO**. Because the snapshot captures the state at a single moment (`beginShortcutsSnapshot`), subsequent page fetches read from this immutable cache, not the live sheet.

### **Batch Fetching: `fetchShortcutsBatch(snapshotToken, offset, limit)`**
- **Function:** Retrieves a specific slice of data from the *cached snapshot* identified by `snapshotToken`.
- **Validation:** Checks if the snapshot exists. If missing/expired, returns `SNAPSHOT_EXPIRED`.
- **Slicing:** `const slice = allData.slice(start, start + count);`
- **Sheet Access:** **NONE**. It does not read from the sheet. It only reads from `CacheService`.
- **Drift Risk:** **NO**. Since it reads from a static array in memory/cache, row insertions/deletions in the live sheet do not affect the offsets of the cached snapshot.

### **Writes & Updates: `upsertShortcut` / `deleteShortcut` / `bulkImport`**
- **Locking:** All write operations use `LockService.getDocumentLock()` to serialize writes.
- **Cache Invalidation:** All write operations call `invalidateShortcutsCache_()` (which removes global cache) or increment versions.
- **Snapshot Impact:** Writing to the sheet does *not* update existing snapshots. This means a user viewing a snapshot will see "stale" data until they refresh, but they will **not** see broken paging (duplicates/skips). This is the desired behavior for consistent reads.

## 2. Conclusion

**DRIFT-PRONE: NO**

The current implementation uses a **Snapshot Pattern**.
1.  **Read:** A snapshot is created once (`beginShortcutsSnapshot`).
2.  **Stable:** All subsequent pages are fetched from that specific snapshot ID.
3.  **Isolation:** Changes to the sheet (adds/deletes) do not alter the snapshot content. Offsets remain valid for the lifetime of the snapshot (5 minutes).

This is the robust solution recommended to preventing offset drift.

## 3. Evidence

**Snapshot Creation (`Code.gs` reference called by `uiHandlers.gs`):**
```javascript
// Creates stable snapshot
const meta = beginShortcutsSnapshot();
// ...
const batch = fetchSnapshotPage_(meta.snapshotToken, 0, CFG.INITIAL_PAGE_SIZE);
```

**Consistent Fetching (`fetchShortcutsBatch`):**
```javascript
function fetchShortcutsBatch(snapshotToken, offset, limit) {
  // ...
  // Reads from specific token, NOT from live sheet
  const batch = fetchSnapshotPage_(snapshotToken, offset, limit);
  
  if (batch.error === 'SNAPSHOT_EXPIRED') {
    return { ok: false, error: 'SNAPSHOT_EXPIRED', ... };
  }
  // ...
}
```

## 4. What to paste into ChatGPT

**Key Finding:**
The system is **NOT drift-prone**. It correctly implements a **Snapshot Token** pattern. 
- **Mechanism:** `beginShortcutsSnapshot` locks the data state into a unique `CacheService` key.
- **Paging:** `fetchShortcutsBatch` reads slices from this immutable cached array.
- **Result:** Live sheet edits during a refresh cycle do not cause offset shifts or duplicate rows for the client. The client sees a consistent "point-in-time" view.

**Relevant Code:**
```javascript
function fetchShortcutsBatch(snapshotToken, offset, limit) {
  // ...
  // Validates token exists and reads purely from cache
  const batch = fetchSnapshotPage_(snapshotToken, offset, limit);
  // ...
}
```
