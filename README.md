# Google Apps Script: Text Expansion Manager 🧙🏾‍♂️✨

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

- **Runtime:** Google Apps Script (V8)
- **Local Dev:** [clasp](https://github.com/google/clasp)
- **Cloud:** Google Cloud Platform (GCP)
- **VCS:** Git & GitHub

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

## 🔐 Security Note
The `creds.json` file and any sensitive local environment files are excluded from git tracking via `.gitignore`. Never commit service account keys or OAuth client secrets to the public repository.

## 🌐 Deployment
The script is configured for the project ID: `gas-tem-2025-erik`. To open the script editor in your browser:
```bash
clasp open
```
