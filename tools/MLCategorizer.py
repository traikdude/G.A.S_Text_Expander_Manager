"""
🧠 Text Expander ML Categorizer
===============================
Machine Learning-powered categorization using scikit-learn! 🤖
Smarter than regex - learns from your existing categorizations! ✨

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ

Run in Google Colab for best results! 🚀
"""

# %% [markdown]
# # 🧠 ML-Powered Categorizer
# Uses machine learning to categorize shortcuts more intelligently! 🤖
# 
# **How it works:**
# 1. 📚 Learns from your existing categorized shortcuts
# 2. 🧪 Trains a text classification model
# 3. 🎯 Predicts categories for uncategorized items
# 4. 📊 Shows confidence scores for each prediction
#
# **Advantages over regex:**
# - ✅ Handles edge cases better
# - ✅ Learns from your manual corrections
# - ✅ Improves with more training data
# - ✅ Understands context, not just patterns

# %% [markdown]
# ## Step 1: Setup & Dependencies 🔐

# %%
# Install ML libraries! 📦
!pip install gspread google-auth pandas numpy scikit-learn matplotlib seaborn -q

print("✅ Packages installed! 📦")

# %%
# Import everything! 🎁
import gspread
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline
import matplotlib.pyplot as plt
import seaborn as sns
from google.colab import auth
from google.auth import default
import warnings
warnings.filterwarnings('ignore')

print("✅ ML libraries imported! 🧠")

# %%
# Authenticate! 🔑
auth.authenticate_user()
creds, _ = default()
gc = gspread.authorize(creds)

print("✅ Authenticated! 🔐")

# %% [markdown]
# ## Step 2: Load Data 📥

# %%
# Configuration! 📋
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"

# Connect and load! 🔗
spreadsheet = gc.open_by_key(SPREADSHEET_ID)
worksheet = spreadsheet.worksheet(SHEET_NAME)
data = worksheet.get_all_records()
df = pd.DataFrame(data)

print(f"✅ Loaded {len(df)} shortcuts! 🎉")

# Check for MainCategory column
if 'MainCategory' not in df.columns:
    print("⚠️ MainCategory column not found!")
    print("   Run TextExpanderCategorizer.py first to create initial categories!")
else:
    print(f"   Categories found: {df['MainCategory'].nunique()}")

# %% [markdown]
# ## Step 3: Prepare Training Data 📊

# %%
def prepare_training_data(df):
    """Prepare data for ML training! 📚"""
    
    print("=" * 60)
    print("📚 PREPARING TRAINING DATA")
    print("=" * 60)
    
    # Combine text features for richer context! 📝
    df['combined_text'] = (
        df['Content'].fillna('').astype(str) + ' ' +
        df['Snippet Name'].fillna('').astype(str) + ' ' +
        df['Description'].fillna('').astype(str) + ' ' +
        df['Tags'].fillna('').astype(str)
    )
    
    # Filter to only categorized rows for training! 🎯
    if 'MainCategory' in df.columns:
        categorized = df[
            (df['MainCategory'].notna()) & 
            (df['MainCategory'] != '') &
            (df['MainCategory'] != 'Uncategorized')
        ].copy()
        
        uncategorized = df[
            (df['MainCategory'].isna()) | 
            (df['MainCategory'] == '') |
            (df['MainCategory'] == 'Uncategorized')
        ].copy()
    else:
        print("❌ No MainCategory column found!")
        return None, None, None
    
    print(f"\n📊 Data Split:")
    print(f"   Categorized (training): {len(categorized)}")
    print(f"   Uncategorized (to predict): {len(uncategorized)}")
    
    # Show category distribution! 📈
    print(f"\n🏷️ Category Distribution:")
    cat_counts = categorized['MainCategory'].value_counts()
    for cat, count in cat_counts.items():
        print(f"   {cat}: {count}")
    
    return df, categorized, uncategorized

df_all, df_train, df_predict = prepare_training_data(df)

# %% [markdown]
# ## Step 4: Train the ML Model 🧠

