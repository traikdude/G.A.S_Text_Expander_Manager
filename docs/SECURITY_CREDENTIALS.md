# 🔐 Security: Credential Rotation Guide

## Current Status

✅ **Credentials NOT tracked** — The `.gitignore` patterns are correctly preventing credential files from being committed:
- `credentials.json` ✅ Ignored
- `creds.json` ✅ Ignored  
- `gas-tem-*.json` ✅ Ignored
- `*service-account*.json` ✅ Ignored

## ⚠️ Recommended: Rotate Service Account Key

If the service account key (`gas-tem-2025-erik-5b34441370c3.json`) was ever committed to git history, it should be rotated.

### Steps to Rotate:

1. **Go to Google Cloud Console**
   ```
   https://console.cloud.google.com/iam-admin/serviceaccounts
   ```

2. **Find your project** (gas-tem-2025-erik)

3. **Click on the service account email**

4. **Go to "Keys" tab**

5. **Delete the old key** (the one ending in `5b34441370c3`)

6. **Create a new key**
   - Click "Add Key" → "Create new key"
   - Choose JSON format
   - Download and save as `credentials.json` in the project root

7. **Update any deployed services** that use the old key

## Environment Variables (Recommended for Production)

Instead of file-based credentials, consider using environment variables:

```bash
# Set this in your shell profile or CI/CD secrets
export SERVICE_ACCOUNT_FILE="/path/to/credentials.json"
```

The `colab_compat.py` module already checks for this environment variable first.

## Verification

After rotation, test authentication:

```bash
cd tools
python -c "from colab_compat import ColabCompat; c = ColabCompat(); c.print_environment(); c.get_gspread_client()"
```

---

*Document created: 2026-01-08 00:02 EST*
*Session: ZEN-20260108-0053*
