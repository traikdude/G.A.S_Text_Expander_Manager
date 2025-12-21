# CLASP Run Authentication Playbook

## Problem Statement

Running `clasp run <functionName>` fails with:
```
Unable to run script function. Please make sure you have permission to run the script function.
```

## Root Causes (Identified December 2025)

1. **Apps Script project not linked to GCP project** containing OAuth client
2. **Incorrect OAuth scopes** during clasp login (missing spreadsheet/runtime scopes)
3. **Account mismatch** between clasp auth and script ownership

---

## Working Configuration

### Prerequisites

| Item | Value |
|------|-------|
| GCP Project | `gas-tem-2025-erik` |
| GCP Project Number | `469196913648` |
| OAuth Client ID | `469196913648-...apps.googleusercontent.com` (in `creds.json`) |
| Google Account | `traikdude@gmail.com` (must have Owner/Editor role on script) |
| clasp version | 3.1.3 or higher |
| Script ID | `1QczhSkVs0QeKzdp4kRTcl9MbxdpCX8ElK2MK1G6XSEC9OC6J4H-FxGSV` |

### Required Scopes

When using `--use-project-scopes`, clasp will request:
- `https://www.googleapis.com/auth/spreadsheets.currentonly`
- `https://www.googleapis.com/auth/script.container.ui`
- `https://www.googleapis.com/auth/script.external_request`
- `https://www.googleapis.com/auth/userinfo.email`

---

## One-Time Setup

### Step 1: Link Apps Script Project to GCP Project

**This is REQUIRED - must be done in browser, not CLI**

1. Open: https://script.google.com/home/projects/1QczhSkVs0QeKzdp4kRTcl9MbxdpCX8ElK2MK1G6XSEC9OC6J4H-FxGSV/edit
2. Click **Project Settings** (gear icon, left sidebar)
3. Scroll to **"Google Cloud Platform (GCP) Project"** section
4. Click **"Change project"**
5. Enter GCP Project Number: `469196913648`
6. Click **"Set project"**
7. Confirm the change if prompted

**Verification**: Reload the page - GCP project number should now be displayed under Project Settings.

### Step 2: Authenticate clasp with Project Scopes

```powershell
cd C:\Users\Erik\apps-script\G.A.S_Text_Expander_Manager

# Logout if previously authenticated
clasp logout

# Login with project-specific scopes (CRITICAL)
clasp login --creds creds.json --use-project-scopes
```

This will open a browser OAuth flow - make sure to:
1. Sign in as `traikdude@gmail.com` (or the account that owns the script)
2. Click "Advanced" > "Go to [project name] (unsafe)" if needed
3. Check ALL permission boxes
4. Click "Allow"

**Verification**: Run `clasp show-authorized-user` - should show `traikdude@gmail.com`

---

## Daily Workflow Commands

### Push Code Changes
```powershell
cd C:\Users\Erik\apps-script\G.A.S_Text_Expander_Manager
clasp push
```

### Pull Latest Code
```powershell
clasp pull

# If .js files appear alongside .gs files, run:
powershell -ExecutionPolicy Bypass -File tools\cleanupPulledJs.ps1
```

### Run Test Function
```powershell
clasp run testCacheAndSnapshotIntegrity

# Expected output:
# { success: true, message: 'Cache and snapshot integrity verified' }
```

### Deploy New Version
```powershell
clasp version "Description of changes"
clasp deploy -V <version_number> -d "Deployment description"
```

### View Execution Logs
```powershell
clasp logs --simplified
```

---

## Troubleshooting Guide

### Error: "Unable to run script function"

**Symptom**: `clasp run` fails immediately with permission error

**Diagnostic Steps**:
1. Verify GCP project linkage (Step 1 above)
2. Check authenticated account:
   ```powershell
   clasp show-authorized-user
   ```
   Should match the account that owns the script
3. Verify scriptId matches:
   ```powershell
   type .clasp.json  # Should show scriptId: 1Qczh...
   ```
4. Confirm Apps Script API enabled:
   ```powershell
   gcloud services list --enabled | findstr script
   # Should include: script.googleapis.com
   ```

