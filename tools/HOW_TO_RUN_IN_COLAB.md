# 🐍 Google Colab Execution Guide for Text Expander Manager

This guide explains how to run your Python analysis tools (`tools/` directory) in **Google Colab**. 
Since these tools are designed to work both locally and in the cloud, we just need to set up the environment once!

## 1. Preparation 📂

1.  **Upload to Google Drive**:
    *   Take the entire `tools` folder from your project.
    *   Upload it to your Google Drive root directory.
    *   **Rename** the folder to: `TextExpanderTools` (to match the code snippets below).
    *   *Path check*: You should have `/content/drive/MyDrive/TextExpanderTools/MLCategorizer.py` etc.

2.  **Create a New Notebook**:
    *   Go to [colab.research.google.com](https://colab.research.google.com).
    *   Click **New Notebook**.

## 2. Step-by-Step Execution 🚀

Copy and paste the following code blocks into your Colab notebook cells. Run them in order!

### Cell 1: Setup & Connect to Drive 🔌
This cell mounts your Google Drive, installs necessary libraries, and sets up the path so Python can find your scripts.

```python
# 1. Mount Google Drive
from google.colab import drive
drive.mount('/content/drive')

# 2. Add the tools folder to Python path
import sys
import os

# CONFIG: Change this if you named your folder something else!
TOOLS_PATH = '/content/drive/MyDrive/TextExpanderTools'

if TOOLS_PATH not in sys.path:
    sys.path.append(TOOLS_PATH)

# 3. Install Requirements
print("📦 Installing dependencies...")
!pip install -r {TOOLS_PATH}/requirements.txt -q
print("✅ Output: Environment Ready!")

# 4. Initialize Compatibility Layer
try:
    from colab_compat import setup_environment
    compat, gc = setup_environment(backup_folder="TextExpanderBackups")
    print("✅ Compatibility Layer Loaded Successfully")
except ImportError:
    print("❌ Error: Could not find 'colab_compat.py'. Check your TOOLS_PATH variable!")
```

---

### Cell 2: Run ML Categorizer 🧠
Categorizes your shortcuts using Machine Learning.

```python
from MLCategorizer import TextExpanderCategorizer

# Run the categorizer
print("🚀 Starting ML Categorizer...")
categorizer = TextExpanderCategorizer()
# Note: The script usually expects 'input.csv' or pulls from Sheets if configured
# For this project, it often connects directly to the Sheet via 'colab_compat'
categorizer.run() 
```

---

### Cell 3: Run Data Quality Analyzer 🛡️
Checks for missing tags, broken formats, and inconsistencies.

```python
from DataQualityAnalyzer import DataQualityAnalyzer

print("🔍 Starting Data Quality Analysis...")
analyzer = DataQualityAnalyzer()
analyzer.run()
```

---

### Cell 4: Duplicate Finder 👯
Finds duplicate shortcuts or expansions.

```python
from DuplicateFinder import DuplicateFinder

print("👀 Looking for Duplicates...")
finder = DuplicateFinder()
finder.run()
```

---

### Cell 5: Generate Analytics Dashboard 📊
Creates charts and stats about your usage.

```python
from AnalyticsDashboard import AnalyticsDashboard

print("📊 Generating Dashboard...")
dashboard = AnalyticsDashboard()
dashboard.run()
```

---

## 3. Important Tips 💡

*   **Authentication**: The first time you run `setup_environment()`, Colab will ask you to click a link and authorize access to your Google Drive and Sheets. This is normal!
*   **File Paths**: All reports and backups will be saved to your Google Drive in the `TextExpanderBackups` folder (created automatically).
*   **Timeouts**: If a script takes too long, Colab might disconnect. These scripts are optimized, but keep the tab open.

## 4. FAQ: Automation & Interaction 🤖❓

### Q: Can my Google Sheet automatically trigger these scripts?
**A:** Not directly on the free version of Google Colab.
*   **Why?** Colab requires an active browser tab to run. It shuts down when you close the tab.
*   **Solution**: You must manually open the notebook and click "Run" when you want to update your categories or reports.

### Q: How often should I run these?
**A:** It depends on your usage!
*   **ML Categorizer / Duplicate Finder**: Run once a week, or after you've added a large batch of new shortcuts.
*   **Data Quality / Analytics**: Run monthly to check the health of your database.
*   **Backups**: Are handled automatically by these scripts whenever they run!

### Q: Do I have to interact with the Python code?
**A:** Only to start it!
*   Once you click "Run" on a cell, the script handles the rest (reading from Sheets, processing, writing back).
*   You don't need to write or edit code unless you want to change settings.

