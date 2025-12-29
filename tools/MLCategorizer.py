"""
🧠 Text Expander ML Categorizer
===============================
Machine Learning-powered categorization using scikit-learn! 🤖
Smarter than regex - learns from your existing categorizations! ✨

🌐 Works in BOTH:
   - Google Colab (recommended for ML)
   - Local Python (python MLCategorizer.py)

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ
"""

# Configuration Constants
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"

# ML Hyperparameters
TFIDF_MAX_FEATURES = 1000
TFIDF_NGRAM_RANGE = (1, 2)
TEST_SIZE = 0.2
RANDOM_STATE = 42
CV_FOLDS = 5
MIN_TRAINING_SAMPLES = 5

# %% [markdown]
# # 🧠 ML Categorizer
# Train a machine learning model on your categorized shortcuts!

# %% [markdown]
# ## Step 1: Setup 🔍

# %%
import sys
import os
import subprocess
import io

# Fix Windows console encoding
if sys.platform.startswith('win'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

IN_COLAB = 'google.colab' in sys.modules
print(f"🔍 Environment: {'🌐 Colab' if IN_COLAB else '💻 Local'}")

# %%
def ensure_packages():
    required = ['gspread', 'pandas', 'scikit-learn', 'matplotlib', 'seaborn']
    for pkg in required:
        pkg_import = pkg.replace('-', '_') if pkg == 'scikit-learn' else pkg
        if pkg == 'scikit-learn':
            pkg_import = 'sklearn'
        try:
            __import__(pkg_import)
        except ImportError:
            print(f"📦 Installing {pkg}...")
            if IN_COLAB:
                from IPython import get_ipython
                get_ipython().system(f'pip install {pkg} -q')
            else:
                subprocess.run([sys.executable, '-m', 'pip', 'install', pkg, '-q'], capture_output=True)
    print("✅ Packages ready!")

ensure_packages()

# %%
import gspread
import pandas as pd
import numpy as np
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline
import matplotlib.pyplot as plt
import seaborn as sns

print("✅ Libraries imported!")

# %% [markdown]
# ## Step 2: Authentication 🔐

# %%
if IN_COLAB:
    from google.colab import auth
    from google.auth import default
    auth.authenticate_user()
    creds, _ = default()
    gc = gspread.authorize(creds)
else:
    creds_file = Path("credentials.json")
    gspread_creds = Path.home() / ".config" / "gspread" / "credentials.json"
    
    if creds_file.exists():
        from google.oauth2.service_account import Credentials
        scopes = ['https://www.googleapis.com/auth/spreadsheets']
        creds = Credentials.from_service_account_file(str(creds_file), scopes=scopes)
        gc = gspread.authorize(creds)
    elif gspread_creds.exists():
        from google.oauth2.service_account import Credentials
        scopes = ['https://www.googleapis.com/auth/spreadsheets']
        creds = Credentials.from_service_account_file(str(gspread_creds), scopes=scopes)
        gc = gspread.authorize(creds)
    else:
        gc = gspread.oauth()

print("✅ Authenticated!")

# %% [markdown]
# ## Step 3: Load Data 📥

# %%
OUTPUT_FOLDER = "/content" if IN_COLAB else str(Path.cwd())

# Initialize dataframe
df = None
worksheet = None

try:
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(SHEET_NAME)
    data = worksheet.get_all_records()
    df = pd.DataFrame(data)
    print(f"✅ Loaded {len(df)} shortcuts!")
    
    # Check for existing categories
    if 'MainCategory' in df.columns:
        categorized = df['MainCategory'].notna() & (df['MainCategory'] != '')
        print(f"📊 Categorized: {categorized.sum()} / {len(df)}")
    else:
        print("⚠️ No MainCategory column - run TextExpanderCategorizer.py first!")
except Exception as e:
    print(f"❌ Error loading spreadsheet: {e}")
    print("💡 Make sure you've shared the spreadsheet with your service account!")

# %% [markdown]
# ## Step 4: Prepare Training Data 📚

# %%
def prepare_training_data(min_samples=MIN_TRAINING_SAMPLES):
    """Prepare data for ML training! 📚"""
    print("\n" + "=" * 60)
    print("📚 PREPARING TRAINING DATA")
    print("=" * 60)
    
    if df is None:
        print("❌ No data loaded! Check spreadsheet connection.")
        return None, None, None
    
    if 'MainCategory' not in df.columns:
        print("❌ No MainCategory column!")
        return None, None, None
    
    # Combine text features
    df['combined_text'] = df.apply(
        lambda row: f"{row.get('Content', '')} {row.get('Description', '')} {row.get('Snippet Name', '')}",
        axis=1
    )
    
    # Filter to categorized rows
    df_cat = df[df['MainCategory'].notna() & (df['MainCategory'] != '')].copy()
    
    print(f"📊 Categorized rows: {len(df_cat)}")
    
    # Filter categories with enough samples
    cat_counts = df_cat['MainCategory'].value_counts()
    valid_cats = cat_counts[cat_counts >= min_samples].index.tolist()
    
    df_train = df_cat[df_cat['MainCategory'].isin(valid_cats)]
    df_predict = df[~df.index.isin(df_train.index) | (df['MainCategory'] == '')]
    
    print(f"✅ Training samples: {len(df_train)}")
    print(f"🎯 To predict: {len(df_predict)}")
    print(f"📋 Valid categories: {len(valid_cats)}")
    
    return df, df_train, df_predict

df_all, df_train, df_predict = prepare_training_data()

# %% [markdown]
# ## Step 5: Train ML Model 🧠

# %%
model = None
valid_categories = None

def train_model():
    """Train the ML categorizer! 🧠"""
    global model, valid_categories
    
    print("\n" + "=" * 60)
    print("🧠 TRAINING ML MODEL")
    print("=" * 60)
    
    if df_train is None or len(df_train) < 10:
        print("❌ Not enough training data!")
        return None
    
    X = df_train['combined_text'].astype(str)
    y = df_train['MainCategory']
    
    valid_categories = y.unique().tolist()
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print(f"📊 Training set: {len(X_train)}")
    print(f"📊 Test set: {len(X_test)}")
    
    # Create pipeline with configurable hyperparameters
    model = Pipeline([
        ('tfidf', TfidfVectorizer(max_features=TFIDF_MAX_FEATURES, ngram_range=TFIDF_NGRAM_RANGE)),
        ('clf', MultinomialNB())
    ])
    
    # Train
    print("\n⏳ Training...")
    model.fit(X_train, y_train)
    
    # Evaluate
    train_acc = model.score(X_train, y_train)
    test_acc = model.score(X_test, y_test)
    
    print(f"\n📈 Training Accuracy: {train_acc:.1%}")
    print(f"📈 Test Accuracy: {test_acc:.1%}")
    
    # Cross-validation
    cv_scores = cross_val_score(model, X, y, cv=CV_FOLDS)
    print(f"📊 Cross-val Score: {cv_scores.mean():.1%} (+/- {cv_scores.std()*2:.1%})")
    
    return model

model = train_model()

# %% [markdown]
# ## Step 6: Predict Uncategorized 🎯

# %%
predictions_df = None

def predict_uncategorized():
    """Predict categories for uncategorized items! 🎯"""
    global predictions_df
    
    print("\n" + "=" * 60)
    print("🎯 PREDICTING CATEGORIES")
    print("=" * 60)
    
    if model is None:
        print("❌ Train model first!")
        return None
    
    if df_predict is None or len(df_predict) == 0:
        print("✅ All items already categorized!")
        return None
    
    X_pred = df_predict['combined_text'].astype(str)
    
    # Predict with probabilities
    predictions = model.predict(X_pred)
    probabilities = model.predict_proba(X_pred).max(axis=1)
    
    predictions_df = df_predict.copy()
    predictions_df['predicted_category'] = predictions
    predictions_df['confidence'] = probabilities
    
    # Summary
    high_conf = (probabilities >= 0.7).sum()
    low_conf = (probabilities < 0.5).sum()
    
    print(f"\n📊 Predictions made: {len(predictions_df)}")
    print(f"✅ High confidence (≥70%): {high_conf}")
    print(f"⚠️ Low confidence (<50%): {low_conf}")
    
    print("\n📋 Sample Predictions:")
    print("-" * 60)
    for _, row in predictions_df.head(5).iterrows():
        snippet_name = str(row.get('Snippet Name', '') or '')[:30]
        print(f"  '{snippet_name}' → {row['predicted_category']} ({row['confidence']:.0%})")
    
    return predictions_df

predictions_df = predict_uncategorized()

# %% [markdown]
# ## Step 7: Review Low Confidence ⚠️

# %%
def review_low_confidence(threshold=0.5):
    """Review low confidence predictions! ⚠️"""
    if predictions_df is None:
        print("❌ No predictions yet!")
        return
    
    low_conf = predictions_df[predictions_df['confidence'] < threshold]
    
    print(f"\n⚠️ {len(low_conf)} items need manual review:")
    print("-" * 60)
    
    for _, row in low_conf.head(10).iterrows():
        snippet_name = str(row.get('Snippet Name', '') or '')[:25]
        print(f"  '{snippet_name}' → {row['predicted_category']} ({row['confidence']:.0%})")

review_low_confidence()

# %% [markdown]
# ## Step 8: Export Predictions 📤

# %%
def export_predictions():
    """Export predictions to CSV! 📤"""
    if predictions_df is None:
        print("❌ No predictions to export!")
        return
    
    output_file = os.path.join(OUTPUT_FOLDER, "ml_predictions.csv")
    
    export_cols = ['Snippet Name', 'Content', 'predicted_category', 'confidence']
    available_cols = [c for c in export_cols if c in predictions_df.columns]
    
    predictions_df[available_cols].to_csv(output_file, index=False)
    print(f"✅ Exported to: {output_file}")
    
    if IN_COLAB:
        from google.colab import files
        files.download(output_file)

export_predictions()

# %% [markdown]
# ## 🎯 Quick Menu

# %%
def show_menu():
    print("""
╔═══════════════════════════════════════════════════════╗
║         🧠 ML CATEGORIZER                             ║
╠═══════════════════════════════════════════════════════╣
║  prepare_training_data()      - Prepare data          ║
║  train_model()                - Train ML model        ║
║  predict_uncategorized()      - Make predictions      ║
║  review_low_confidence(0.5)   - Review uncertain      ║
║  export_predictions()         - Export to CSV         ║
╚═══════════════════════════════════════════════════════╝
    """)

show_menu()

# %%
if __name__ == "__main__":
    print("\n🎉 ML Categorizer ready!")
