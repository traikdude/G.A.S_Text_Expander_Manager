# Known Issues

## ~~Colab OAuth Authentication Error (2026-01-04)~~ ✅ RESOLVED

**Status:** Fixed in ZEN-20260108-0053

**Original Issue:** When running the Colab notebooks from the custom menu, users encountered an OAuth flow error:
```
no service account found, starting OAuth flow...
```

**Root Cause:**
The `colab_compat.py` module used `'google.colab' in sys.modules` to detect Colab environment.
This check failed if `google.colab` hadn't been imported yet when `ColabCompat()` was instantiated.

**Fix Applied (2026-01-07):**
1. Added `_detect_colab()` method using reliable try/except import detection
2. Changed messaging from confusing "no service account found" to clearer "Starting interactive OAuth authentication"
3. Added helpful tips for service account setup

**Files Modified:**
- `tools/colab_compat.py` - Lines 51-92, 207-214

---

## Active Issues

*No active issues at this time.*

---

## Recently Resolved

| Issue | Date Fixed | Session |
|-------|------------|---------|
| Colab OAuth detection | 2026-01-07 | ZEN-20260108-0053 |
| AutomatedCategoryFilter CFG reference | 2026-01-07 | ZEN-20260108-0053 |
