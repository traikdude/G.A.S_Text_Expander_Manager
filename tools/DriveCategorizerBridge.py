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
import argparse
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
# CLI ARGUMENT PARSING
# ============================================================================

def parse_args():
    """
    Parse command-line arguments.
    
    Returns:
        Namespace with parsed arguments
    """
    parser = argparse.ArgumentParser(
        description='🌉 DriveCategorizerBridge - NLP-based text categorization',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python DriveCategorizerBridge.py                    # Auto-detect environment and run
  python DriveCategorizerBridge.py --dry-run          # Preview without writing output
  python DriveCategorizerBridge.py --input in.json --output out.json
        """
    )
    
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Preview categorization without writing results to output file'
    )
    
    parser.add_argument(
        '--input', '-i',
        type=str,
        help='Custom input file path (overrides auto-detection)'
    )
    
    parser.add_argument(
        '--output', '-o',
        type=str,
        help='Custom output file path (overrides auto-detection)'
    )
    
    parser.add_argument(
        '--no-progress',
        action='store_true',
        help='Disable progress indicators (useful for non-interactive environments)'
    )
    
    parser.add_argument(
        '--version', '-v',
        action='version',
        version='🌉 DriveCategorizerBridge v1.1'
    )
    
    return parser.parse_args()

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
tqdm = None  # Progress bar

def ensure_dependencies(compat: Optional[ColabCompat] = None):
    """
    Install and import required packages if missing.
    
    Args:
        compat: Optional ColabCompat instance for package installation
    """
    global pd, TfidfVectorizer, cosine_similarity, tqdm
    
    required = ["pandas", "scikit-learn", "tqdm"]
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
    from tqdm import tqdm as tqdm_lib
    
    pd = pandas
    TfidfVectorizer = TfidfVec
    cosine_similarity = cos_sim
    tqdm = tqdm_lib


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
# BATCH PROCESSING - HELPER FUNCTIONS
# ============================================================================

def _load_and_validate_input(input_path: str) -> Dict[str, Any]:
    """
    Load and validate input JSON file.
    
    Args:
        input_path: Path to pending_tasks.json
        
    Returns:
        Validated data dict
        
    Raises:
        FileNotFoundError: If input file doesn't exist
        CategorizationError: If required keys are missing
    """
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
    
    return data


def _process_tasks(
    categorizer: 'TextExpanderCategorizer',
    tasks: List[Dict],
    stats: Dict[str, int],
    show_progress: bool = True
) -> List[Dict]:
    """
    Process tasks through the categorizer.
    
    Args:
        categorizer: Initialized TextExpanderCategorizer instance
        tasks: List of task dicts to categorize
        stats: Stats dict to update (high_confidence, low_confidence, errors)
        show_progress: Whether to show tqdm progress bar
        
    Returns:
        List of result dicts
    """
    results = []
    total = len(tasks)
    
    safe_print(f"\n🔄 Processing {total} items...")
    
    # Use tqdm for progress bar (disable for non-interactive or if requested)
    task_iterator = tqdm(
        enumerate(tasks, 1),
        total=total,
        desc="   🔄 Categorizing",
        disable=not show_progress,
        bar_format='{desc}: {percentage:3.0f}%|{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]'
    )
    
    for idx, task in task_iterator:
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
    
    return results


def _write_output(
    output_path: str,
    results: List[Dict],
    stats: Dict[str, int],
    source_spreadsheet_id: str,
    dry_run: bool = False
) -> None:
    """
    Write results to output file (or preview in dry-run mode).
    
    Args:
        output_path: Path to write results_latest.json
        results: List of result dicts
        stats: Stats dict with counts
        source_spreadsheet_id: Original spreadsheet ID
        dry_run: If True, only preview without writing
    """
    output_data = {
        "processedAt": datetime.now().isoformat(),
        "sourceSpreadsheet": source_spreadsheet_id,
        "totalProcessed": len(results),
        "stats": {
            "highConfidence": stats["high_confidence"],
            "lowConfidence": stats["low_confidence"],
            "errors": stats["errors"]
        },
        "results": results
    }
    
    if dry_run:
        safe_print(f"\n📋 DRY-RUN: Would write to: {output_path}")
        safe_print(f"📋 DRY-RUN: Sample results (first 3):")
        for r in results[:3]:
            safe_print(f"   • {r['originalText'][:40]}... → {r['suggestedCategory']} ({r['confidence']:.0%})")
    else:
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)


def _print_summary(
    stats: Dict[str, int],
    results: List[Dict],
    elapsed: float,
    output_path: str,
    dry_run: bool = False
) -> None:
    """
    Print processing summary statistics.
    
    Args:
        stats: Stats dict with counts
        results: List of results for average calculation
        elapsed: Elapsed time in seconds
        output_path: Output file path (for display)
        dry_run: Whether this was a dry run
    """
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
    if dry_run:
        safe_print(f"📋 DRY-RUN: No files written")
    else:
        safe_print(f"💾 Output: {output_path}")
        safe_print(f"\n🔙 Return to Google Sheet and click '📥 Import Results'")


# ============================================================================
# BATCH PROCESSING - MAIN ORCHESTRATOR
# ============================================================================

def process_batch(input_path: str, output_path: str, dry_run: bool = False, show_progress: bool = True) -> Dict[str, Any]:
    """
    Main processing pipeline for batch categorization.
    
    This function orchestrates the categorization workflow by delegating to
    specialized helper functions for each phase.
    
    Args:
        input_path: Path to pending_tasks.json
        output_path: Path to write results_latest.json
        dry_run: If True, preview results without writing to file
        show_progress: If True, show progress indicators
        
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
    safe_print("🌉 DRIVE CATEGORIZER BRIDGE" + (" [DRY-RUN]" if dry_run else ""))
    safe_print(f"{'='*60}")
    
    try:
        # 1️⃣ Load and validate input
        data = _load_and_validate_input(input_path)
        
        # 2️⃣ Initialize categorizer
        categorizer = TextExpanderCategorizer(data['availableCategories'])
        
        # 3️⃣ Process tasks
        results = _process_tasks(
            categorizer=categorizer,
            tasks=data['tasks'],
            stats=stats,
            show_progress=show_progress
        )
        stats["total_processed"] = len(results)
        
        # 4️⃣ Write output (or preview)
        _write_output(
            output_path=output_path,
            results=results,
            stats=stats,
            source_spreadsheet_id=data.get('spreadsheetId', ''),
            dry_run=dry_run
        )
        
        stats["success"] = True
        
        # 5️⃣ Print summary
        elapsed = (datetime.now() - start_time).total_seconds()
        _print_summary(
            stats=stats,
            results=results,
            elapsed=elapsed,
            output_path=output_path,
            dry_run=dry_run
        )
        
        return stats
        
    except Exception as e:
        error_msg = f"❌ Fatal error: {e}"
        safe_print(error_msg)
        
        # Write error to output file (unless dry-run)
        if not dry_run:
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


def run_categorization(dry_run: bool = False, show_progress: bool = True):
    """
    Main entry point - detect environment and run categorization.
    
    Args:
        dry_run: If True, preview results without writing to file
        show_progress: If True, show progress indicators
    
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
    
    return process_batch(env["input_file"], env["output_file"], dry_run=dry_run, show_progress=show_progress)


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    args = parse_args()
    
    safe_print("🌉 DriveCategorizerBridge v1.1")
    safe_print("=" * 40)
    
    if args.dry_run:
        safe_print("📋 Mode: DRY-RUN (no files will be written)")
    
    # Use CLI-specified paths or auto-detect
    if args.input and args.output:
        safe_print(f"📥 Custom input: {args.input}")
        safe_print(f"📤 Custom output: {args.output}")
        process_batch(args.input, args.output, 
                     dry_run=args.dry_run, 
                     show_progress=not args.no_progress)
    else:
        run_categorization(dry_run=args.dry_run, 
                          show_progress=not args.no_progress)