**Solution**: Re-authenticate with project scopes:
```powershell
clasp logout
clasp login --creds creds.json --use-project-scopes
```

---

### Error: "A file with this name already exists"

**Symptom**: `clasp push` fails with duplicate file error

**Cause**: `clasp pull` created `.js` files while `.gs` source files exist

**Solution**:
```powershell
# Method 1: Manual cleanup
Remove-Item src\*.js -Force

# Method 2: Use cleanup script
powershell -ExecutionPolicy Bypass -File tools\cleanupPulledJs.ps1

# Then retry push
clasp push
```

**Prevention**: Ensure `.clasp.json` includes `"fileExtension": "gs"`

---

### Error: "Script function not found"

**Symptom**: `clasp run` says function doesn't exist (but it does in Code.gs)

**Cause**: Using `--nondev` flag with outdated deployment version

**Solution**:
```powershell
# Option A: Run against @HEAD (development)
clasp run testCacheAndSnapshotIntegrity  # (no --nondev flag)

# Option B: Deploy latest version first
clasp version "Latest changes"
clasp deploy -V <new_version> -d "Updated deployment"
clasp run testCacheAndSnapshotIntegrity --nondev
```

---

### Error: "You do not have permission to call SpreadsheetApp"

**Symptom**: Function runs but fails during execution with permission error

**Cause**: Logged in WITHOUT `--use-project-scopes`

**Solution**: Re-authenticate:
```powershell
clasp logout
clasp login --creds creds.json --use-project-scopes  # REQUIRED
```

---

## clasp login Variants Explained

| Command | Use Case | Scopes Included |
|---------|----------|-----------------|
| `clasp login` | Basic clasp operations | Deployments, project management |
| `clasp login --creds creds.json` | Use custom OAuth client | Same as above |
| `clasp login --use-project-scopes` | **Required for `clasp run`** | Runtime scopes from `appsscript.json` |
| `clasp login --creds creds.json --use-project-scopes` | **Our working config** | Custom OAuth + runtime scopes |

**Rule of Thumb**: Always use `--use-project-scopes` when running functions that access Google services.

---

## Security Notes

- `creds.json` contains OAuth client credentials - **never commit to public repos**
- `.clasprc.json` (created after login) contains access tokens - **add to .gitignore**
- Tokens stored at: `C:\Users\Erik\.clasprc.json`
- Rotate OAuth client secrets periodically in GCP Console

---

## Maintenance Checklist

**Monthly**:
- [ ] Verify GCP project linkage still active
- [ ] Check clasp version: `clasp --version` (update if <3.1.0)
- [ ] Run test suite: `clasp run testCacheAndSnapshotIntegrity`

**After Team Changes**:
- [ ] Verify new team members added as Editors in Apps Script project
- [ ] Share GCP project access if they need `clasp run` capability
- [ ] Ensure they follow Step 1 (GCP linking) + Step 2 (auth) above

---

## Emergency Fallback

If clasp authentication completely breaks:

### Manual Execution in Apps Script Editor
1. Open: https://script.google.com/home/projects/1QczhSkVs0QeKzdp4kRTcl9MbxdpCX8ElK2MK1G6XSEC9OC6J4H-FxGSV/edit
2. Select function dropdown > `testCacheAndSnapshotIntegrity`
3. Click Run button
4. View Execution log (Ctrl+Enter)

### Regenerate OAuth Client
1. Go to: https://console.cloud.google.com/apis/credentials?project=gas-tem-2025-erik
2. Create new OAuth 2.0 Client ID (Desktop app)
3. Download as `creds.json`
4. Retry authentication steps

---

## References

- clasp GitHub: https://github.com/google/clasp
- Apps Script Execution API: https://developers.google.com/apps-script/api/how-tos/execute
- GCP Project Console: https://console.cloud.google.com/home/dashboard?project=gas-tem-2025-erik

---

**Last Updated**: December 21, 2025
**Verified Working**: clasp v3.1.3, Node v24.12.0, Windows 11
