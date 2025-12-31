#!/usr/bin/env python3
"""
🌉 DriveCategorizerBridge.py
============================
NLP-based text categorization bridge for Text Expander Manager
Communicates with Apps Script via Google Drive message queue

🌐 Works in BOTH:
   - Google Colab (recommended - run cells interactively)
   - Local Python (python DriveCategorizerBridge.py)

Workflow:
1. Apps Script writes pending_tasks.json to Drive
2. This script reads, categorizes, writes results_latest.json
3. Apps Script imports results back to sheet

Created: 2025-12-30
Updated: 2025-12-31 - Integrated with colab_compat.py, fixed bare except
Part of: G.A.S_Text_Expander_Manager
"""

import os
import sys
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path

# Import shared compatibility module (handles both direct and package imports)
try:
    from colab_compat import ColabCompat, safe_print
except ImportError:
    from tools.colab_compat import ColabCompat, safe_print

# ============================================================================
# CONFIGURATION
# ============================================================================

# Default paths for Google Drive integration
DRIVE_FOLDER_NAME = "TextExpanderBridge"

# ML Configuration
CONFIDENCE_THRESHOLD = 0.15  # Minimum confidence to assign category
TFIDF_MAX_FEATURES = 500
TFIDF_NGRAM_RANGE = (1, 2)
HIGH_CONFIDENCE_THRESHOLD = 0.6  # For statistics tracking
LOW_CONFIDENCE_THRESHOLD = 0.3   # For statistics tracking

# ============================================================================
# ENVIRONMENT DETECTION (Using shared colab_compat module)
# ============================================================================

def detect_environment() -> Dict[str, Any]:
    """
    Detect runtime environment using shared ColabCompat module.
    
    Returns:
        Dict with environment info and file paths
    """
    compat = ColabCompat(backup_folder_name=DRIVE_FOLDER_NAME)
    
    env = {
        "is_colab": compat.in_colab,
        "drive_mounted": False,
        "bridge_folder": None,
        "input_file": None,
        "output_file": None,
        "compat": compat  # Store for later use
    }
    
    # Print environment info
    if compat.in_colab:
        safe_print("🌐 Running in Google Colab")
        drive_base = Path("/content/drive/MyDrive")
        env["drive_mounted"] = drive_base.exists()
        if not env["drive_mounted"]:
            safe_print("⚠️ Google Drive not mounted. Run: drive.mount('/content/drive')")
    else:
        safe_print("💻 Running in Local Python")
        # Try common local Drive paths
        possible_paths = [
            Path.home() / "Google Drive" / "My Drive",
            Path.home() / "Google Drive",
            Path(".")  # Fallback to current directory
        ]
        drive_base = Path(".")
        for path in possible_paths:
            if path.exists():
                drive_base = path
                env["drive_mounted"] = True
                break
        
        if not env["drive_mounted"]:
            safe_print("⚠️ Google Drive not found locally. Using current directory.")
    
    # Set bridge folder paths
    bridge_path = drive_base / DRIVE_FOLDER_NAME
    env["bridge_folder"] = str(bridge_path)
    env["input_file"] = str(bridge_path / "pending_tasks.json")
    env["output_file"] = str(bridge_path / "results_latest.json")
    
    return env


# ============================================================================
# DEPENDENCY MANAGEMENT (Using shared colab_compat module)
# ============================================================================

# ML dependencies - will be imported after ensure_dependencies() is called
pd = None
TfidfVectorizer = None
cosine_similarity = None

def ensure_dependencies(compat: Optional[ColabCompat] = None):
    """
    Install and import required packages if missing.
    
    Args:
        compat: Optional ColabCompat instance for package installation
    """
    global pd, TfidfVectorizer, cosine_similarity
    
    required = ["pandas", "scikit-learn"]
    missing = []
    
    for pkg in required:
        pkg_import = pkg.replace("-", "_")
        if pkg == "scikit-learn":
            pkg_import = "sklearn"
        try:
            __import__(pkg_import)
        except ImportError:
            missing.append(pkg)
    
    if missing:
        safe_print(f"📦 Installing missing packages: {missing}")
        if compat:
            compat.install_packages(missing)
        else:
            import subprocess
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + missing)
        safe_print("✅ Dependencies installed!")
    
    # Now import ML libraries
    import pandas
    from sklearn.feature_extraction.text import TfidfVectorizer as TfidfVec
    from sklearn.metrics.pairwise import cosine_similarity as cos_sim
    
    pd = pandas
    TfidfVectorizer = TfidfVec
    cosine_similarity = cos_sim


