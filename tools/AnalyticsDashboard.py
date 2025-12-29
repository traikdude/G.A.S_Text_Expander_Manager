"""
📈 Text Expander Analytics Dashboard
====================================
Beautiful visualizations and insights for your shortcuts! 📊
Interactive charts and statistics! ✨

🌐 Works in BOTH:
   - Google Colab (with Plotly interactive charts)
   - Local Python (python AnalyticsDashboard.py)

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ
"""

# %% [markdown]
# # 📈 Analytics Dashboard
# Beautiful visualizations for your shortcuts database!

# %% [markdown]
# ## Step 1: Setup 🔍

# %%
import sys
import os
import subprocess

IN_COLAB = 'google.colab' in sys.modules
print(f"🔍 Environment: {'🌐 Colab' if IN_COLAB else '💻 Local'}")

# %%
def ensure_packages():
    required = ['gspread', 'pandas', 'plotly', 'matplotlib', 'seaborn']
    for pkg in required:
        try:
            __import__(pkg)
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
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from collections import Counter
import warnings
warnings.filterwarnings('ignore')

try:
    import plotly.express as px
    import plotly.graph_objects as go
    PLOTLY_AVAILABLE = True
except ImportError:
    PLOTLY_AVAILABLE = False

plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("husl")

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
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"
OUTPUT_FOLDER = "/content" if IN_COLAB else str(Path.cwd())

spreadsheet = gc.open_by_key(SPREADSHEET_ID)
worksheet = spreadsheet.worksheet(SHEET_NAME)
data = worksheet.get_all_records()
df = pd.DataFrame(data)

# Add computed columns
df['content_length'] = df['Content'].astype(str).str.len() if 'Content' in df.columns else 0
df['name_length'] = df['Snippet Name'].astype(str).str.len() if 'Snippet Name' in df.columns else 0

print(f"✅ Loaded {len(df)} shortcuts!")

# %% [markdown]
# ## Step 4: Overview Dashboard 📊

# %%
def create_overview():
    """Create overview dashboard! 📊"""
    print("=" * 60)
    print("📊 ANALYTICS DASHBOARD")
    print("=" * 60)
    
    print(f"\n📦 Total Shortcuts: {len(df)}")
    print(f"📋 Total Columns: {len(df.columns)}")
    
    if 'MainCategory' in df.columns:
        cats = df['MainCategory'].nunique()
        print(f"🏷️ Categories: {cats}")
    
    if 'content_length' in df.columns:
        print(f"📏 Avg Content Length: {df['content_length'].mean():.1f} chars")
    
    return df.describe()

overview = create_overview()

# %% [markdown]
# ## Step 5: Category Distribution 🥧

# %%
def plot_category_distribution():
    """Create category distribution chart! 🥧"""
    if 'MainCategory' not in df.columns:
        print("❌ No MainCategory column!")
        return
    
    cat_counts = df['MainCategory'].value_counts()
    
    if PLOTLY_AVAILABLE:
        fig = px.pie(
            values=cat_counts.values,
            names=cat_counts.index,
            title="📊 Category Distribution",
            hole=0.4
        )
        fig.show()
    else:
        plt.figure(figsize=(10, 6))
        plt.pie(cat_counts.values, labels=cat_counts.index, autopct='%1.1f%%')
        plt.title("Category Distribution")
        plt.tight_layout()
        plt.savefig(os.path.join(OUTPUT_FOLDER, "category_distribution.png"))
        plt.show()
        print(f"✅ Saved: category_distribution.png")

plot_category_distribution()

# %% [markdown]
# ## Step 6: Content Length Distribution 📏

