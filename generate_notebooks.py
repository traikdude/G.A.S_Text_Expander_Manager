import os
import json

# Configuration
REPO_USER = "traikdude"
REPO_NAME = "G.A.S_Text_Expander_Manager"
BRANCH = "master"
TOOLS_DIR = "tools"
OUTPUT_DIR = "notebooks"

# List of tools to convert
SCRIPTS = [
    "AnalyticsDashboard.py",
    "BackupSystem.py",
    "DataQualityAnalyzer.py",
    "DriveCategorizerBridge.py",
    "DuplicateFinder.py",
    "FontAwareCategorizer.py",
    "MLCategorizer.py",
    "TextExpanderCategorizer.py"
]

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

def create_notebook_content(script_name):
    """Generates the JSON structure for a Colab notebook."""
    
    # 1. Setup Cell: Mount Drive & Clone Repo
    setup_code = [
        "# 🚀 MOUNT GOOGLE DRIVE\n",
        "from google.colab import drive\n",
        "drive.mount('/content/drive')\n",
        "\n",
        "# 📥 CLONE REPOSITORY\n",
        f"!git clone https://github.com/{REPO_USER}/{REPO_NAME}.git\n",
        f"%cd {REPO_NAME}/{TOOLS_DIR}\n",
        "\n",
        "# 📦 INSTALL DEPENDENCIES\n",
        "!pip install -r requirements.txt"
    ]

    # 2. Execution Cell: Run the specific script
    run_code = [
        f"# 🏃‍♂️ RUN {script_name.upper()}\n",
        f"!python {script_name}"
    ]

    # Notebook JSON Structure
    notebook = {
        "nbformat": 4,
        "nbformat_minor": 0,
        "metadata": {
            "colab": {
                "name": script_name.replace(".py", ""),
                "provenance": []
            },
            "kernelspec": {
                "name": "python3",
                "display_name": "Python 3"
            },
            "accelerator": "GPU"
        },
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    f"# 🧙🏾‍♂️ {script_name} - Colab Edition\n",
                    "Run this notebook to execute the script directly from your Google Drive/Sheet integration."
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": setup_code
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": run_code
            }
        ]
    }
    return notebook

print(f"STARTING NOTEBOOK GENERATION...")
generated_urls = []

for script in SCRIPTS:
    notebook_name = script.replace(".py", ".ipynb")
    file_path = os.path.join(OUTPUT_DIR, notebook_name)
    
    content = create_notebook_content(script)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(content, f, indent=2)
        
    print(f"Generated: {file_path}")
    
    # Generate the GitHub->Colab URL
    colab_url = f"https://colab.research.google.com/github/{REPO_USER}/{REPO_NAME}/blob/{BRANCH}/{OUTPUT_DIR}/{notebook_name}"
    generated_urls.append((script, colab_url))

print("\n" + "="*60)
print("FINAL COLAB URLs (COPY THESE FOR YOUR GOOGLE SHEET)")
print("="*60)
for script, url in generated_urls:
    print(f"{script:<30} | {url}")
print("="*60)
