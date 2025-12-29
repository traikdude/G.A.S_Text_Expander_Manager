# 🐍 Python Tools for Text Expander Manager

A comprehensive suite of Python analysis tools for your Text Expander shortcuts!

## ✨ Features

All tools work **both locally AND in Google Colab** - no code changes needed!

| Tool | Purpose | Open in Colab |
|------|---------|---------------|
| 💾 **BackupSystem.py** | Automated backups with versioning | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/tools/BackupSystem.py) |
| 🎯 **TextExpanderCategorizer.py** | Pattern-based categorization | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/tools/TextExpanderCategorizer.py) |
| 🧠 **MLCategorizer.py** | ML-powered classification | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/tools/MLCategorizer.py) |
| 📊 **DataQualityAnalyzer.py** | Data health & quality scoring | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/tools/DataQualityAnalyzer.py) |
| 🔍 **DuplicateFinder.py** | Find duplicates & similar content | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/tools/DuplicateFinder.py) |
| 📈 **AnalyticsDashboard.py** | Interactive visualizations | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/tools/AnalyticsDashboard.py) |

---

## 🚀 Quick Start

### Option 1: Run in Google Colab (Recommended)

1. Click any **"Open in Colab"** badge above
2. The notebook will open in your browser
3. Run cells sequentially (Shift+Enter)
4. Authenticate when prompted

### Option 2: Run Locally

```bash
# Navigate to tools directory
cd G.A.S_Text_Expander_Manager/tools

# Run any tool
python BackupSystem.py
python TextExpanderCategorizer.py
python DataQualityAnalyzer.py
```

---

## 🔐 Authentication

### In Google Colab
- Authentication is automatic via Google's built-in auth
- You'll be prompted to sign in on first run

### Running Locally
You need a Google Cloud service account:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable **Sheets API** + **Drive API**
3. Create a **Service Account** and download the JSON key
4. Save as `credentials.json` in the `tools/` folder
5. Share your spreadsheet with the service account email

**Alternative**: Run `python -c "import gspread; gspread.oauth()"` for OAuth flow.

---

## 📋 Tool Details

### 💾 BackupSystem.py
**Never lose your data!**
- Automated backups to Google Drive (Colab) or local folder
- Timestamp-based versioning with 30-backup rotation
- MD5 checksum integrity verification
- One-click restore from any backup point
- Change detection since last backup

### 🎯 TextExpanderCategorizer.py
**Auto-categorize your shortcuts!**
- Pattern detection for emojis, dates, symbols, kaomoji
- 10 main categories with 75+ subcategories
- Confidence scoring for each prediction
- Export results to CSV for review

### 🧠 MLCategorizer.py
**Smarter than regex!**
- TF-IDF vectorization + Naive Bayes classifier
- Learns from your existing categorizations
- Cross-validation for model accuracy
- Handles uncategorized items automatically

### 📊 DataQualityAnalyzer.py
**Health check for your data!**
- Missing field detection
- Content length analysis
- Quality score (0-100%) with dimensions
- Actionable recommendations

### 🔍 DuplicateFinder.py
**Clean up your collection!**
- Exact duplicate detection
- Fuzzy matching (85%+ similarity)
- Duplicate name conflict detection
- Cleanup recommendations

### 📈 AnalyticsDashboard.py
**Beautiful visualizations!**
- Interactive Plotly charts
- Category distribution pie/donut
- Content length histograms
- Sunburst hierarchical views

---

## 🏗️ Architecture

```
tools/
├── colab_compat.py          # Shared compatibility module
├── BackupSystem.py          # 💾 Data backup & restore
├── TextExpanderCategorizer.py  # 🎯 Pattern categorization
├── MLCategorizer.py         # 🧠 ML classification
├── DataQualityAnalyzer.py   # 📊 Quality analysis
├── DuplicateFinder.py       # 🔍 Duplicate detection
├── AnalyticsDashboard.py    # 📈 Visualizations
└── credentials.json         # (Your service account key - not committed)
```

---

## 📝 Configuration

All tools connect to the same spreadsheet:

```python
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"
```

---

## 🔄 Workflow Recommendation

1. **Start with BackupSystem.py** - Create a backup first! 💾
2. **Run DataQualityAnalyzer.py** - Check data health 📊
3. **Run DuplicateFinder.py** - Clean up duplicates 🔍
4. **Run TextExpanderCategorizer.py** - Auto-categorize 🎯
5. **Run MLCategorizer.py** - Improve categorization 🧠
6. **Run AnalyticsDashboard.py** - Visualize results 📈
7. **Create another backup** - Save your work! 💾

---

## 📦 Dependencies

All dependencies are auto-installed when running the tools:

- `gspread` - Google Sheets API
- `pandas` - Data manipulation
- `matplotlib` / `seaborn` - Static visualizations
- `plotly` - Interactive charts
- `scikit-learn` - Machine learning
- `rapidfuzz` - Fuzzy string matching
- `regex` - Extended regex support

---

## 🤝 Contributing

These tools are part of the [G.A.S_Text_Expander_Manager](https://github.com/traikdude/G.A.S_Text_Expander_Manager) project.

---

## 📄 License

MIT License - See main repository for details.
