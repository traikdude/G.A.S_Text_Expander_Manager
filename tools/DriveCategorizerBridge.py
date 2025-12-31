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
Part of: G.A.S_Text_Expander_Manager
"""

import os
import sys
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path

# ============================================================================
# CONFIGURATION
# ============================================================================

# Default paths for Google Drive integration
DRIVE_FOLDER_NAME = "TextExpanderBridge"
COLAB_DRIVE_PATH = "/content/drive/MyDrive"
LOCAL_DRIVE_PATH = os.path.expanduser("~/Google Drive/My Drive")  # Windows/Mac

# ML Configuration
CONFIDENCE_THRESHOLD = 0.15  # Minimum confidence to assign category
TFIDF_MAX_FEATURES = 500
TFIDF_NGRAM_RANGE = (1, 2)

# ============================================================================
# ENVIRONMENT DETECTION
# ============================================================================

def detect_environment() -> Dict[str, Any]:
    """Detect runtime environment and set paths accordingly"""
    env = {
        "is_colab": False,
        "drive_mounted": False,
        "bridge_folder": None,
        "input_file": None,
        "output_file": None
    }
    
    # Check for Colab
    try:
        import google.colab
        env["is_colab"] = True
        print("🌐 Running in Google Colab")
    except ImportError:
        print("💻 Running in Local Python")
    
    # Determine Drive path
    if env["is_colab"]:
        drive_base = COLAB_DRIVE_PATH
        if os.path.exists(drive_base):
            env["drive_mounted"] = True
        else:
            print("⚠️ Google Drive not mounted. Run: drive.mount('/content/drive')")
    else:
        # Try common local Drive paths
        for path in [LOCAL_DRIVE_PATH, os.path.expanduser("~/Google Drive")]:
            if os.path.exists(path):
                drive_base = path
                env["drive_mounted"] = True
                break
        else:
            drive_base = "."
            print("⚠️ Google Drive not found locally. Using current directory.")
    
    # Set bridge folder path
    bridge_path = os.path.join(drive_base, DRIVE_FOLDER_NAME)
    env["bridge_folder"] = bridge_path
    env["input_file"] = os.path.join(bridge_path, "pending_tasks.json")
    env["output_file"] = os.path.join(bridge_path, "results_latest.json")
    
    return env


# ============================================================================
# DEPENDENCY MANAGEMENT
# ============================================================================

def ensure_dependencies():
    """Install required packages if missing"""
    required = ["pandas", "scikit-learn"]
    missing = []
    
    for pkg in required:
        try:
            __import__(pkg.replace("-", "_"))
        except ImportError:
            missing.append(pkg)
    
    if missing:
        print(f"📦 Installing missing packages: {missing}")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + missing)
        print("✅ Dependencies installed!")

ensure_dependencies()

# Now import ML libraries
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


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
        
        print(f"🎯 Categorizer initialized with {len(self.categories)} categories")
    
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
            print(f"⚠️ Error categorizing '{text[:30]}...': {e}")
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
    
    print(f"\n{'='*60}")
    print("🌉 DRIVE CATEGORIZER BRIDGE")
    print(f"{'='*60}")
    
    try:
        # 1️⃣ Read input file
        print(f"\n📖 Reading: {input_path}")
        
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Validate input structure
        required_keys = ['availableCategories', 'tasks']
        missing = [k for k in required_keys if k not in data]
        if missing:
            raise CategorizationError(f"Missing required keys: {missing}")
        
        print(f"📋 Spreadsheet: {data.get('spreadsheetName', 'Unknown')}")
        print(f"🎯 Categories: {len(data['availableCategories'])}")
        print(f"📝 Tasks: {len(data['tasks'])}")
        
        # 2️⃣ Initialize categorizer
        categorizer = TextExpanderCategorizer(data['availableCategories'])
        
        # 3️⃣ Process each task
        results = []
        total = len(data['tasks'])
        
        print(f"\n🔄 Processing {total} items...")
        
        for idx, task in enumerate(data['tasks'], 1):
            # Progress indicator
            if idx % 10 == 0 or idx == total:
                print(f"   [{idx}/{total}] Processing...")
            
            try:
                result = categorizer.categorize(
                    task.get('text', ''),
                    task.get('description', '')
                )
                
                results.append({
                    "rowId": task['rowId'],
                    "originalText": str(task.get('text', ''))[:100],
                    "suggestedCategory": result['category'],
                    "confidence": round(result['confidence'], 4),
                    "alternatives": result['alternatives'][:2]  # Keep top 2 alternatives
                })
                
                # Track confidence stats
                if result['confidence'] >= 0.6:
                    stats["high_confidence"] += 1
                elif result['confidence'] < 0.3:
                    stats["low_confidence"] += 1
                    
            except Exception as e:
                print(f"⚠️ Error on row {task.get('rowId', '?')}: {e}")
                stats["errors"] += 1
                results.append({
                    "rowId": task.get('rowId', 0),
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
        
        print(f"\n{'='*60}")
        print("✅ PROCESSING COMPLETE!")
        print(f"{'='*60}")
        print(f"📊 Total processed: {stats['total_processed']}")
        print(f"✅ High confidence (≥60%): {stats['high_confidence']}")
        print(f"⚠️ Low confidence (<30%): {stats['low_confidence']}")
        print(f"❌ Errors: {stats['errors']}")
        print(f"📈 Average confidence: {avg_confidence:.1%}")
        print(f"⏱️ Time: {elapsed:.2f}s")
        print(f"💾 Output: {output_path}")
        print(f"\n🔙 Return to Google Sheet and click '📥 Import Results'")
        
        return stats
        
    except Exception as e:
        error_msg = f"❌ Fatal error: {e}"
        print(error_msg)
        
        # Write error to output file
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump({
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                }, f, indent=2)
        except:
            pass
        
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
    """Main entry point - detect environment and run"""
    env = detect_environment()
    
    print(f"\n📁 Bridge folder: {env['bridge_folder']}")
    print(f"📥 Input: {env['input_file']}")
    print(f"📤 Output: {env['output_file']}")
    
    if not env["drive_mounted"]:
        print("\n⚠️ Drive not accessible. Please mount/sync first.")
        return None
    
    if not os.path.exists(env["input_file"]):
        print(f"\n⏳ No pending tasks found.")
        print("   Run '🚀 Trigger Categorization' from Google Sheet first.")
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
