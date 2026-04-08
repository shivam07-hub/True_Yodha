"""
tagger_ui.py — Browser-based HITL skill tagger (Streamlit)

Replaces the terminal copy-paste workflow with a browser UI.

Run:
    cd /Users/incognito/True_Yodha
    source .venv/bin/activate
    streamlit run tools/tagger_ui.py
"""

import json
from pathlib import Path

import openpyxl
import streamlit as st

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_JSON = PROJECT_ROOT / "skill_taxonomy mapping" / "taxonomy.json"
MASTER_OUTPUT_DIR = (
    PROJECT_ROOT / "Market Data" / "Job_Scrapers" / "All_CSV_Outputs" / "Master_Output"
)
CACHE_FILE = PROJECT_ROOT / "database" / "skill_tag_cache.json"

DEFAULT_CHUNK_SIZE = 30
VALID_QUALIFICATIONS = {"High School", "Diploma", "Bachelor's", "Master's", "MBA", "PhD", "Any"}


# ── Data loading (cached so Streamlit doesn't re-read on every interaction) ───

@st.cache_data
def load_taxonomy_keys() -> list[str]:
    with open(TAXONOMY_JSON, encoding="utf-8") as f:
        taxonomy = json.load(f)
    keys: set[str] = set()
    for _cat, skills in taxonomy["categories"].items():
        for skill_key in skills:
            keys.add(skill_key)
    return sorted(keys)


@st.cache_data
def load_all_jobs() -> list[dict]:
    master_files = sorted(MASTER_OUTPUT_DIR.glob("ALL_JOBS_NORMALIZED_*.xlsx"))
    if not master_files:
        return []
    seen: set[str] = set()
    jobs: list[dict] = []
    for xlsx_path in master_files:
        wb = openpyxl.load_workbook(xlsx_path, read_only=True)
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        headers = [str(h) for h in next(rows)]
        for row in rows:
            col = {h: row[i] for i, h in enumerate(headers)}
            jid = str(col.get("job_id", "")).strip()
            title = str(col.get("title", "")).strip()
            if not jid or not title or title == "See full role description":
                continue
            if jid in seen:
                continue
            seen.add(jid)
            jobs.append({
                "job_id": jid,
                "title": title,
                "company": str(col.get("company_name") or "").strip() or "Unknown",
                "raw_jd_text": str(col.get("raw_jd_text") or "").strip() or None,
            })
        wb.close()
    return jobs


def load_cache() -> dict[str, dict]:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


def group_by_company(jobs: list[dict], cache: dict) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for job in jobs:
        if job["job_id"] in cache:
            continue
        company = job["company"]
        groups.setdefault(company, []).append(job)
    return dict(sorted(groups.items(), key=lambda x: len(x[1]), reverse=True))


# ── Prompt builder ────────────────────────────────────────────────────────────

def build_prompt(jobs: list[dict], taxonomy_keys: list[str]) -> str:
    taxonomy_str = "\n".join(f"  - {k}" for k in taxonomy_keys)
    jobs_str = "\n\n---\n\n".join(
        f"JOB_ID: {j['job_id']}\nTITLE: {j['title']}\n"
        f"DESCRIPTION:\n{(j.get('raw_jd_text') or 'No description provided.')[:2500]}"
        for j in jobs
    )
    ids = [j["job_id"] for j in jobs]
    return f"""You are an expert job analyst. Tag each job with skills from the taxonomy below.

SKILL TAXONOMY — use ONLY these exact keys (lowercase):
{taxonomy_str}

JOBS TO TAG ({len(jobs)} jobs):
{jobs_str}

---

For each job return a JSON array — one object per job:

[
  {{
    "job_id": "<exact job_id from above>",
    "required_skills": ["<taxonomy key>", ...],
    "preferred_skills": ["<taxonomy key>", ...],
    "unknown_skills": ["<raw skill not in taxonomy>", ...],
    "min_years_experience": <integer or null>,
    "min_qualification": "<High School|Diploma|Bachelor's|Master's|MBA|PhD|Any>"
  }}
]

Rules:
- required_skills: essential skills inferred from the description
- preferred_skills: nice-to-have; cannot overlap with required_skills
- unknown_skills: clearly needed skills NOT in the taxonomy, max 5, raw lowercase
- Return ALL {len(ids)} job IDs: {ids}
- Return valid JSON only — no explanation text outside the array"""


