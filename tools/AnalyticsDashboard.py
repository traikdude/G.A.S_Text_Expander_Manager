"""
📈 Text Expander Analytics Dashboard
====================================
Beautiful visualizations and insights for your shortcuts! 📊
Interactive charts and statistics! ✨

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ

Run in Google Colab for best results! 🚀
"""

# %% [markdown]
# # 📈 Text Expander Analytics Dashboard
# Beautiful visualizations and insights for your 2,159+ shortcuts! ✨
# 
# **Features:**
# - 📊 Category distribution charts
# - 🌍 Language breakdown
# - 📏 Content length analysis
# - 🏷️ Tag cloud visualization
# - 📅 Update timeline
# - 🎨 Interactive Plotly charts

# %% [markdown]
# ## Step 1: Setup & Dependencies 🔐

# %%
# Install visualization libraries! 📦
!pip install gspread google-auth pandas numpy matplotlib seaborn plotly wordcloud -q

print("✅ Packages installed! 📦")

# %%
# Import everything! 🎁
import gspread
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from wordcloud import WordCloud
from google.colab import auth
from google.auth import default
from collections import Counter
import warnings
warnings.filterwarnings('ignore')

# Beautiful default style! 🎨
plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("husl")

print("✅ Libraries imported! Let's visualize! 🚀")

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

print(f"✅ Loaded {len(df)} shortcuts from '{spreadsheet.title}'! 🎉")

# Add computed columns! 📊
df['content_length'] = df['Content'].astype(str).str.len()
df['name_length'] = df['Snippet Name'].astype(str).str.len()

# %% [markdown]
# ## Step 3: 📊 Overview Dashboard

# %%
def create_overview_dashboard(df):
    """Create the main overview dashboard! 📊"""
    
    print("=" * 60)
    print("📊 ANALYTICS DASHBOARD OVERVIEW")
    print("=" * 60)
    
    # Key metrics! 🎯
    metrics = {
        '📋 Total Shortcuts': len(df),
        '📏 Avg Content Length': f"{df['content_length'].mean():.1f} chars",
        '🌍 Languages': df['Language'].nunique() if 'Language' in df.columns else 'N/A',
        '🏷️ Categories': df['MainCategory'].nunique() if 'MainCategory' in df.columns else 'N/A',
    }
    
    print("\n🎯 KEY METRICS:")
    for key, value in metrics.items():
        print(f"   {key}: {value}")
    
    return metrics

overview = create_overview_dashboard(df)

# %% [markdown]
# ## Step 4: 🥧 Category Distribution (Interactive)

# %%
def plot_category_distribution(df):
    """Interactive category pie chart with Plotly! 🥧"""
    
    print("\n" + "=" * 60)
    print("🏷️ CATEGORY DISTRIBUTION")
    print("=" * 60)
    
    if 'MainCategory' not in df.columns:
        print("⚠️ MainCategory column not found!")
        print("   Run TextExpanderCategorizer first! 🐍")
        return
    
    # Clean categories! 🧹
    df['cat_clean'] = df['MainCategory'].fillna('Uncategorized').replace('', 'Uncategorized')
    cat_counts = df['cat_clean'].value_counts()
    
    # Create interactive pie chart! 🥧
    fig = px.pie(
        values=cat_counts.values,
        names=cat_counts.index,
        title='🏷️ Shortcuts by Category',
        hole=0.4,  # Donut chart! 🍩
        color_discrete_sequence=px.colors.qualitative.Set3
    )
    
    fig.update_traces(
        textposition='inside',
        textinfo='percent+label',
        hovertemplate='<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>'
    )
    
    fig.update_layout(
        font=dict(size=12),
        legend=dict(orientation="h", yanchor="bottom", y=-0.3),
        height=500
    )
    
    fig.show()
    print("✅ Interactive chart rendered! 🎨")

plot_category_distribution(df)

# %% [markdown]
# ## Step 5: 🌍 Language Distribution (Bar Chart)

