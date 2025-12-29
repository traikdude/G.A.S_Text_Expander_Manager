# G.A.S_Text_Expander_Manager 🧙🏾‍♂️✨

This project is a Google Apps Script (GAS) application designed for text expansion and management, developed with a local-first workflow using `clasp` and integrated with GitHub for version control.

## 📁 Project Structure

```text
my-gas-project/
├── src/                # Source code (pushed to Google Apps Script)
│   ├── Code.gs         # Main backend logic
│   ├── uiHandlers.gs   # UI Interaction logic
│   ├── favorites.gs    # Favorite expansion management
│   ├── cleanup.gs      # Maintenance and cleanup tasks
│   ├── Index.html      # Frontend UI (Sidebar/Modal)
│   └── appsscript.json # Script manifest
├── .clasp.json         # Clasp configuration (Root: src)
├── .gitignore          # Git exclusion rules
└── README.md           # Project documentation
```

## 🛠️ Tech Stack

- ![Hybrid](https://img.shields.io/badge/Architecture-Hybrid%20(GAS%20%2B%20Python)-blueviolet)
![Jules](https://img.shields.io/badge/AI-Jules%20CLI-orange)
![Google Apps Script](https://img.shields.io/badge/google%20apps%20script-v8-4285F4?logo=google-cloud&logoColor=white)
- **Local Dev:** [clasp](https://github.com/google/clasp)
- **Cloud:** Google Cloud Platform (GCP)
- **VCS:** Git & GitHub

## 🤖 Jules CLI Integration
This project accepts **Jules CLI** sessions for AI-assisted development.
See [Jules Workflow Docs](docs/JULES_WORKFLOW.md) for setup and usage instructions.

## 🚀 Workflow

### Local Development
To push changes to the Google Apps Script project:
```bash
clasp push
```

### Version Control
To sync changes with GitHub:
```bash
git add .
git commit -m "Your descriptive message"
git push origin master
```

## Authentication & CLI Setup

For complete authentication troubleshooting and `clasp run` configuration, see:
[CLASP Run Authentication Playbook](docs/CLASP_RUN_AUTH_PLAYBOOK.md)

**Quick Start**:
```powershell
clasp login --creds creds.json --use-project-scopes
clasp push
clasp run testCacheAndSnapshotIntegrity
```

## 🔐 Security Note
The `creds.json` file and any sensitive local environment files are excluded from git tracking via `.gitignore`. Never commit service account keys or OAuth client secrets to the public repository.

## 🌐 Deployment
The script is configured for the project ID: `gas-tem-2025-erik`. To open the script editor in your browser:
```bash
clasp open
```