# ============================================================================
# CATEGORIZATION ENGINE
# ============================================================================

class CategorizationError(Exception):
    """Custom error for categorization failures"""
    pass


class TextExpanderCategorizer:
    """
    TF-IDF + Cosine Similarity based text categorizer
    Matches text against available category names
    """
    
    def __init__(self, available_categories: List[str], confidence_threshold: float = CONFIDENCE_THRESHOLD):
        if not available_categories:
            raise CategorizationError("❌ No categories provided")
        
        self.categories = [str(c).strip() for c in available_categories if c]
        self.vectorizer = TfidfVectorizer(
            stop_words='english',
            max_features=TFIDF_MAX_FEATURES,
            ngram_range=TFIDF_NGRAM_RANGE
        )
        self.confidence_threshold = confidence_threshold
        
        safe_print(f"🎯 Categorizer initialized with {len(self.categories)} categories")
    
    def categorize(self, text: str, description: str = "") -> Dict[str, Any]:
        """
        Categorizes text and returns category + confidence score
        
        Args:
            text: Primary text content
            description: Optional description for better matching
            
        Returns:
            {
                "category": str,
                "confidence": float,
                "alternatives": List[Dict]
            }
        """
        # Combine text and description
        combined = f"{text} {description}".strip()
        
        if not combined:
            return {
                "category": "❓ Uncategorized",
                "confidence": 0.0,
                "alternatives": []
            }
        
        try:
            # Build corpus: [input_text, category1, category2, ...]
            corpus = [combined.lower()] + [cat.lower() for cat in self.categories]
            tfidf_matrix = self.vectorizer.fit_transform(corpus)
            
            # Calculate similarities between input and each category
            similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
            
            # Get top 3 matches
            top_indices = similarities.argsort()[-3:][::-1]
            alternatives = [
                {
                    "category": self.categories[idx],
                    "confidence": float(similarities[idx])
                }
                for idx in top_indices
                if similarities[idx] > 0
            ]
            
            if not alternatives:
                return {
                    "category": "🌱 Needs Review",
                    "confidence": 0.0,
                    "alternatives": []
                }
            
            best_match = alternatives[0]
            
            # Apply confidence threshold
            if best_match["confidence"] < self.confidence_threshold:
                return {
                    "category": "🌱 Needs Review",
                    "confidence": best_match["confidence"],
                    "alternatives": alternatives
                }
            
            return {
                "category": best_match["category"],
                "confidence": best_match["confidence"],
                "alternatives": alternatives[1:] if len(alternatives) > 1 else []
            }
            
        except Exception as e:
            safe_print(f"⚠️ Error categorizing '{text[:30]}...': {e}")
            return {
                "category": "❌ Error",
                "confidence": 0.0,
                "alternatives": []
            }


# ============================================================================
# BATCH PROCESSING
# ============================================================================