# ── Response validator ────────────────────────────────────────────────────────

def validate_and_parse(text: str, valid_keys: set[str]) -> tuple[list[dict] | None, str]:
    """Returns (parsed_list, error_message). error_message is '' on success."""
    text = text.strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("[")
    if start == -1:
        return None, "No JSON array found in response."
    try:
        result, _ = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError as e:
        return None, f"JSON parse error: {e}"
    if not isinstance(result, list):
        return None, "Response is not a JSON array."

    validated: list[dict] = []
    for item in result:
        if not isinstance(item, dict) or not item.get("job_id"):
            continue
        required = [k for k in item.get("required_skills", []) if k in valid_keys]
        preferred = [
            k for k in item.get("preferred_skills", [])
            if k in valid_keys and k not in required
        ]
        raw_years = item.get("min_years_experience")
        try:
            years: int | None = int(float(raw_years)) if raw_years and float(raw_years) > 0 else None
        except (ValueError, TypeError):
            years = None
        raw_qual = str(item.get("min_qualification", "Any")).strip()
        unknown = [
            s.strip().lower() for s in item.get("unknown_skills", [])
            if isinstance(s, str) and s.strip() and s.strip().lower() not in valid_keys
        ]
        validated.append({
            "job_id": str(item["job_id"]),
            "required_skills": required,
            "preferred_skills": preferred,
            "unknown_skills": list(dict.fromkeys(unknown))[:5],
            "min_years_experience": years,
            "min_qualification": raw_qual if raw_qual in VALID_QUALIFICATIONS else "Any",
        })
    if not validated:
        return None, "Parsed but found no valid job entries."
    return validated, ""


# ── Session state helpers ─────────────────────────────────────────────────────