# %%
def plot_content_length():
    """Create content length histogram! 📏"""
    if 'content_length' not in df.columns:
        print("❌ No content length data!")
        return
    
    if PLOTLY_AVAILABLE:
        fig = px.histogram(
            df,
            x='content_length',
            nbins=50,
            title="📏 Content Length Distribution",
            labels={'content_length': 'Characters'}
        )
        fig.show()
    else:
        plt.figure(figsize=(10, 6))
        plt.hist(df['content_length'], bins=50, edgecolor='black')
        plt.xlabel('Content Length (chars)')
        plt.ylabel('Count')
        plt.title('Content Length Distribution')
        plt.tight_layout()
        plt.savefig(os.path.join(OUTPUT_FOLDER, "content_length.png"))
        plt.show()
        print(f"✅ Saved: content_length.png")

plot_content_length()

# %% [markdown]
# ## Step 7: Category Sunburst 🌞

# %%
def plot_category_sunburst():
    """Create hierarchical sunburst chart! 🌞"""
    if not PLOTLY_AVAILABLE:
        print("⚠️ Plotly required for sunburst chart!")
        return
    
    if 'MainCategory' not in df.columns:
        print("❌ No MainCategory column!")
        return
    
    # Prepare data
    if 'Subcategory' in df.columns:
        sunburst_data = df.groupby(['MainCategory', 'Subcategory']).size().reset_index(name='count')
        fig = px.sunburst(
            sunburst_data,
            path=['MainCategory', 'Subcategory'],
            values='count',
            title="🌞 Category Hierarchy"
        )
    else:
        cat_counts = df['MainCategory'].value_counts().reset_index()
        cat_counts.columns = ['MainCategory', 'count']
        fig = px.sunburst(
            cat_counts,
            path=['MainCategory'],
            values='count',
            title="🌞 Category Distribution"
        )
    
    fig.show()

plot_category_sunburst()

# %% [markdown]
# ## Step 8: Length by Category 📦

# %%
def plot_length_by_category():
    """Create box plot of length by category! 📦"""
    if 'MainCategory' not in df.columns or 'content_length' not in df.columns:
        print("❌ Missing required columns!")
        return
    
    if PLOTLY_AVAILABLE:
        fig = px.box(
            df,
            x='MainCategory',
            y='content_length',
            title="📦 Content Length by Category"
        )
        fig.update_xaxes(tickangle=45)
        fig.show()
    else:
        plt.figure(figsize=(12, 6))
        df.boxplot(column='content_length', by='MainCategory', rot=45)
        plt.title('Content Length by Category')
        plt.tight_layout()
        plt.savefig(os.path.join(OUTPUT_FOLDER, "length_by_category.png"))
        plt.show()

plot_length_by_category()

# %% [markdown]
# ## Step 9: Summary Stats 🎯

# %%
def print_summary():
    """Print final summary! 🎯"""
    print("\n" + "=" * 60)
    print("🎯 SUMMARY STATISTICS")
    print("=" * 60)
    
    print(f"\n📦 Total Shortcuts: {len(df)}")
    
    if 'content_length' in df.columns:
        print(f"\n📏 Content Length Stats:")
        print(f"   Shortest: {df['content_length'].min()} chars")
        print(f"   Longest: {df['content_length'].max()} chars")
        print(f"   Average: {df['content_length'].mean():.1f} chars")
    
    if 'MainCategory' in df.columns:
        print(f"\n🏷️ Top Categories:")
        for cat, count in df['MainCategory'].value_counts().head(5).items():
            print(f"   {cat}: {count}")

print_summary()

# %% [markdown]
# ## 🎯 Quick Menu

# %%
def show_menu():
    print("""
╔═══════════════════════════════════════════════════════╗
║         📈 ANALYTICS DASHBOARD                        ║
╠═══════════════════════════════════════════════════════╣
║  create_overview()            - Show overview stats   ║
║  plot_category_distribution() - Category pie chart   ║
║  plot_content_length()        - Length histogram     ║
║  plot_category_sunburst()     - Hierarchical view    ║
║  plot_length_by_category()    - Box plots            ║
║  print_summary()              - Summary stats        ║
╚═══════════════════════════════════════════════════════╝
    """)

show_menu()

# %%
if __name__ == "__main__":
    print("\n🎉 Analytics Dashboard ready!")
