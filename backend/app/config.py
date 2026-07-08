'''
import os
from pathlib import Path
from dotenv import load_dotenv

# Path resolving: __file__ is backend/app/config.py
backend_dir = Path(__file__).resolve().parents[1]
env_path = backend_dir / '.env'

load_dotenv(dotenv_path=env_path)

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")


if not GITHUB_TOKEN:
    raise ValueError("Critical Error: GITHUB_TOKEN is not set in the environment or .env file.")
    '''
import os
from pathlib import Path
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parents[1]
env_path = backend_dir / '.env'

load_dotenv(dotenv_path=env_path)

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")

if not GITHUB_TOKEN:
    raise ValueError("Critical Error: GITHUB_TOKEN is not set in the environment or .env file.")


if __name__ == "__main__":
    print("Paths resolved successfully.")
    print(f"Target .env path searched: {env_path}")
    print(f"File exists: {env_path.exists()}")
    
    masked_token = f"{GITHUB_TOKEN[:14]}...{GITHUB_TOKEN[-4:]}" if len(GITHUB_TOKEN) > 18 else "Invalid/Short Token"
    print(f"Loaded Token: {masked_token}")