"""
config.py — Configuration management for SemanticMemoryProject.

Allows setting root directory via:
  1. SEMANTIC_ROOT_DIR environment variable
  2. .env file
    3. Default to user's Downloads folder
"""

import os
from pathlib import Path


def _load_dotenv_file() -> None:
    """Load key=value pairs from .env in project root into os.environ."""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.isfile(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

def get_root_directory() -> str:
    """
    Get the root directory for file scanning, in order of precedence:
    1. SEMANTIC_ROOT_DIR environment variable
    2. HOME_DIR environment variable (fallback)
    3. User's Downloads folder
    """
    
    _load_dotenv_file()

    # Check explicit environment variable first
    if root_dir := os.getenv("SEMANTIC_ROOT_DIR"):
        root_dir = os.path.expanduser(root_dir)
        if os.path.isdir(root_dir):
            print(f"Using SEMANTIC_ROOT_DIR: {root_dir}")
            return root_dir
        else:
            print(f"SEMANTIC_ROOT_DIR path does not exist: {root_dir}")
    
    # Check if test_documents exists in project (legacy)
    project_test_docs = os.path.join(os.path.dirname(__file__), "test_documents")
    if os.path.isdir(project_test_docs):
        print(f"Using default test_documents: {project_test_docs}")
        return project_test_docs
    
    # Fallback to user's Downloads folder
    downloads_folder = str(Path.home() / "Downloads")
    if os.path.isdir(downloads_folder):
        print(f"Using Downloads folder: {downloads_folder}")
        return downloads_folder
    
    # Final fallback to home directory
    home = str(Path.home())
    print(f"Using home directory: {home}")
    return home