# %%
def train_categorizer(df_train, min_samples=5):
    """Train a machine learning categorizer! 🧠"""
    
    print("\n" + "=" * 60)
    print("🧠 TRAINING ML MODEL")
    print("=" * 60)
    
    if df_train is None or len(df_train) < 10:
        print("❌ Not enough training data!")
        print("   Need at least 10 categorized shortcuts to train.")
        return None, None, None
    
    # Filter out categories with too few samples! 📊
    cat_counts = df_train['MainCategory'].value_counts()
    valid_cats = cat_counts[cat_counts >= min_samples].index.tolist()
    
    df_filtered = df_train[df_train['MainCategory'].isin(valid_cats)].copy()
    
    print(f"📊 Training on {len(valid_cats)} categories with ≥{min_samples} samples")
    print(f"   Total training samples: {len(df_filtered)}")
    
    # Prepare features and labels! 📝
    X = df_filtered['combined_text'].values
    y = df_filtered['MainCategory'].values
    
    # Split for validation! 🧪
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"\n🧪 Train/Test Split:")
    print(f"   Training samples: {len(X_train)}")
    print(f"   Testing samples: {len(X_test)}")
    
    # Create ML pipeline! 🔧
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),
            min_df=2,
            max_df=0.95
        )),
        ('classifier', MultinomialNB(alpha=0.1))
    ])
    
    # Train! 🚀
    print("\n🏋️ Training model...")
    pipeline.fit(X_train, y_train)
    
    # Evaluate! 📈
    train_score = pipeline.score(X_train, y_train)
    test_score = pipeline.score(X_test, y_test)
    
    print(f"\n📊 Model Performance:")
    print(f"   Training Accuracy: {train_score:.1%}")
    print(f"   Testing Accuracy: {test_score:.1%}")
    
    # Cross-validation! 🔄
    cv_scores = cross_val_score(pipeline, X, y, cv=5)
    print(f"   Cross-Val Accuracy: {cv_scores.mean():.1%} (±{cv_scores.std():.1%})")
    
    # Detailed classification report! 📋
    y_pred = pipeline.predict(X_test)
    print(f"\n📋 Classification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))
    
    return pipeline, valid_cats, (X_test, y_test, y_pred)

model, valid_categories, test_data = train_categorizer(df_train)

# %% [markdown]
# ## Step 5: Visualize Performance 📊

# %%
def plot_confusion_matrix(test_data, valid_categories):
    """Plot confusion matrix! 📊"""
    
    if test_data is None:
        print("⚠️ No test data available!")
        return
    
    X_test, y_test, y_pred = test_data
    
    print("\n" + "=" * 60)
    print("📊 CONFUSION MATRIX")
    print("=" * 60)
    
    # Create confusion matrix! 🎯
    cm = confusion_matrix(y_test, y_pred, labels=valid_categories)
    
    # Plot! 🎨
    fig, ax = plt.subplots(figsize=(12, 10))
    
    sns.heatmap(
        cm, 
        annot=True, 
        fmt='d', 
        cmap='Blues',
        xticklabels=[c[:20] for c in valid_categories],
        yticklabels=[c[:20] for c in valid_categories],
        ax=ax
    )
    
    ax.set_xlabel('Predicted', fontsize=12)
    ax.set_ylabel('Actual', fontsize=12)
    ax.set_title('🎯 Confusion Matrix', fontsize=14, fontweight='bold')
    
    plt.xticks(rotation=45, ha='right')
    plt.yticks(rotation=0)
    plt.tight_layout()
    plt.show()
    
    print("✅ Confusion matrix rendered! 📈")

plot_confusion_matrix(test_data, valid_categories)

# %% [markdown]
# ## Step 6: Predict Uncategorized Items 🎯

# %%
def predict_uncategorized(model, df_predict, df_all):
    """Predict categories for uncategorized items! 🎯"""
    
    print("\n" + "=" * 60)
    print("🎯 PREDICTING UNCATEGORIZED ITEMS")
    print("=" * 60)
    
    if model is None:
        print("❌ No trained model available!")
        return None
    
    if df_predict is None or len(df_predict) == 0:
        print("✅ All items are already categorized! 🎉")
        return None
    
    print(f"📋 Items to predict: {len(df_predict)}")
    
    # Prepare text! 📝
    X_predict = df_predict['combined_text'].values
    
    # Predict categories! 🤖
    predictions = model.predict(X_predict)
    probabilities = model.predict_proba(X_predict)
    
    # Get confidence scores! 📊
    max_probs = probabilities.max(axis=1)
    
    # Create results DataFrame! 📋
    results = df_predict[['Snippet Name', 'Content']].copy()
    results['predicted_category'] = predictions
    results['confidence'] = max_probs
    results['row_index'] = df_predict.index + 2  # +2 for header + 0-index
    
    # Sort by confidence! 📈
    results = results.sort_values('confidence', ascending=False)
    
    print(f"\n📊 Prediction Summary:")
    print(f"   High confidence (>80%): {len(results[results['confidence'] >= 0.8])}")
    print(f"   Medium confidence (50-80%): {len(results[(results['confidence'] >= 0.5) & (results['confidence'] < 0.8)])}")
    print(f"   Low confidence (<50%): {len(results[results['confidence'] < 0.5])}")
    
    # Show top predictions! 🔝
    print(f"\n🔝 Top 15 Predictions (Highest Confidence):")
    print("-" * 70)
    
    for idx, row in results.head(15).iterrows():
        snippet = row['Snippet Name'][:30] if len(row['Snippet Name']) > 30 else row['Snippet Name']
        cat = row['predicted_category'][:25]
        conf = row['confidence']
        print(f"   Row {row['row_index']}: {snippet:30} → {cat:25} ({conf:.1%})")
    
    return results

predictions = predict_uncategorized(model, df_predict, df_all)

# %% [markdown]
# ## Step 7: Review Low-Confidence Predictions ⚠️

# %%
def review_low_confidence(predictions, threshold=0.5):
    """Review predictions that need manual attention! ⚠️"""
    
    if predictions is None:
        return
    
    print("\n" + "=" * 60)
    print("⚠️ LOW CONFIDENCE PREDICTIONS (Need Review)")
    print("=" * 60)
    
    low_conf = predictions[predictions['confidence'] < threshold]
    
    if len(low_conf) == 0:
        print(f"✅ All predictions have ≥{threshold:.0%} confidence! 🎉")
        return
    
    print(f"📋 {len(low_conf)} items need manual review:")
    print("-" * 70)
    
    for idx, row in low_conf.head(20).iterrows():
        snippet = row['Snippet Name'][:25]
        content = str(row['Content'])[:30]
        cat = row['predicted_category'][:20]
        conf = row['confidence']
        
        print(f"   Row {row['row_index']}: '{snippet}...'")
        print(f"      Content: {content}...")
        print(f"      Suggested: {cat} ({conf:.1%} confidence)")
        print()

review_low_confidence(predictions, threshold=0.5)

# %% [markdown]
# ## Step 8: Apply Predictions to Sheet 📝

# %%
def apply_predictions(worksheet, predictions, min_confidence=0.7):
    """Apply high-confidence predictions to the spreadsheet! 📝"""
    
    print("\n" + "=" * 60)
    print("📝 APPLY PREDICTIONS TO SPREADSHEET")
    print("=" * 60)
    
    if predictions is None or len(predictions) == 0:
        print("⚠️ No predictions to apply!")
        return
    
    # Filter by confidence! 🎯
    high_conf = predictions[predictions['confidence'] >= min_confidence]
    
    print(f"📊 Predictions Summary:")
    print(f"   Total predictions: {len(predictions)}")
    print(f"   Above {min_confidence:.0%} confidence: {len(high_conf)}")
    
    if len(high_conf) == 0:
        print(f"⚠️ No predictions meet the {min_confidence:.0%} confidence threshold!")
        return
    
    # Confirmation! ⚠️
    confirm = input(f"\n⚠️ Apply {len(high_conf)} predictions to spreadsheet? Type 'YES' to confirm: ")
    
    if confirm.upper() != 'YES':
        print("❌ Cancelled. No changes made.")
        return
    
    # Get column index for MainCategory! 📋
    headers = worksheet.row_values(1)
    
    if 'MainCategory' not in headers:
        print("❌ MainCategory column not found!")
        return
    
    main_cat_col = headers.index('MainCategory') + 1
    
    # Apply predictions! 🚀
    print(f"\n🚀 Applying {len(high_conf)} predictions...")
    
    updates = []
    for idx, row in high_conf.iterrows():
        cell = gspread.utils.rowcol_to_a1(int(row['row_index']), main_cat_col)
        updates.append({
            'range': cell,
            'values': [[row['predicted_category']]]
        })
    
    # Batch update in chunks! 📦
    batch_size = 100
    for i in range(0, len(updates), batch_size):
        batch = updates[i:i+batch_size]
        worksheet.batch_update(batch)
        print(f"   ✓ Applied rows {i+1} to {min(i+batch_size, len(updates))}")
    
    print(f"\n✅ Successfully applied {len(high_conf)} ML predictions! 🎉")
    print("   Open your spreadsheet to verify the changes.")

# Uncomment to apply:
# apply_predictions(worksheet, predictions, min_confidence=0.7)

print("💡 To apply predictions, uncomment and run the apply_predictions() call above!")

# %% [markdown]
# ## Step 9: Export Results 📤

# %%
def export_predictions(predictions):
    """Export predictions to CSV! 📤"""
    
    if predictions is None:
        return
    
    print("\n" + "=" * 60)
    print("📤 EXPORTING PREDICTIONS")
    print("=" * 60)
    
    # Save to CSV! 💾
    predictions.to_csv('/content/ml_predictions.csv', index=False)
    
    print(f"✅ Saved {len(predictions)} predictions to ml_predictions.csv")
    
    # Download! 📥
    from google.colab import files
    files.download('/content/ml_predictions.csv')
    
    print("📥 Download started!")

export_predictions(predictions)

# %% [markdown]
# ## 🎉 ML Categorization Complete!
# 
# Your ML categorizer has been trained and predictions generated! 🧠
# 
# **What happened:**
# 1. ✅ Trained on your existing categorized shortcuts
# 2. ✅ Evaluated model performance
# 3. ✅ Generated predictions for uncategorized items
# 4. ✅ Exported results for review
# 
# **Next Steps:**
# 1. Review the predictions CSV file 📋
# 2. Verify high-confidence predictions look correct ✅
# 3. Uncomment `apply_predictions()` to write to spreadsheet 📝
# 4. Manually fix low-confidence items ⚠️
# 
# **Tips for better accuracy:**
# - More training data = better predictions! 📈
# - Fix incorrect predictions and re-train! 🔄
# - Categories with few samples may have lower accuracy ⚠️
