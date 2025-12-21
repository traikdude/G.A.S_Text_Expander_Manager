# Next Steps: 2025-12-20

## 🚨 P0: Critical Verification
- [ ] **Verify Progressive Loading**
    - **Goal:** Ensure "Refresh" loads all items (e.g., 2709) without stopping.
    - **Verify:** Open Web App -> Click Refresh -> Watch status text count up (1000... 2000... 2709).
- [ ] **Verify Imports**
    - **Goal:** Ensure bulk import still works with the new deduplication logic.
    - **Verify:** Paste a small JSON/CSV -> Import -> Check if rows appear.

## 🔸 P1: Important Improvements
- [ ] **Optimize Batch Size**
    - **Goal:** Find the sweet spot between network calls and payload size.
    - **Action:** Try `INITIAL_PAGE_SIZE = 500` vs `2000` in `src/Code.gs`.
- [ ] **Cache Invalidation Check**
    - **Goal:** Ensure `upsertShortcut` invalidates the cache so `fetchShortcutsBatch` doesn't return stale data.
    - **Verify:** Edit a shortcut -> Refresh -> Ensure edit appears.

## 🔹 P2: Nice-to-Have / Maintenance
- [ ] **Virtual Scrolling**
    - **Context:** If list grows > 5000, DOM nodes will slow down the browser.
    - **Action:** Replace `startChunkedRender` with a windowing library (or custom logic) to render only visible rows.
- [ ] **Cleanup Script**
    - **File:** `src/cleanup.gs`
    - **Action:** Review duplicate detection logic to match the new `normalizeDataset` approach used in `Index.html`.

## 🔎 Investigation: "Refresh Partial Load"
*Status: Resolved via Paging (Commit 1809846)*
If this reoccurs:
1.  **Check Console:** Look for `[FetchBatch] Received X items` logs.
2.  **Check Server Limits:** Ensure `CacheService` isn't returning `null` mid-stream.
3.  **Counters:** Compare `state.totalExpected` (server count) vs `state.shortcuts.length` (client count).

## 🚀 Deployment Checklist
1.  **Push Code:** `clasp push`
2.  **Version:** `clasp version "Stable Paging"`
3.  **Deploy:** `clasp deploy -i <deploymentId> -d "Stable Paging Update"`
