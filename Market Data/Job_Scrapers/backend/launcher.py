#!/usr/bin/env python3
"""
Job Match GUI Launcher
======================
A simple desktop window to run the full CV-to-job matching pipeline.
No command line needed — just run this file in PyCharm.

Features:
  • Step 1: Enter / save your OpenAI API key
  • Step 2: Select your CV and preferences
  • Step 3: See top 5 matches with scores, strengths, weaknesses, and apply links

Run: python launcher.py
"""

import asyncio
import logging
import os
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, font, messagebox, scrolledtext, ttk

# ── Paths ────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent
ENV_FILE    = BACKEND_DIR / ".env"
sys.path.insert(0, str(BACKEND_DIR))


# ═══════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════

def load_env():
    """Load .env key=value pairs into os.environ."""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


PROVIDER_KEY_ENV = {
    "OpenAI":    "OPENAI_API_KEY",
    "Anthropic": "ANTHROPIC_API_KEY",
    "Gemini":    "GEMINI_API_KEY",
}
PROVIDER_LLM_VALUE = {
    "OpenAI":    "openai",
    "Anthropic": "anthropic",
    "Gemini":    "gemini",
}


def save_api_key(provider: str, key: str):
    """Write / update the chosen provider's key + LLM_PROVIDER in the .env file."""
    env_var = PROVIDER_KEY_ENV[provider]
    llm_val = PROVIDER_LLM_VALUE[provider]
    lines = []
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            # Keep all lines except the ones we're about to overwrite
            if not line.startswith(env_var) and not line.startswith("LLM_PROVIDER"):
                lines.append(line)
    lines.append(f"{env_var}={key.strip()}")
    lines.append(f"LLM_PROVIDER={llm_val}")
    ENV_FILE.write_text("\n".join(lines) + "\n")
    os.environ[env_var] = key.strip()
    os.environ["LLM_PROVIDER"] = llm_val


def get_saved_key(provider: str) -> str:
    load_env()
    return os.environ.get(PROVIDER_KEY_ENV.get(provider, "OPENAI_API_KEY"), "")


# ═══════════════════════════════════════════════════════════════════
#  COLOUR / STYLE CONSTANTS
# ═══════════════════════════════════════════════════════════════════

BG        = "#0f1117"   # near-black background
CARD      = "#1a1d27"   # card surface
ACCENT    = "#5865f2"   # indigo accent
ACCENT2   = "#48bb78"   # green (success/strengths)
WARN      = "#f6ad55"   # orange (weaknesses)
TEXT      = "#e2e8f0"   # primary text
SUBTEXT   = "#718096"   # secondary text
BORDER    = "#2d3748"   # border colour
RED       = "#fc8181"   # error / missing


# ═══════════════════════════════════════════════════════════════════
#  MAIN APPLICATION WINDOW
# ═══════════════════════════════════════════════════════════════════