def process_batch(input_path: str, output_path: str) -> Dict[str, Any]:
    """
    Main processing pipeline for batch categorization
    
    Args:
        input_path: Path to pending_tasks.json
        output_path: Path to write results_latest.json
        
    Returns:
        Summary dict with processing stats
    """
    start_time = datetime.now()
    stats = {
        "success": False,
        "total_processed": 0,
        "high_confidence": 0,
        "low_confidence": 0,
        "errors": 0
    }
    
    safe_print(f"\n{'='*60}")
    safe_print("🌉 DRIVE CATEGORIZER BRIDGE")
    safe_print(f"{'='*60}")
    
    try:
        # 1️⃣ Read input file
        safe_print(f"\n📖 Reading: {input_path}")
        
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Validate input structure
        required_keys = ['availableCategories', 'tasks']
        missing = [k for k in required_keys if k not in data]
        if missing:
            raise CategorizationError(f"Missing required keys: {missing}")
        
        safe_print(f"📋 Spreadsheet: {data.get('spreadsheetName', 'Unknown')}")
        safe_print(f"🎯 Categories: {len(data['availableCategories'])}")
        safe_print(f"📝 Tasks: {len(data['tasks'])}")
        
        # 2️⃣ Initialize categorizer
        categorizer = TextExpanderCategorizer(data['availableCategories'])
        
        # 3️⃣ Process each task
        results = []
        total = len(data['tasks'])
        
        safe_print(f"\n🔄 Processing {total} items...")
        
        for idx, task in enumerate(data['tasks'], 1):
            # Progress indicator
            if idx % 10 == 0 or idx == total:
                safe_print(f"   [{idx}/{total}] Processing...")
            
            try:
                result = categorizer.categorize(
                    task.get('text', ''),
                    task.get('description', '')
                )
                
                results.append({
                    "rowId": task.get('rowId', idx),  # Use idx as fallback if rowId missing
                    "originalText": str(task.get('text', ''))[:100],
                    "suggestedCategory": result['category'],
                    "confidence": round(result['confidence'], 4),
                    "alternatives": result['alternatives'][:2]  # Keep top 2 alternatives
                })
                
                # Track confidence stats using configurable thresholds
                if result['confidence'] >= HIGH_CONFIDENCE_THRESHOLD:
                    stats["high_confidence"] += 1
                elif result['confidence'] < LOW_CONFIDENCE_THRESHOLD:
                    stats["low_confidence"] += 1
                    
            except Exception as e:
                safe_print(f"⚠️ Error on row {task.get('rowId', '?')}: {e}")
                stats["errors"] += 1
                results.append({
                    "rowId": task.get('rowId', idx),  # Use idx as fallback
                    "originalText": str(task.get('text', ''))[:50],
                    "suggestedCategory": "❌ Processing Error",
                    "confidence": 0.0,
                    "alternatives": []
                })
        
        stats["total_processed"] = len(results)
        
        # 4️⃣ Write output
        output_data = {
            "processedAt": datetime.now().isoformat(),
            "sourceSpreadsheet": data.get('spreadsheetId', ''),
            "totalProcessed": len(results),
            "stats": {
                "highConfidence": stats["high_confidence"],
                "lowConfidence": stats["low_confidence"],
                "errors": stats["errors"]
            },
            "results": results
        }
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        stats["success"] = True
        
        # 5️⃣ Summary
        elapsed = (datetime.now() - start_time).total_seconds()
        avg_confidence = sum(r['confidence'] for r in results) / len(results) if results else 0
        
        safe_print(f"\n{'='*60}")
        safe_print("✅ PROCESSING COMPLETE!")
        safe_print(f"{'='*60}")
        safe_print(f"📊 Total processed: {stats['total_processed']}")
        safe_print(f"✅ High confidence (≥60%): {stats['high_confidence']}")
        safe_print(f"⚠️ Low confidence (<30%): {stats['low_confidence']}")
        safe_print(f"❌ Errors: {stats['errors']}")
        safe_print(f"📈 Average confidence: {avg_confidence:.1%}")
        safe_print(f"⏱️ Time: {elapsed:.2f}s")
        safe_print(f"💾 Output: {output_path}")
        safe_print(f"\n🔙 Return to Google Sheet and click '📥 Import Results'")
        
        return stats
        
    except Exception as e:
        error_msg = f"❌ Fatal error: {e}"
        safe_print(error_msg)
        
        # Write error to output file
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump({
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                }, f, indent=2)
        except (IOError, OSError) as write_error:
            safe_print(f"⚠️ Could not write error file: {write_error}")
        
        stats["success"] = False
        return stats


# ============================================================================
# COLAB CELL HELPERS
# ============================================================================

def mount_drive():
    """Helper for Colab: Mount Google Drive"""
    try:
        from google.colab import drive
        drive.mount('/content/drive')
        print("✅ Drive mounted!")
    except ImportError:
        print("ℹ️ Not in Colab - Drive should be synced locally")
    except Exception as e:
        print(f"❌ Mount error: {e}")


def run_categorization():
    """
    Main entry point - detect environment and run categorization.
    
    Returns:
        Dict with processing stats, or None if cannot proceed
    """
    # Detect environment first
    env = detect_environment()
    
    # Install dependencies using the compat instance (lazy loading)
    compat = env.get("compat")
    ensure_dependencies(compat)
    
    safe_print(f"\n📁 Bridge folder: {env['bridge_folder']}")
    safe_print(f"📥 Input: {env['input_file']}")
    safe_print(f"📤 Output: {env['output_file']}")
    
    if not env["drive_mounted"]:
        safe_print("\n⚠️ Drive not accessible. Please mount/sync first.")
        return None
    
    if not os.path.exists(env["input_file"]):
        safe_print(f"\n⏳ No pending tasks found.")
        safe_print("   Run '🚀 Trigger Categorization' from Google Sheet first.")
        return None
    
    return process_batch(env["input_file"], env["output_file"])


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("🌉 DriveCategorizerBridge v1.0")
    print("=" * 40)
    
    # Allow command-line path overrides
    if len(sys.argv) >= 3:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        print(f"📥 Custom input: {input_file}")
        print(f"📤 Custom output: {output_file}")
        process_batch(input_file, output_file)
    else:
        run_categorization()
