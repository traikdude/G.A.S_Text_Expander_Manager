# 🚀 Automated Pipeline Setup Guide

Complete setup instructions for GitHub CI/CD and Python NLP Bridge.

---

## Component 1: GitHub Actions CI/CD

### Step 1: Get Your Clasp Credentials

```powershell
# In PowerShell/Terminal, display your clasp credentials
cat ~/.clasprc.json
```

Copy the **entire JSON content** (starts with `{` and ends with `}`).

### Step 2: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each:

| Secret Name | Value |
|-------------|-------|
| `CLASPRC_JSON` | Paste entire content from ~/.clasprc.json |
| `SCRIPT_ID` | `1QczhSkVs0QeKzdp4kRTcl9MbxdpCX8ElK2MK1G6XSEC9OC6J4H-FxGSV` |

### Step 3: Test the Workflow

1. Make any small change to a file
2. Commit and push to `main` or `master`
3. Go to GitHub → **Actions** tab
4. Watch the "🚀 Clasp Auto-Deploy" workflow run

---

## Component 2: Python NLP Bridge

### How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Google Sheet   │ ──► │  Google Drive    │ ──► │  Google Colab   │
│  (Data Source)  │     │  (Message Bus)   │     │  (Python NLP)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        ▲                       │                        │
        │                       │                        │
        └───────────────────────┴────────────────────────┘
                     Results flow back
```

### Step 1: Initial Setup (One Time)

1. Open Google Sheet linked to your project
2. Refresh the page to load menus
3. Click **🤖 Python Bridge** → **🔧 Setup/View Folder**
4. A `TextExpanderBridge` folder will be created in your Drive

### Step 2: Trigger Categorization

1. In Google Sheet: **🤖 Python Bridge** → **🚀 Trigger Categorization**
2. This queues all uncategorized items to Drive

### Step 3: Run Python in Colab

1. Open [Google Colab](https://colab.research.google.com/)
2. Create a new notebook or use these cells:

```python
# Cell 1: Mount Drive
from google.colab import drive
drive.mount('/content/drive')
```

```python
# Cell 2: Navigate and run
%cd /content/drive/MyDrive/TextExpanderBridge

# If DriveCategorizerBridge.py is in the folder:
!python DriveCategorizerBridge.py

# Or upload from your repo and run:
# (Upload tools/DriveCategorizerBridge.py to Drive folder first)
```

### Step 4: Import Results

1. Return to Google Sheet
2. Click **🤖 Python Bridge** → **📥 Import Results**
3. Categories will be applied with color-coded confidence:
   - 🟢 Green: High confidence (≥60%)
   - 🟠 Orange: Medium confidence (30-60%)
   - 🔴 Red: Low confidence (<30%) - review manually!

---

## Troubleshooting

### GitHub Actions Failed

- Check Actions tab for error logs
- Verify `CLASPRC_JSON` secret is valid JSON
- Ensure `.clasp.json` exists in repo root

### Python Bridge: No Pending Tasks

- Run "🚀 Trigger Categorization" from Sheet first
- Check that `pending_tasks.json` exists in Drive folder

### Python Bridge: Drive Not Mounted

In Colab, run:
```python
from google.colab import drive
drive.mount('/content/drive')
```

### Low Confidence Results

Categories with <30% confidence appear in red. Options:
1. Add more descriptive text to your shortcuts
2. Make category names more specific
3. Manually review and correct, ML learns from examples

---

## File Locations

| File | Purpose |
|------|---------|
| `.github/workflows/clasp-deploy.yml` | GitHub Actions workflow |
| `src/ColabBridge.gs` | Apps Script ↔ Drive bridge |
| `tools/DriveCategorizerBridge.py` | Python categorization engine |
| Drive: `TextExpanderBridge/pending_tasks.json` | Queued items |
| Drive: `TextExpanderBridge/results_latest.json` | ML results |