def init_state() -> None:
    defaults = {
        "selected_company": None,
        "chunk_index": 0,
        "cache": None,
        "last_save_count": 0,
        "paste_key": 0,  # increment to clear the textarea
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def get_cache() -> dict[str, dict]:
    if st.session_state.cache is None:
        st.session_state.cache = load_cache()
    return st.session_state.cache


# ── Main UI ───────────────────────────────────────────────────────────────────

def main() -> None:
    st.set_page_config(page_title="Mirror — Job Tagger", layout="wide")
    init_state()

    taxonomy_keys = load_taxonomy_keys()
    valid_keys = set(taxonomy_keys)
    all_jobs = load_all_jobs()

    if not all_jobs:
        st.error(f"No master xlsx files found in:\n`{MASTER_OUTPUT_DIR}`")
        return

    cache = get_cache()
    groups = group_by_company(all_jobs, cache)
    total_tagged = len(cache)
    total_jobs = len(all_jobs)
    total_untagged = sum(len(v) for v in groups.values())

    # ── Sidebar ───────────────────────────────────────────────────────────────
    with st.sidebar:
        st.title("Mirror Tagger")
        st.caption("Human-in-the-loop skill tagging")

        st.metric("Tagged", f"{total_tagged:,} / {total_jobs:,}")
        st.progress(total_tagged / total_jobs if total_jobs else 0)
        st.caption(f"{total_untagged:,} jobs remaining across {len(groups)} companies")

        st.divider()

        if not groups:
            st.success("All jobs tagged!")
            return

        st.subheader("Companies")
        company_options = [f"{c} ({len(v)} jobs)" for c, v in groups.items()]
        company_keys = list(groups.keys())

        # Find current index
        current_idx = 0
        if st.session_state.selected_company in company_keys:
            current_idx = company_keys.index(st.session_state.selected_company)

        selected_label = st.radio(
            "Pick a company",
            company_options,
            index=current_idx,
            label_visibility="collapsed",
        )
        selected_company = company_keys[company_options.index(selected_label)]

        if selected_company != st.session_state.selected_company:
            st.session_state.selected_company = selected_company
            st.session_state.chunk_index = 0
            st.session_state.paste_key += 1
            st.rerun()

    # ── Main area ─────────────────────────────────────────────────────────────
    company = st.session_state.selected_company
    if company is None:
        company = company_keys[0]
        st.session_state.selected_company = company

    jobs = groups.get(company, [])
    chunk_size = DEFAULT_CHUNK_SIZE
    total_chunks = max(1, (len(jobs) + chunk_size - 1) // chunk_size)
    chunk_idx = min(st.session_state.chunk_index, total_chunks - 1)

    chunk_start = chunk_idx * chunk_size
    chunk = jobs[chunk_start: chunk_start + chunk_size]

    st.title(company)
    col1, col2, col3 = st.columns([2, 2, 3])
    col1.metric("Jobs in company", len(jobs))
    col2.metric("Chunk", f"{chunk_idx + 1} / {total_chunks}")
    col3.metric("Jobs in chunk", len(chunk))

    st.divider()

    # ── Prompt panel ─────────────────────────────────────────────────────────
    prompt_text = build_prompt(chunk, taxonomy_keys)

    st.subheader("Step 1 — Copy this prompt")
    st.info("Select all, copy, paste into Claude or ChatGPT, then paste the JSON response below.")
    st.code(prompt_text, language=None)

    st.divider()

    # ── Response panel ────────────────────────────────────────────────────────
    st.subheader("Step 2 — Paste the JSON response")

    paste_widget_key = f"paste_{st.session_state.paste_key}"
    response_text = st.text_area(
        "Paste JSON here",
        height=280,
        key=paste_widget_key,
        placeholder='[\n  {\n    "job_id": "...",\n    "required_skills": [...],\n    ...\n  }\n]',
        label_visibility="collapsed",
    )

    col_submit, col_skip, col_prev = st.columns([2, 1, 1])

    with col_submit:
        if st.button("Save & next chunk", type="primary", use_container_width=True):
            if not response_text.strip():
                st.error("Paste a response first.")
            else:
                results, err = validate_and_parse(response_text, valid_keys)
                if results is None:
                    st.error(f"Could not parse response: {err}")
                else:
                    for r in results:
                        jid = r.pop("job_id")
                        cache[jid] = r
                    save_cache(cache)
                    st.session_state.last_save_count = len(results)
                    # Advance chunk or company
                    if chunk_idx + 1 < total_chunks:
                        st.session_state.chunk_index = chunk_idx + 1
                    else:
                        # Company done — move to next
                        remaining_companies = [c for c in company_keys if c != company]
                        if remaining_companies:
                            st.session_state.selected_company = remaining_companies[0]
                            st.session_state.chunk_index = 0
                        else:
                            st.session_state.selected_company = None
                    st.session_state.paste_key += 1
                    st.rerun()

    with col_skip:
        if st.button("Skip chunk", use_container_width=True):
            if chunk_idx + 1 < total_chunks:
                st.session_state.chunk_index = chunk_idx + 1
            else:
                remaining_companies = [c for c in company_keys if c != company]
                st.session_state.selected_company = remaining_companies[0] if remaining_companies else None
                st.session_state.chunk_index = 0
            st.session_state.paste_key += 1
            st.rerun()

    with col_prev:
        if st.button("Prev chunk", use_container_width=True, disabled=chunk_idx == 0):
            st.session_state.chunk_index = chunk_idx - 1
            st.session_state.paste_key += 1
            st.rerun()

    if st.session_state.last_save_count:
        st.success(f"Saved {st.session_state.last_save_count} jobs to cache.")

    # ── Preview of chunk jobs ─────────────────────────────────────────────────
    with st.expander(f"Chunk job list ({len(chunk)} jobs)", expanded=False):
        for j in chunk:
            st.write(f"**{j['job_id']}** — {j['title']}")


if __name__ == "__main__":
    main()