# %%
def plot_language_distribution(df):
    """Interactive language bar chart! 🌍"""
    
    print("\n" + "=" * 60)
    print("🌍 LANGUAGE DISTRIBUTION")
    print("=" * 60)
    
    if 'Language' not in df.columns:
        print("⚠️ Language column not found!")
        return
    
    # Clean and count! 📊
    df['lang_clean'] = df['Language'].fillna('(not set)').replace('', '(not set)')
    lang_counts = df['lang_clean'].value_counts().head(10)
    
    # Create bar chart! 📊
    fig = px.bar(
        x=lang_counts.index,
        y=lang_counts.values,
        title='🌍 Top Languages',
        labels={'x': 'Language', 'y': 'Number of Shortcuts'},
        color=lang_counts.values,
        color_continuous_scale='Viridis'
    )
    
    fig.update_layout(
        xaxis_tickangle=-45,
        showlegend=False,
        height=400
    )
    
    fig.show()
    print("✅ Language chart rendered! 🌐")

plot_language_distribution(df)

# %% [markdown]
# ## Step 6: 📏 Content Length Distribution

# %%
def plot_content_length(df):
    """Content length histogram with stats! 📏"""
    
    print("\n" + "=" * 60)
    print("📏 CONTENT LENGTH ANALYSIS")
    print("=" * 60)
    
    # Stats! 📊
    print(f"\n📊 Statistics:")
    print(f"   Min: {df['content_length'].min()} chars")
    print(f"   Max: {df['content_length'].max()} chars")
    print(f"   Mean: {df['content_length'].mean():.1f} chars")
    print(f"   Median: {df['content_length'].median():.1f} chars")
    
    # Filter outliers for better visualization
    plot_data = df[df['content_length'] < 500]
    
    fig = px.histogram(
        plot_data,
        x='content_length',
        nbins=50,
        title='📏 Content Length Distribution',
        labels={'content_length': 'Content Length (characters)', 'count': 'Number of Shortcuts'},
        color_discrete_sequence=['#667eea']
    )
    
    # Add mean line! 📈
    fig.add_vline(
        x=df['content_length'].mean(),
        line_dash="dash",
        line_color="red",
        annotation_text=f"Mean: {df['content_length'].mean():.1f}",
        annotation_position="top"
    )
    
    fig.update_layout(height=400)
    fig.show()
    print("✅ Histogram rendered! 📊")

plot_content_length(df)

# %% [markdown]
# ## Step 7: ☁️ Tag Word Cloud

# %%
def create_tag_wordcloud(df):
    """Generate a word cloud from tags! ☁️"""
    
    print("\n" + "=" * 60)
    print("☁️ TAG WORD CLOUD")
    print("=" * 60)
    
    if 'Tags' not in df.columns:
        print("⚠️ Tags column not found!")
        return
    
    # Combine all tags! 🏷️
    all_tags = ' '.join(df['Tags'].fillna('').astype(str).tolist())
    
    if not all_tags.strip():
        print("⚠️ No tags found in the data!")
        return
    
    # Generate word cloud! ☁️
    wordcloud = WordCloud(
        width=800,
        height=400,
        background_color='white',
        colormap='viridis',
        max_words=100,
        min_font_size=10,
        max_font_size=80
    ).generate(all_tags)
    
    # Display! 🎨
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.imshow(wordcloud, interpolation='bilinear')
    ax.axis('off')
    ax.set_title('☁️ Tag Word Cloud', fontsize=16, fontweight='bold', pad=20)
    
    plt.tight_layout()
    plt.show()
    print("✅ Word cloud generated! ✨")

create_tag_wordcloud(df)

# %% [markdown]
# ## Step 8: 📊 Subcategory Breakdown (Sunburst)

