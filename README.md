# 📝 G.A.S Text Expander Manager 🧙🏾‍♂️✨

**A powerful Google Apps Script application for text expansion and shortcut management, featuring ML-powered categorization via Python integration.**

[![Deploy to Apps Script](https://github.com/traikdude/G.A.S_Text_Expander_Manager/actions/workflows/clasp-deploy.yml/badge.svg)](https://github.com/traikdude/G.A.S_Text_Expander_Manager/actions/workflows/clasp-deploy.yml)
[![Google Apps Script](https://img.shields.io/badge/Built%20with-Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google-drive)](https://developers.google.com/apps-script)
[![Python](https://img.shields.io/badge/Python-NLP%20Integration-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://colab.research.google.com/)
[![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)]()

---

## 🎯 Project Overview

The **Text Expander Manager** is a full-featured text expansion system built on Google Apps Script. It stores shortcuts in Google Sheets, provides a beautiful web UI for management, and integrates with Python/Colab for ML-powered categorization.

### ✨ Key Features

- ⚡ **10,000+ Shortcuts Support** with chunked caching
- 🎨 **Beautiful Web UI** with sidebar, dialog, and standalone modes
- ⭐ **Favorites System** per-user personalization
- 🏷️ **Category Dropdowns** for organization
- 🤖 **Python NLP Bridge** for ML categorization via Google Drive
- 🚀 **GitHub Actions CI/CD** auto-deploys on push

---

## 📁 Project Structure

```text
G.A.S_Text_Expander_Manager/
├── src/                      # Apps Script source (deployed via clasp)
│   ├── Code.gs               # Main backend logic (2600+ lines)
│   ├── uiHandlers.gs         # UI event handlers
│   ├── favorites.gs          # Per-user favorites
│   ├── ColabBridge.gs        # Python/Drive integration
│   ├── cleanup.gs            # Maintenance utilities
│   └── Index.html            # Web UI frontend
├── tools/                    # Python utilities
│   ├── DriveCategorizerBridge.py    # NLP categorization
│   ├── DataQualityAnalyzer.py       # Data quality reports
│   ├── MLCategorizer.py             # ML training
│   └── colab_compat.py              # Colab compatibility layer
├── .github/workflows/        # CI/CD
│   └── clasp-deploy.yml      # Auto-deploy on push
├── docs/                     # Documentation
└── README.md
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Google Apps Script (V8) |
| **Frontend** | HTML/CSS/JavaScript |
| **Data** | Google Sheets |
| **Python Tools** | scikit-learn, pandas, gspread |
| **CI/CD** | GitHub Actions + clasp |
| **AI Assistant** | Jules CLI, Gemini CLI |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- [clasp](https://github.com/google/clasp) installed globally
- Google account with Apps Script access

### Local Development

```bash
# Clone the repository
git clone https://github.com/traikdude/G.A.S_Text_Expander_Manager.git
cd G.A.S_Text_Expander_Manager

# Push to Apps Script
clasp push

# Open in browser
clasp open
```

### CI/CD (Automatic)

Every push to `master` automatically deploys via GitHub Actions:
```bash
git add .
git commit -m "feat: your changes"
git push origin master
# ✅ Auto-deploys to Apps Script!
```

---

## 🤖 Python NLP Bridge

Offload heavy categorization to Google Colab:

1. In Google Sheet: **🤖 Python Bridge** → **🚀 Trigger Categorization**
2. Open Colab and run `tools/DriveCategorizerBridge.py`
3. Back in Sheet: **📥 Import Results**

See [Pipeline Setup Guide](docs/PIPELINE_SETUP.md) for full instructions.

---

## 🤖 Jules CLI Integration

This project accepts **Jules CLI** sessions for AI-assisted development.
See [Jules Workflow Docs](docs/JULES_WORKFLOW.md) for setup and usage.

---

## 🔐 Security

The following files are excluded via `.gitignore`:
- `creds.json` / `credentials.json` - OAuth credentials
- `.clasprc.json` - Clasp authentication tokens
- `__pycache__/` - Python cache

**Never commit secrets to the repository.**

---

## 📚 Documentation

- [Pipeline Setup Guide](docs/PIPELINE_SETUP.md) - CI/CD and Python bridge
- [Jules Workflow](docs/JULES_WORKFLOW.md) - AI-assisted development
- [CLASP Run Auth Playbook](docs/CLASP_RUN_AUTH_PLAYBOOK.md) - Authentication troubleshooting

---

*Built with ❤️ using Gemini CLI & Professor Synapse 🧙🏾‍♂️*
