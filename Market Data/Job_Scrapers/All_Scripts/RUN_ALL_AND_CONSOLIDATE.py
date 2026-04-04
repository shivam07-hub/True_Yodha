#!/usr/bin/env python3
"""
Quick-run script: Consolidate existing outputs into master Excel.
Use this AFTER running the individual scraper notebooks.

For full pipeline (generate + scrape + consolidate):
    python MASTER_Job_Scraper_Orchestrator_v2.py

For just consolidation:
    python RUN_ALL_AND_CONSOLIDATE.py
"""

import sys
from pathlib import Path

# Fix imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Import consolidation steps from the master orchestrator
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location("master", str(Path(__file__).resolve().parent / "MASTER_Job_Scraper_Orchestrator_v2.py"))
master_mod = module_from_spec(spec)

# We only want the consolidation, not the scraping
# So we copy the relevant functions directly:
exec(open(str(Path(__file__).resolve().parent / "MASTER_Job_Scraper_Orchestrator_v2.py")).read())

print("\n\nDone! Check Master_Output/ for the consolidated files.")