# %%
def plot_category_sunburst(df):
    """Interactive sunburst chart of categories! 🌞"""
    
    print("\n" + "=" * 60)
    print("🌞 CATEGORY SUNBURST CHART")
    print("=" * 60)
    
    if 'MainCategory' not in df.columns or 'Subcategory' not in df.columns:
        print("⚠️ Category columns not found!")
        print("   Run TextExpanderCategorizer first! 🐍")
        return
    
    # Clean data! 🧹
    df_clean = df.copy()
    df_clean['MainCategory'] = df_clean['MainCategory'].fillna('Uncategorized').replace('', 'Uncategorized')
    df_clean['Subcategory'] = df_clean['Subcategory'].fillna('Other').replace('', 'Other')
    
    # Create sunburst! 🌞
    fig = px.sunburst(
        df_clean,
        path=['MainCategory', 'Subcategory'],
        title='🌞 Category & Subcategory Breakdown',
        color_discrete_sequence=px.colors.qualitative.Pastel
    )
    
    fig.update_layout(height=600)
    fig.show()
    print("✅ Sunburst chart rendered! 🌞")

plot_category_sunburst(df)

# %% [markdown]
# ## Step 9: 📈 Content Length by Category

# %%
def plot_length_by_category(df):
    """Box plot of content length by category! 📦"""
    
    print("\n" + "=" * 60)
    print("📦 CONTENT LENGTH BY CATEGORY")
    print("=" * 60)
    
    if 'MainCategory' not in df.columns:
        print("⚠️ MainCategory column not found!")
        return
    
    # Clean and filter! 🧹
    df_clean = df.copy()
    df_clean['MainCategory'] = df_clean['MainCategory'].fillna('Uncategorized').replace('', 'Uncategorized')
    df_clean = df_clean[df_clean['content_length'] < 500]  # Filter outliers
    
    fig = px.box(
        df_clean,
        x='MainCategory',
        y='content_length',
        title='📦 Content Length by Category',
        labels={'content_length': 'Content Length', 'MainCategory': 'Category'},
        color='MainCategory',
        color_discrete_sequence=px.colors.qualitative.Set3
    )
    
    fig.update_layout(
        xaxis_tickangle=-45,
        showlegend=False,
        height=500
    )
    
    fig.show()
    print("✅ Box plot rendered! 📊")

plot_length_by_category(df)

# %% [markdown]
# ## Step 10: 🎯 Quick Stats Summary

# %%
def print_final_summary(df):
    """Print final summary stats! 🎯"""
    
    print("\n" + "=" * 60)
    print("🎯 ANALYTICS SUMMARY")
    print("=" * 60)
    
    print(f"""
📊 YOUR TEXT EXPANDER COLLECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Total Shortcuts: {len(df):,}
📏 Avg Content Length: {df['content_length'].mean():.1f} characters
📏 Max Content Length: {df['content_length'].max():,} characters

🌍 Languages: {df['Language'].nunique() if 'Language' in df.columns else 'N/A'}
🏷️ Categories: {df['MainCategory'].nunique() if 'MainCategory' in df.columns else 'Not set'}
📁 Subcategories: {df['Subcategory'].nunique() if 'Subcategory' in df.columns else 'Not set'}

📊 Content Length Breakdown:
   • Very Short (<10 chars): {len(df[df['content_length'] < 10]):,}
   • Short (10-50 chars): {len(df[(df['content_length'] >= 10) & (df['content_length'] < 50)]):,}
   • Medium (50-200 chars): {len(df[(df['content_length'] >= 50) & (df['content_length'] < 200)]):,}
   • Long (200+ chars): {len(df[df['content_length'] >= 200]):,}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Dashboard Complete! 🎉
    """)

print_final_summary(df)

# %% [markdown]
# ## 🎉 Dashboard Complete!
# 
# Your analytics dashboard is ready! All charts are interactive! 📊
# 
# **Features Used:**
# - 🥧 Plotly pie/donut charts
# - 📊 Interactive bar charts
# - 📏 Histograms with stats
# - ☁️ Word cloud visualization
# - 🌞 Sunburst hierarchical chart
# - 📦 Box plots by category
# 
# **Next Steps:**
# - Run other notebooks for more analysis! 🐍
# - Share these visualizations with your team! 🌐