class JobMatchApp(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("Job Match  ·  CV-to-Job Matcher")
        self.geometry("1050x780")
        self.minsize(900, 680)
        self.configure(bg=BG)
        self.resizable(True, True)

        load_env()
        self._build_ui()

        # Restore saved provider + key
        saved_provider = os.environ.get("LLM_PROVIDER", "openai").capitalize()
        saved_provider = next(
            (p for p in PROVIDER_KEY_ENV if p.lower() == saved_provider.lower()), "OpenAI"
        )
        self.provider_var.set(saved_provider)
        self._on_provider_change()
        saved_key = get_saved_key(saved_provider)
        if saved_key:
            self.api_key_var.set(saved_key)
            self._set_status(f"{saved_provider} key loaded from .env  ✓", colour=ACCENT2)

    # ─────────────────────────────────────────────────────────────────
    # UI BUILD
    # ─────────────────────────────────────────────────────────────────

    def _build_ui(self):
        # ── Header ────────────────────────────────────────────────
        header = tk.Frame(self, bg=CARD, pady=12)
        header.pack(fill="x")
        tk.Label(
            header, text="  Job Match",
            font=("Helvetica", 20, "bold"), fg=TEXT, bg=CARD,
        ).pack(side="left", padx=20)
        tk.Label(
            header, text="AI-powered CV → Top 5 Jobs",
            font=("Helvetica", 11), fg=SUBTEXT, bg=CARD,
        ).pack(side="left")

        # ── Status bar (bottom) ───────────────────────────────────
        self.status_var = tk.StringVar(value="Ready")
        status_bar = tk.Frame(self, bg=BORDER, height=28)
        status_bar.pack(side="bottom", fill="x")
        self.status_lbl = tk.Label(
            status_bar, textvariable=self.status_var,
            font=("Helvetica", 10), fg=SUBTEXT, bg=BORDER, anchor="w",
        )
        self.status_lbl.pack(side="left", padx=12, fill="y")

        # ── Main paned layout ─────────────────────────────────────
        main = tk.Frame(self, bg=BG)
        main.pack(fill="both", expand=True, padx=0, pady=0)

        # Left column: inputs
        left = tk.Frame(main, bg=BG, width=380)
        left.pack(side="left", fill="y", padx=16, pady=16)
        left.pack_propagate(False)

        # Right column: results
        right = tk.Frame(main, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(0, 16), pady=16)

        self._build_left(left)
        self._build_right(right)

    # ─────────────────────────────────────────────────────────────────
    # LEFT PANEL
    # ─────────────────────────────────────────────────────────────────

    def _build_left(self, parent):

        # ── Section: LLM Provider & API Key ──────────────────────
        self._section(parent, "1  LLM Provider & API Key")

        api_frame = tk.Frame(parent, bg=CARD, padx=12, pady=12,
                             highlightbackground=BORDER, highlightthickness=1)
        api_frame.pack(fill="x", pady=(0, 14))

        # Provider selector row
        prov_row = tk.Frame(api_frame, bg=CARD)
        prov_row.pack(fill="x", pady=(0, 8))
        tk.Label(prov_row, text="Provider:", font=("Helvetica", 10),
                 fg=SUBTEXT, bg=CARD).pack(side="left", padx=(0, 8))
        self.provider_var = tk.StringVar(value="OpenAI")
        for p in ("OpenAI", "Anthropic", "Gemini"):
            tk.Radiobutton(
                prov_row, text=p, variable=self.provider_var, value=p,
                command=self._on_provider_change,
                font=("Helvetica", 10), fg=TEXT, bg=CARD,
                selectcolor=CARD, activebackground=CARD,
                relief="flat", cursor="hand2",
            ).pack(side="left", padx=6)

        # Key hint label (updates with provider)
        self.key_hint_var = tk.StringVar(value="OPENAI_API_KEY  (paste from OpenAI dashboard)")
        tk.Label(api_frame, textvariable=self.key_hint_var,
                 font=("Helvetica", 9), fg=SUBTEXT, bg=CARD,
                 anchor="w").pack(fill="x", pady=(0, 4))

        # Key entry + save
        self.api_key_var = tk.StringVar()
        api_row = tk.Frame(api_frame, bg=CARD)
        api_row.pack(fill="x")
        self.api_entry = tk.Entry(
            api_row, textvariable=self.api_key_var,
            show="•", font=("Helvetica", 11),
            bg="#252836", fg=TEXT, insertbackground=TEXT,
            relief="flat", bd=0,
        )
        self.api_entry.pack(side="left", fill="x", expand=True, ipady=6, padx=(0, 8))
        tk.Button(
            api_row, text="Save Key",
            command=self._save_key,
            bg=ACCENT, fg="white", font=("Helvetica", 10, "bold"),
            relief="flat", cursor="hand2", padx=10,
        ).pack(side="right")

        toggle_row = tk.Frame(api_frame, bg=CARD)
        toggle_row.pack(fill="x", pady=(6, 0))
        tk.Button(
            toggle_row, text="Show / Hide",
            command=self._toggle_key_visibility,
            bg=CARD, fg=SUBTEXT, font=("Helvetica", 9),
            relief="flat", cursor="hand2",
        ).pack(side="left")
        tk.Label(
            toggle_row,
            text="Saved to backend/.env (git-ignored)",
            font=("Helvetica", 9), fg=SUBTEXT, bg=CARD,
        ).pack(side="right")

        # ── Section: Your CV ─────────────────────────────────────
        self._section(parent, "2  Your CV  (PDF)")

        cv_frame = tk.Frame(parent, bg=CARD, padx=12, pady=12,
                            highlightbackground=BORDER, highlightthickness=1)
        cv_frame.pack(fill="x", pady=(0, 14))

        self.cv_path_var = tk.StringVar(value="No file selected")
        tk.Label(
            cv_frame, textvariable=self.cv_path_var,
            font=("Helvetica", 10), fg=SUBTEXT, bg=CARD,
            wraplength=320, anchor="w",
        ).pack(fill="x", pady=(0, 8))
        tk.Button(
            cv_frame, text="📂  Browse for CV PDF",
            command=self._browse_cv,
            bg=ACCENT, fg="white", font=("Helvetica", 10, "bold"),
            relief="flat", cursor="hand2", pady=6,
        ).pack(fill="x")

        # ── Section: Preferences ─────────────────────────────────
        self._section(parent, "3  Your Preferences")

        pref_frame = tk.Frame(parent, bg=CARD, padx=12, pady=12,
                              highlightbackground=BORDER, highlightthickness=1)
        pref_frame.pack(fill="x", pady=(0, 14))

        self._field(pref_frame, "Your Name")
        self.name_var = tk.StringVar()
        self._entry(pref_frame, self.name_var, "e.g. Rahul Sharma")

        self._field(pref_frame, "Email Address")
        self.email_var = tk.StringVar()
        self._entry(pref_frame, self.email_var, "e.g. rahul@gmail.com")

        self._field(pref_frame, "Years of Experience")
        self.exp_var = tk.StringVar(value="3-5")
        exp_combo = ttk.Combobox(
            pref_frame, textvariable=self.exp_var,
            values=["0-2", "3-5", "6-10", "10+"],
            state="readonly", font=("Helvetica", 11),
        )
        exp_combo.pack(fill="x", pady=(0, 8))

        self._field(pref_frame, "Preferred Cities  (comma-separated)")
        self.cities_var = tk.StringVar(value="Bengaluru, Hyderabad")
        self._entry(pref_frame, self.cities_var, "e.g. Bengaluru, Mumbai, Pune")

        self._field(pref_frame, "Work Mode")
        self.work_mode_var = tk.StringVar(value="hybrid")
        wm_combo = ttk.Combobox(
            pref_frame, textvariable=self.work_mode_var,
            values=["hybrid", "remote", "onsite", "any"],
            state="readonly", font=("Helvetica", 11),
        )
        wm_combo.pack(fill="x", pady=(0, 4))

        # ── Run button ────────────────────────────────────────────
        self.run_btn = tk.Button(
            parent,
            text="▶  Find My Top 5 Jobs",
            command=self._run_pipeline,
            bg=ACCENT2, fg="#1a202c",
            font=("Helvetica", 13, "bold"),
            relief="flat", cursor="hand2", pady=12,
        )
        self.run_btn.pack(fill="x", pady=(8, 0))

        # Mock mode checkbox
        self.mock_var = tk.BooleanVar(value=False)
        tk.Checkbutton(
            parent,
            text="Mock mode  (test without using API credits)",
            variable=self.mock_var,
            bg=BG, fg=SUBTEXT, selectcolor=CARD,
            font=("Helvetica", 9), activebackground=BG,
        ).pack(anchor="w", pady=(6, 0))

    # ─────────────────────────────────────────────────────────────────
    # RIGHT PANEL — Results
    # ─────────────────────────────────────────────────────────────────

    def _build_right(self, parent):
        tk.Label(
            parent, text="Results",
            font=("Helvetica", 14, "bold"), fg=TEXT, bg=BG,
        ).pack(anchor="w", pady=(0, 8))

        # Progress bar (hidden until running)
        self.progress = ttk.Progressbar(parent, mode="indeterminate")

        # Results scrolled text area
        self.results_text = scrolledtext.ScrolledText(
            parent,
            font=("Courier", 10),
            bg=CARD, fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            bd=0,
            padx=14, pady=12,
            wrap="word",
            state="disabled",
        )
        self.results_text.pack(fill="both", expand=True)

        # Colour tags for the results pane
        self.results_text.tag_config("header",   foreground=ACCENT,  font=("Courier", 11, "bold"))
        self.results_text.tag_config("score",    foreground=ACCENT2, font=("Courier", 11, "bold"))
        self.results_text.tag_config("section",  foreground=TEXT,    font=("Courier", 10, "bold"))
        self.results_text.tag_config("bullet",   foreground=TEXT,    font=("Courier", 10))
        self.results_text.tag_config("strength", foreground=ACCENT2, font=("Courier", 10))
        self.results_text.tag_config("weakness", foreground=WARN,    font=("Courier", 10))
        self.results_text.tag_config("missing",  foreground=RED,     font=("Courier", 10))
        self.results_text.tag_config("link",     foreground=ACCENT,  font=("Courier", 10, "underline"))
        self.results_text.tag_config("dim",      foreground=SUBTEXT, font=("Courier", 10))
        self.results_text.tag_config("divider",  foreground=BORDER,  font=("Courier", 10))

        # CSV save button (hidden until results arrive)
        self.csv_path_label = tk.StringVar(value="")
        self.csv_btn = tk.Button(
            parent, text="📥  Open Results CSV",
            command=self._open_csv,
            bg=CARD, fg=ACCENT, font=("Helvetica", 10),
            relief="flat", cursor="hand2", pady=6,
        )
        self._last_csv: Path | None = None

    # ─────────────────────────────────────────────────────────────────
    # UI HELPERS
    # ─────────────────────────────────────────────────────────────────

    def _section(self, parent, text):
        tk.Label(
            parent, text=text,
            font=("Helvetica", 11, "bold"), fg=TEXT, bg=BG,
        ).pack(anchor="w", pady=(10, 4))

    def _field(self, parent, text):
        tk.Label(
            parent, text=text,
            font=("Helvetica", 9), fg=SUBTEXT, bg=CARD,
        ).pack(anchor="w", pady=(6, 2))

    def _entry(self, parent, var, placeholder=""):
        e = tk.Entry(
            parent, textvariable=var,
            font=("Helvetica", 11),
            bg="#252836", fg=TEXT, insertbackground=TEXT,
            relief="flat", bd=0,
        )
        e.pack(fill="x", ipady=6, pady=(0, 2))
        if placeholder and not var.get():
            e.insert(0, placeholder)
            e.config(fg=SUBTEXT)
            def on_focus_in(event, entry=e, pvar=var, ph=placeholder):
                if entry.get() == ph:
                    entry.delete(0, "end")
                    entry.config(fg=TEXT)
            def on_focus_out(event, entry=e, pvar=var, ph=placeholder):
                if not entry.get():
                    entry.insert(0, ph)
                    entry.config(fg=SUBTEXT)
            e.bind("<FocusIn>", on_focus_in)
            e.bind("<FocusOut>", on_focus_out)
        return e

    def _set_status(self, msg: str, colour: str = SUBTEXT):
        self.status_var.set(msg)
        self.status_lbl.config(fg=colour)

    # ─────────────────────────────────────────────────────────────────
    # ACTIONS
    # ─────────────────────────────────────────────────────────────────

    _KEY_HINTS = {
        "OpenAI":    "OPENAI_API_KEY  (paste from OpenAI dashboard)",
        "Anthropic": "ANTHROPIC_API_KEY  (paste from Anthropic console)",
        "Gemini":    "GEMINI_API_KEY  (starts with AIza...)",
    }
    _KEY_PREFIXES = {
        "OpenAI":    (("sk" + "-"),),
        "Anthropic": (("sk" + "-ant" + "-"),),
        "Gemini":    ("AIza",),
    }

    def _on_provider_change(self):
        p = self.provider_var.get()
        self.key_hint_var.set(self._KEY_HINTS.get(p, ""))
        # Load the saved key for the newly-selected provider
        saved = get_saved_key(p)
        self.api_key_var.set(saved)

    def _toggle_key_visibility(self):
        self.api_entry.config(
            show="" if self.api_entry.cget("show") == "•" else "•"
        )

    def _save_key(self):
        provider = self.provider_var.get()
        key = self.api_key_var.get().strip()
        prefixes = self._KEY_PREFIXES.get(provider, ("",))
        if not key or not any(key.startswith(p) for p in prefixes):
            messagebox.showerror(
                "Invalid Key",
                f"Enter a valid {provider} API key.\n"
                f"Expected prefix: {' or '.join(prefixes)}"
            )
            return
        save_api_key(provider, key)
        self._set_status(f"{provider} key saved to .env  ✓", colour=ACCENT2)
        messagebox.showinfo(
            "Saved",
            f"{provider} key saved to backend/.env\n"
            f"Provider set to: {PROVIDER_LLM_VALUE[provider]}\n\n"
            "You won't need to enter it again."
        )

    def _browse_cv(self):
        path = filedialog.askopenfilename(
            title="Select your CV (PDF)",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")],
        )
        if path:
            self.cv_path_var.set(path)
            self._set_status(f"CV selected: {Path(path).name}", colour=ACCENT2)

    def _open_csv(self):
        if self._last_csv and self._last_csv.exists():
            import subprocess, platform
            if platform.system() == "Darwin":
                subprocess.run(["open", str(self._last_csv)])
            elif platform.system() == "Windows":
                os.startfile(str(self._last_csv))
            else:
                subprocess.run(["xdg-open", str(self._last_csv)])

    # ─────────────────────────────────────────────────────────────────
    # PIPELINE RUNNER (runs in background thread)
    # ─────────────────────────────────────────────────────────────────

    def _run_pipeline(self):
        # Basic validation
        cv_path = self.cv_path_var.get()
        if cv_path == "No file selected" or not Path(cv_path).exists():
            messagebox.showerror("No CV", "Please select your CV PDF first.")
            return

        name = self.name_var.get().strip()
        email = self.email_var.get().strip()
        if not name or name.startswith("e.g"):
            messagebox.showerror("Missing Info", "Please enter your name.")
            return
        if not email or email.startswith("e.g"):
            messagebox.showerror("Missing Info", "Please enter your email.")
            return

        api_key  = self.api_key_var.get().strip()
        provider = self.provider_var.get()
        mock_mode = self.mock_var.get()
        prefixes = self._KEY_PREFIXES.get(provider, ("",))
        if not mock_mode and (not api_key or not any(api_key.startswith(p) for p in prefixes)):
            messagebox.showerror(
                "No API Key",
                f"Please enter and save your {provider} API key first.\n\n"
                "Or tick 'Mock mode' to test without credits."
            )
            return

        # Disable run button, show progress
        self.run_btn.config(state="disabled", text="Running…")
        self.progress.pack(fill="x", pady=(0, 6))
        self.progress.start(12)
        self._clear_results()
        self._write("Running pipeline — this takes ~30 seconds…\n", "dim")

        # Run in a background thread so the UI stays responsive
        thread = threading.Thread(
            target=self._pipeline_thread,
            args=(cv_path, name, email, mock_mode),
            daemon=True,
        )
        thread.start()

    def _pipeline_thread(self, cv_path, name, email, mock_mode):
        """Runs the matching pipeline off the main thread."""
        try:
            result = asyncio.run(self._async_pipeline(cv_path, name, email, mock_mode))
            self.after(0, lambda: self._pipeline_done(result))
        except Exception as exc:
            self.after(0, lambda: self._pipeline_error(str(exc)))

    async def _async_pipeline(self, cv_path, name, email, mock_mode):
        from app.config import LLM_PROVIDER, MASTER_CSV
        from app.database import engine, Base, SessionLocal
        from app.models import Job
        from app.schemas import ParsedCV, MatchResponse
        from app.services.prefilter import prefilter_jobs
        from app.services.matcher import deep_match
        from app.services.output import save_results_csv

        # Step 1: DB
        self.after(0, lambda: self._set_status("Loading job database…", SUBTEXT))
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()

        count = db.query(Job).count()
        if count == 0:
            self.after(0, lambda: self._set_status("Ingesting jobs from master CSV…", SUBTEXT))
            from app.services.ingestion import ingest_csv
            ingest_csv(db, MASTER_CSV)
            count = db.query(Job).count()

        total_jobs = db.query(Job).filter(Job.is_active == True).count()
        self.after(0, lambda: self._write(f"✓ Loaded {total_jobs:,} active jobs\n", "strength"))

        # Step 2: Parse CV
        self.after(0, lambda: self._set_status("Parsing your CV…", SUBTEXT))
        self.after(0, lambda: self._write(f"Parsing CV with {LLM_PROVIDER}…\n", "dim"))

        from app.services.cv_parser import (
            _extract_text_from_pdf, _call_llm, _parse_openai_response,
            CV_EXTRACTION_PROMPT, _mock_cv,
        )
        from app.llm_provider import is_configured
        raw_text = _extract_text_from_pdf(cv_path)

        if is_configured() and not mock_mode:
            import json as _json
            prompt = CV_EXTRACTION_PROMPT.format(cv_text=raw_text[:8000])
            raw_response = _call_llm(prompt)
            data = _parse_openai_response(raw_response)
            parsed_cv = ParsedCV(
                skills=[s.strip().lower() for s in data.get("skills", [])],
                years_experience=data.get("years_experience"),
                job_titles=data.get("job_titles", []),
                education=data.get("education"),
                industries=data.get("industries", []),
                summary=data.get("summary"),
                raw_text=raw_text,
            )
        else:
            parsed_cv = _mock_cv(self.exp_var.get(), raw_text=raw_text)

        skills_found = len(parsed_cv.skills)
        self.after(0, lambda: self._write(f"✓ Found {skills_found} skills in your CV\n", "strength"))
        if parsed_cv.summary:
            self.after(0, lambda: self._write(f"  {parsed_cv.summary[:100]}…\n", "dim"))

        # Step 3: Pre-filter
        self.after(0, lambda: self._set_status("Pre-filtering jobs…", SUBTEXT))
        cities = [c.strip() for c in self.cities_var.get().split(",")]
        prefiltered = prefilter_jobs(
            db=db,
            parsed_cv=parsed_cv,
            preferred_cities=cities,
            work_mode=self.work_mode_var.get(),
            years_experience=self.exp_var.get(),
            preferred_roles=[],
        )
        n_pre = len(prefiltered)
        self.after(0, lambda: self._write(f"✓ Pre-filtered {total_jobs:,} → {n_pre} candidate jobs\n", "strength"))

        if not prefiltered:
            db.close()
            raise ValueError("No jobs matched your city/work-mode criteria. Try broader preferences.")

        # Step 4: Deep match
        mode_label = "mock" if mock_mode else LLM_PROVIDER
        self.after(0, lambda: self._set_status(f"Deep matching {n_pre} jobs via {mode_label}…", SUBTEXT))
        self.after(0, lambda: self._write(f"Deep matching via {mode_label} (may take ~20s)…\n", "dim"))

        top_matches = await deep_match(parsed_cv, prefiltered)

        # Step 5: Save CSV
        response = MatchResponse(
            candidate_name=name,
            candidate_email=email,
            total_jobs_in_db=total_jobs,
            jobs_after_prefilter=n_pre,
            top_matches=top_matches,
        )
        csv_path = save_results_csv(response)
        db.close()

        return response, csv_path

    def _pipeline_done(self, result):
        response, csv_path = result
        self._last_csv = csv_path

        # Stop progress bar
        self.progress.stop()
        self.progress.pack_forget()
        self.run_btn.config(state="normal", text="▶  Find My Top 5 Jobs")

        # Render results
        self._clear_results()
        self._render_results(response)

        # Show CSV button
        self.csv_btn.pack(fill="x", pady=(8, 0))
        self._set_status(f"Done  ·  CSV saved to {csv_path.name}", colour=ACCENT2)

    def _pipeline_error(self, error_msg):
        self.progress.stop()
        self.progress.pack_forget()
        self.run_btn.config(state="normal", text="▶  Find My Top 5 Jobs")
        self._write(f"\n❌ Error: {error_msg}\n", "missing")
        self._set_status(f"Error: {error_msg[:80]}", colour=RED)

    # ─────────────────────────────────────────────────────────────────
    # RESULTS RENDERING
    # ─────────────────────────────────────────────────────────────────

    def _clear_results(self):
        self.results_text.config(state="normal")
        self.results_text.delete("1.0", "end")
        self.results_text.config(state="disabled")

    def _write(self, text, tag="bullet"):
        self.results_text.config(state="normal")
        self.results_text.insert("end", text, tag)
        self.results_text.see("end")
        self.results_text.config(state="disabled")

    def _render_results(self, response):
        self.results_text.config(state="normal")
        self.results_text.delete("1.0", "end")

        self._write("=" * 72 + "\n", "divider")
        self._write(f"  TOP {len(response.top_matches)} MATCHES  for {response.candidate_name}\n", "header")
        self._write(f"  {response.total_jobs_in_db:,} jobs scanned  →  {response.jobs_after_prefilter} shortlisted  →  AI ranked top 5\n", "dim")
        self._write("=" * 72 + "\n\n", "divider")

        for m in response.top_matches:
            bar_filled = int(m.score / 5)
            bar = "█" * bar_filled + "░" * (20 - bar_filled)

            self._write(f"  #{m.rank}  {m.job_title}\n", "header")
            self._write(f"      @ {m.company_name}", "section")

            loc_parts = []
            if m.location_city:  loc_parts.append(m.location_city)
            if m.work_mode:      loc_parts.append(m.work_mode.title())
            if m.seniority_level: loc_parts.append(m.seniority_level.title())
            if loc_parts:
                self._write(f"  |  {' | '.join(loc_parts)}", "dim")
            self._write("\n", "dim")

            self._write(f"\n      MATCH SCORE  {m.score:.0f}%   [{bar}]\n", "score")
            if m.reasoning:
                self._write(f"      {m.reasoning}\n", "dim")

            if m.why_apply:
                self._write("\n      WHY APPLY\n", "section")
                for line in m.why_apply.split(". "):
                    line = line.strip().rstrip(".")
                    if line:
                        self._write(f"        •  {line}.\n", "bullet")

            if m.strengths:
                self._write("\n      YOUR STRENGTHS\n", "section")
                for line in m.strengths.split(". "):
                    line = line.strip().rstrip(".")
                    if line:
                        self._write(f"        ✓  {line}.\n", "strength")

            if m.weaknesses:
                self._write("\n      GAPS TO ADDRESS\n", "section")
                for line in m.weaknesses.split(". "):
                    line = line.strip().rstrip(".")
                    if line:
                        self._write(f"        ✗  {line}.\n", "weakness")

            if m.matching_skills:
                self._write(f"\n      Matched  :  {', '.join(m.matching_skills)}\n", "strength")
            if m.missing_skills:
                self._write(f"      Missing  :  {', '.join(m.missing_skills)}\n", "missing")

            if m.job_url:
                self._write(f"\n      Apply  →  ", "dim")
                url = m.job_url
                self._write(f"{url[:90]}{'…' if len(url) > 90 else ''}\n", "link")

            self._write("\n" + "─" * 72 + "\n\n", "divider")

        self.results_text.config(state="disabled")


# ═══════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # Suppress noisy loggers in GUI mode
    logging.basicConfig(level=logging.WARNING)
    logging.getLogger("app").setLevel(logging.WARNING)

    app = JobMatchApp()
    app.mainloop()
