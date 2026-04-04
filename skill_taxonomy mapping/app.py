"""
app.py — Streamlit human-in-the-loop skill taxonomy review tool.

Run with:
    streamlit run app.py

Pages (via sidebar):
  📝 Review  — Work through jobs one by one; tag skills against the taxonomy
  📚 Taxonomy — Browse all approved skills by category
  📊 Dashboard — Progress metrics, per-company stats, April 2026 demand chart

Two annotation modes:
  Mode A (LLM-assisted): job has Claude-extracted skills → confirm/edit suggestions
  Mode B (human-direct): job has no extracted skills → click taxonomy chips to tag directly
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd
import streamlit as st

from config import DB_PATH, SKILL_CATEGORY_HINTS, TAXONOMY_CATEGORIES, TAXONOMY_PATH

# ══════════════════════════════════════════════════════════════════════════════
#  Page config
# ══════════════════════════════════════════════════════════════════════════════

st.set_page_config(
    page_title="Skill Taxonomy Review",
    page_icon="🏷️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ══════════════════════════════════════════════════════════════════════════════
#  DB connection  (cached so Streamlit reuses it across reruns)
# ══════════════════════════════════════════════════════════════════════════════

@st.cache_resource
def get_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


conn = get_conn()


# ══════════════════════════════════════════════════════════════════════════════
#  DB query helpers
# ══════════════════════════════════════════════════════════════════════════════

def get_stats() -> dict:
    total      = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    extracted  = conn.execute("SELECT COUNT(*) FROM jobs WHERE extraction_status='extracted'").fetchone()[0]
    reviewed   = conn.execute("SELECT COUNT(*) FROM jobs WHERE review_status='reviewed'").fetchone()[0]
    skipped    = conn.execute("SELECT COUNT(*) FROM jobs WHERE review_status='skipped'").fetchone()[0]
    # Count ALL pending-review jobs, not just LLM-extracted ones
    pending_rv = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE review_status='pending'"
    ).fetchone()[0]
    tax_size   = conn.execute("SELECT COUNT(*) FROM taxonomy").fetchone()[0]
    return dict(total=total, extracted=extracted, reviewed=reviewed,
                skipped=skipped, pending_review=pending_rv, taxonomy_size=tax_size)


def get_companies() -> list[str]:
    rows = conn.execute("SELECT company_name FROM companies ORDER BY company_name").fetchall()
    return ["All"] + [r[0] for r in rows]


def get_next_job(company_filter: str, country_filter: str = "All") -> dict | None:
    """Return the next job to review.

    LLM-extracted jobs come first (best review experience); all other pending
    jobs follow so that every job in the DB can be annotated without running
    extract_skills.py first.
    """
    q = """
        SELECT j.job_id, j.company_name, j.title, j.business_unit,
               j.seniority_level, j.industry, j.location_city,
               j.work_mode, j.job_url, j.raw_jd_text, j.date_posted,
               j.extraction_status,
               COUNT(es.id) AS skill_count
        FROM   jobs j
        LEFT   JOIN extracted_skills es ON es.job_id=j.job_id AND es.company_name=j.company_name
        WHERE  j.review_status='pending'
    """
    params = []
    if country_filter and country_filter != "All":
        q += " AND j.location_country = ?"
        params.append(country_filter)
    if company_filter and company_filter != "All":
        q += " AND j.company_name=?"
        params.append(company_filter)
    q += """
        GROUP BY j.job_id, j.company_name
        ORDER BY
          CASE j.extraction_status WHEN 'extracted' THEN 0 ELSE 1 END,
          j.company_name,
          j.date_posted DESC
        LIMIT 1
    """
    row = conn.execute(q, params).fetchone()
    return dict(row) if row else None


def get_job_skills(job_id: str, company: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, skill_name, skill_raw, suggested_classification, evidence
        FROM   extracted_skills
        WHERE  job_id=? AND company_name=?
        ORDER  BY suggested_classification DESC, skill_name
        """,
        (job_id, company),
    ).fetchall()
    return [dict(r) for r in rows]


def get_taxonomy_chips() -> dict[str, list[str]]:
    """Return taxonomy skills grouped by category.

    Reads from DB first; falls back to taxonomy.json if the taxonomy table is empty.
    Returns { category: [skill_name, ...] }
    """
    rows = conn.execute(
        "SELECT skill_name, category FROM taxonomy ORDER BY category, skill_name"
    ).fetchall()

    if rows:
        result: dict[str, list[str]] = {}
        for r in rows:
            cat = r[1] or "Other / Uncategorized"
            result.setdefault(cat, []).append(r[0])
        return result

    # Fallback: parse taxonomy.json
    if TAXONOMY_PATH.exists():
        with open(TAXONOMY_PATH, encoding="utf-8") as f:
            data = json.load(f)
        result = {}
        for entry in data.get("skills_by_demand", []):
            cat = entry.get("category", "Other / Uncategorized")
            result.setdefault(cat, []).append(entry["skill"])
        return result

    return {}


def guess_category(skill_name: str) -> str:
    return SKILL_CATEGORY_HINTS.get(skill_name.lower(), "Other / Uncategorized")


def save_review(job: dict, skill_decisions: dict) -> None:
    """Mode A save: skill_decisions = { skill_id: {"classification": ..., "category": ...} }"""
    now = datetime.now().isoformat()

    for skill_id, decision in skill_decisions.items():
        cls = decision["classification"]
        cat = decision["category"]

        conn.execute(
            "UPDATE extracted_skills SET user_classification=?, category=?, reviewed_at=? WHERE id=?",
            (cls, cat, now, skill_id),
        )

        if cls == "ignore":
            continue

        row = conn.execute("SELECT skill_name, job_id, company_name FROM extracted_skills WHERE id=?", (skill_id,)).fetchone()
        if not row:
            continue
        skill_name, first_job, first_company = row[0], row[1], row[2]

        primary_delta   = 1 if cls == "primary"   else 0
        secondary_delta = 1 if cls == "secondary" else 0

        existing = conn.execute("SELECT skill_name FROM taxonomy WHERE skill_name=?", (skill_name,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE taxonomy
                SET    category        = ?,
                       primary_count   = primary_count   + ?,
                       secondary_count = secondary_count + ?
                WHERE  skill_name=?
                """,
                (cat, primary_delta, secondary_delta, skill_name),
            )
        else:
            conn.execute(
                """
                INSERT INTO taxonomy
                    (skill_name, category, aliases, first_seen_job_id, first_seen_company,
                     primary_count, secondary_count)
                VALUES (?,?,?,?,?,?,?)
                """,
                (skill_name, cat, "[]", first_job, first_company, primary_delta, secondary_delta),
            )

    conn.execute(
        "UPDATE jobs SET review_status='reviewed', reviewed_at=? WHERE job_id=? AND company_name=?",
        (now, job["job_id"], job["company_name"]),
    )
    conn.commit()
    export_taxonomy_json()


def save_review_direct(job: dict, selected: dict[str, str]) -> None:
    """Mode B save: human-direct taxonomy chip selection.

    selected = { skill_name: "primary" | "secondary" }
    Writes to extracted_skills for provenance, upserts taxonomy counts, marks job reviewed.
    """
    now = datetime.now().isoformat()

    for skill_name, cls in selected.items():
        row = conn.execute("SELECT category FROM taxonomy WHERE skill_name=?", (skill_name,)).fetchone()
        cat = row[0] if row else guess_category(skill_name)

        primary_delta   = 1 if cls == "primary"   else 0
        secondary_delta = 1 if cls == "secondary" else 0

        # Record in extracted_skills for provenance / taxonomy page first-seen
        conn.execute(
            """
            INSERT OR IGNORE INTO extracted_skills
                (job_id, company_name, skill_name, skill_raw, suggested_classification,
                 user_classification, category, evidence, reviewed_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (job["job_id"], job["company_name"], skill_name, skill_name,
             cls, cls, cat, "human direct", now),
        )

        if conn.execute("SELECT 1 FROM taxonomy WHERE skill_name=?", (skill_name,)).fetchone():
            conn.execute(
                """
                UPDATE taxonomy
                SET primary_count   = primary_count   + ?,
                    secondary_count = secondary_count + ?
                WHERE skill_name=?
                """,
                (primary_delta, secondary_delta, skill_name),
            )
        else:
            conn.execute(
                """
                INSERT INTO taxonomy
                    (skill_name, category, aliases, first_seen_job_id, first_seen_company,
                     primary_count, secondary_count)
                VALUES (?,?,?,?,?,?,?)
                """,
                (skill_name, cat, "[]", job["job_id"], job["company_name"],
                 primary_delta, secondary_delta),
            )

    conn.execute(
        "UPDATE jobs SET review_status='reviewed', extraction_status='extracted', reviewed_at=? "
        "WHERE job_id=? AND company_name=?",
        (now, job["job_id"], job["company_name"]),
    )
    conn.commit()
    export_taxonomy_json()


def add_manual_skill(job: dict, skill_name: str, classification: str, category: str, evidence: str = "manually added") -> None:
    name = skill_name.strip().lower()
    if not name:
        return
    conn.execute(
        """
        INSERT OR IGNORE INTO extracted_skills
            (job_id, company_name, skill_name, skill_raw, suggested_classification,
             user_classification, category, evidence)
        VALUES (?,?,?,?,?,?,?,?)
        """,
        (job["job_id"], job["company_name"], name, skill_name.strip(),
         classification, None, category, evidence),
    )
    conn.commit()


def export_taxonomy_json() -> int:
    """Write taxonomy.json sorted by demand (primary + secondary DESC). Returns skill count."""
    rows = conn.execute(
        """
        SELECT skill_name, category, aliases, primary_count, secondary_count
        FROM   taxonomy
        ORDER  BY (primary_count + secondary_count) DESC, skill_name
        """
    ).fetchall()

    skills_by_demand = [
        {
            "skill":     r[0],
            "category":  r[1] or "Other / Uncategorized",
            "total_jobs": r[3] + r[4],
            "required":  r[3],
            "preferred": r[4],
        }
        for r in rows
    ]

    categories: dict = {}
    for r in rows:
        cat = r[1] or "Other / Uncategorized"
        if cat not in categories:
            categories[cat] = {}
        categories[cat][r[0]] = {
            "aliases":         json.loads(r[2] or "{}"),
            "primary_count":   r[3],
            "secondary_count": r[4],
        }

    out = {
        "version":          "2.0",
        "generated_at":     datetime.now().strftime("%Y-%m-%d %H:%M"),
        "total_skills":     len(rows),
        "skills_by_demand": skills_by_demand,
        "categories":       categories,
    }

    with open(TAXONOMY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    return len(rows)


# ══════════════════════════════════════════════════════════════════════════════
#  Sidebar
# ══════════════════════════════════════════════════════════════════════════════

stats     = get_stats()
companies = get_companies()

with st.sidebar:
    st.title("🏷️ Skill Taxonomy")
    st.caption("Human-in-the-loop review tool")
    st.divider()

    # Progress — reflects ALL pending jobs, not just LLM-extracted ones
    reviewable = stats["reviewed"] + stats["pending_review"] + stats["skipped"]
    if reviewable > 0:
        pct = stats["reviewed"] / reviewable
        st.metric("Jobs Reviewed", f"{stats['reviewed']} / {reviewable}")
        st.progress(pct, text=f"{pct*100:.1f}% complete")
    else:
        st.info("No jobs in DB yet.\nRun `python init_db.py` first.")

    col1, col2 = st.columns(2)
    col1.metric("📚 Skills",  stats["taxonomy_size"])
    col2.metric("⏳ In Queue", stats["pending_review"])

    if stats["extracted"] > 0:
        st.info(
            f"⚡ {stats['extracted']} jobs have LLM-extracted skills (Mode A). "
            f"Remaining jobs use direct chip annotation (Mode B)."
        )

    st.divider()

    # Country filter — defaults to India
    if "country_filter" not in st.session_state:
        st.session_state.country_filter = "India"

    other_countries = [
        r[0] for r in conn.execute(
            "SELECT DISTINCT location_country FROM jobs "
            "WHERE location_country IS NOT NULL AND location_country NOT IN ('', 'India') "
            "ORDER BY 1"
        ).fetchall()
    ]
    country_options = ["All", "India"] + other_countries
    st.session_state.country_filter = st.selectbox(
        "🌏 Country",
        options=country_options,
        index=country_options.index(st.session_state.country_filter)
        if st.session_state.country_filter in country_options else 1,
    )

    # Company filter
    if "company_filter" not in st.session_state:
        st.session_state.company_filter = "All"

    st.session_state.company_filter = st.selectbox(
        "🏢 Filter by Company",
        options=companies,
        index=companies.index(st.session_state.company_filter)
        if st.session_state.company_filter in companies else 0,
    )

    st.divider()

    # Bulk-approve toggle (Mode A only)
    if "bulk_approve" not in st.session_state:
        st.session_state.bulk_approve = False
    st.session_state.bulk_approve = st.toggle(
        "⚡ Auto-classify known skills",
        value=st.session_state.bulk_approve,
        help="Mode A only: pre-fills classification for skills already in the taxonomy.",
    )

    st.divider()
    page = st.radio("Navigate", ["📝 Review", "📚 Taxonomy", "📊 Dashboard"])

    st.divider()
    if st.button("💾 Export taxonomy.json", use_container_width=True):
        n = export_taxonomy_json()
        st.success(f"✅ Exported {n} skills to taxonomy.json")


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE: Review
# ══════════════════════════════════════════════════════════════════════════════

if page == "📝 Review":

    company_filter = st.session_state.company_filter
    country_filter = st.session_state.get("country_filter", "India")
    job = get_next_job(company_filter, country_filter)

    if not job:
        if company_filter != "All":
            st.success(f"🎉 All {company_filter} jobs have been reviewed!")
            st.info("Switch the company filter to 'All' to review other companies.")
        else:
            st.success("🎉 All jobs have been reviewed!")
            st.info(
                "Run `python daily_monitor.py` after each scrape to detect new jobs."
            )
        st.stop()

    # Track which job we're reviewing — clear widget state on job change
    job_key = f"{job['company_name']}::{job['job_id']}"
    if st.session_state.get("current_job_key") != job_key:
        keys_to_clear = [k for k in st.session_state
                         if k.startswith("cls_") or k.startswith("cat_") or k.startswith("chip_")]
        for k in keys_to_clear:
            del st.session_state[k]
        st.session_state.current_job_key = job_key

    # Determine annotation mode
    skills = get_job_skills(job["job_id"], job["company_name"])
    mode_b = len(skills) == 0  # True = direct chip annotation

    # ── Job header ────────────────────────────────────────────────────────────
    h_col1, h_col2, h_col3, h_col4 = st.columns([5, 1, 1, 1])
    with h_col1:
        st.subheader(f"📋 {job['title']}")
        meta_parts = [job["company_name"], job.get("seniority_level"), job.get("industry")]
        if job.get("location_city"):
            meta_parts.append(job["location_city"])
        st.caption(" · ".join(p for p in meta_parts if p))

    with h_col2:
        mode_label = "🖐 Direct" if mode_b else "🤖 LLM"
        st.caption(mode_label)
        if st.button("⏭ Skip", use_container_width=True):
            conn.execute(
                "UPDATE jobs SET review_status='skipped' WHERE job_id=? AND company_name=?",
                (job["job_id"], job["company_name"]),
            )
            conn.commit()
            st.session_state.pop("current_job_key", None)
            st.rerun()

    with h_col3:
        if job.get("job_url"):
            st.link_button("🔗 JD", job["job_url"], use_container_width=True)

    _h_col4 = h_col4

    # ── JD snippet ────────────────────────────────────────────────────────────
    jd = job.get("raw_jd_text") or ""

    # ══════════════════════════════════════════════════════════════════════════
    #  MODE B — Direct taxonomy chip annotation
    # ══════════════════════════════════════════════════════════════════════════
    if mode_b:
        st.info(
            "🖐 **Direct annotation mode** — no LLM extraction for this job. "
            "Read the JD and click the taxonomy skills that apply.",
            icon=None,
        )

        left_col, right_col = st.columns([3, 2])

        with left_col:
            st.markdown("#### 📄 Job Description")
            st.text_area(
                label="jd_text",
                value=jd[:6000] + ("…" if len(jd) > 6000 else ""),
                height=550,
                disabled=True,
                label_visibility="collapsed",
            )

        with right_col:
            st.markdown("#### 🏷️ Tag Skills")
            st.caption("Click once → 🟢 Primary (required)  ·  Click again → 🔵 Secondary  ·  Click again → deselect")

            taxonomy_chips = get_taxonomy_chips()

            # CSS to style the chip toggle buttons
            st.markdown("""
            <style>
            div[data-testid="stButton"] > button[kind="secondary"] {
                border-radius: 16px;
                padding: 2px 10px;
                font-size: 0.78rem;
                margin: 2px;
            }
            </style>
            """, unsafe_allow_html=True)

            for category, skill_list in sorted(taxonomy_chips.items()):
                with st.expander(f"**{category}** ({len(skill_list)})", expanded=True):
                    # Render chips in a flowing row
                    cols = st.columns(2)
                    for i, skill in enumerate(skill_list):
                        chip_key = f"chip_{skill}"
                        state = st.session_state.get(chip_key, "none")

                        if state == "primary":
                            label = f"✅ {skill}"
                        elif state == "secondary":
                            label = f"🔵 {skill}"
                        else:
                            label = skill

                        with cols[i % 2]:
                            if st.button(label, key=f"btn_{chip_key}", use_container_width=True):
                                # Cycle: none → primary → secondary → none
                                next_state = {"none": "primary", "primary": "secondary", "secondary": "none"}[state]
                                st.session_state[chip_key] = next_state
                                st.rerun()

            # Manual add for skills not in taxonomy
            with st.expander("➕ Add a skill not in the taxonomy"):
                m1, m2, m3, m4 = st.columns([2.5, 1.5, 2, 1])
                new_skill_name = m1.text_input("Skill name", placeholder="e.g. rust", key="new_skill_name_b")
                new_cls        = m2.radio("Classification", ["primary", "secondary"], horizontal=True, key="new_cls_b")
                new_cat        = m3.selectbox("Category", TAXONOMY_CATEGORIES, key="new_cat_b")
                m4.write(""); m4.write("")
                if m4.button("Add", key="add_manual_b") and new_skill_name.strip():
                    add_manual_skill(job, new_skill_name, new_cls, new_cat)
                    st.session_state.pop("new_skill_name_b", None)
                    st.rerun()

        st.divider()

        # Count how many chips are tagged for feedback
        tagged = {
            skill: st.session_state.get(f"chip_{skill}", "none")
            for cat_skills in taxonomy_chips.values()
            for skill in cat_skills
            if st.session_state.get(f"chip_{skill}", "none") != "none"
        }
        if tagged:
            primary_tagged   = [s for s, c in tagged.items() if c == "primary"]
            secondary_tagged = [s for s, c in tagged.items() if c == "secondary"]
            st.caption(
                f"Tagged: {len(primary_tagged)} primary · {len(secondary_tagged)} secondary"
            )
        else:
            st.caption("No skills tagged yet — or skip if no relevant skills.")

        save_col, _ = st.columns([1, 3])
        if save_col.button("✅ Save & Next →", type="primary", use_container_width=True):
            all_taxonomy_skills = [s for cat_skills in taxonomy_chips.values() for s in cat_skills]
            selected = {
                sk: st.session_state.get(f"chip_{sk}", "none")
                for sk in all_taxonomy_skills
                if st.session_state.get(f"chip_{sk}", "none") != "none"
            }
            save_review_direct(job, selected)
            st.session_state.pop("current_job_key", None)
            st.toast("✅ Saved! Loading next job…")
            st.rerun()

    # ══════════════════════════════════════════════════════════════════════════
    #  MODE A — LLM-assisted review (original behaviour, unchanged)
    # ══════════════════════════════════════════════════════════════════════════
    else:
        with _h_col4:
            with st.expander("📋 Prompt"):
                skills_str = ", ".join(s["skill_name"] for s in skills) or "none detected"
                copy_prompt = (
                    "You are a technical recruiter reviewing an IT job description.\n"
                    f"The extraction engine already identified these skills: {skills_str}\n"
                    "Review the JD below and list any IT/technical skills it MISSED "
                    "(return as comma-separated list only).\n\n"
                    "--- JD START ---\n"
                    f"{jd[:4000]}\n"
                    "--- JD END ---"
                )
                st.code(copy_prompt, language=None)

        with st.expander("📄 Full Job Description", expanded=False):
            st.text(jd[:4000] + ("…" if len(jd) > 4000 else ""))

        st.divider()

        taxonomy_map = {
            r[0]: {"category": r[1], "p": r[2], "s": r[3]}
            for r in conn.execute(
                "SELECT skill_name, category, primary_count, secondary_count FROM taxonomy"
            ).fetchall()
        }

        bulk_mode = st.session_state.get("bulk_approve", False)

        new_skills   = [s for s in skills if s["skill_name"] not in taxonomy_map]
        known_skills = [s for s in skills if s["skill_name"] in taxonomy_map]

        if bulk_mode:
            for s in known_skills:
                t = taxonomy_map[s["skill_name"]]
                sid = s["id"]
                if f"cls_{sid}" not in st.session_state:
                    st.session_state[f"cls_{sid}"] = "primary" if t["p"] >= t["s"] else "secondary"
                if f"cat_{sid}" not in st.session_state:
                    cat = t["category"] or guess_category(s["skill_name"])
                    st.session_state[f"cat_{sid}"] = cat if cat in TAXONOMY_CATEGORIES else "Other / Uncategorized"

        st.caption("🟢 Primary = required/must-have   🔵 Secondary = preferred/nice-to-have   ❌ Ignore = not a real skill")

        def _render_skill(skill: dict, is_new: bool) -> None:
            sid = skill["id"]
            cls_key = f"cls_{sid}"
            cat_key = f"cat_{sid}"

            if cls_key not in st.session_state:
                st.session_state[cls_key] = skill["suggested_classification"] or "secondary"
            if cat_key not in st.session_state:
                st.session_state[cat_key] = guess_category(skill["skill_name"])

            c1, c2, c3, c4 = st.columns([2.5, 1.3, 2.3, 2.5])

            with c1:
                badge = "  🆕" if is_new else ""
                st.markdown(f"**`{skill['skill_name']}`**{badge}")
                ev = (skill.get("evidence") or "").strip()
                if ev:
                    st.caption(f"*\"{ev[:90]}{'…' if len(ev) > 90 else ''}\"*")
                if is_new:
                    st.warning("🆕 First time seeing this skill — your classification sets the precedent.", icon=None)

            with c2:
                cls_icon = "🟢 primary" if skill["suggested_classification"] == "primary" else "🔵 secondary"
                st.caption(cls_icon)

            with c3:
                st.radio(
                    f"cls_{sid}",
                    options=["primary", "secondary", "ignore"],
                    index=["primary", "secondary", "ignore"].index(
                        st.session_state.get(cls_key, "secondary")
                    ),
                    horizontal=True,
                    label_visibility="collapsed",
                    key=cls_key,
                )

            with c4:
                current_cat = st.session_state.get(cat_key, "Other / Uncategorized")
                if current_cat not in TAXONOMY_CATEGORIES:
                    current_cat = "Other / Uncategorized"
                st.selectbox(
                    f"cat_{sid}",
                    options=TAXONOMY_CATEGORIES,
                    index=TAXONOMY_CATEGORIES.index(current_cat),
                    label_visibility="collapsed",
                    key=cat_key,
                )

            st.write("")

        if new_skills:
            st.markdown(f"#### 🆕 {len(new_skills)} new skill(s) — not yet in taxonomy")
            hdr1, hdr2, hdr3, hdr4 = st.columns([2.5, 1.3, 2.3, 2.5])
            hdr1.markdown("**Skill**"); hdr2.markdown("**LLM**")
            hdr3.markdown("**Your call**"); hdr4.markdown("**Category**")
            st.divider()
            for skill in new_skills:
                _render_skill(skill, is_new=True)
        elif bulk_mode:
            st.success(f"✅ No new skills — all {len(known_skills)} already in taxonomy.")

        if bulk_mode and known_skills:
            with st.expander(f"✅ {len(known_skills)} known skills — auto-classified (expand to override)"):
                hdr1, hdr2, hdr3, hdr4 = st.columns([2.5, 1.3, 2.3, 2.5])
                hdr1.markdown("**Skill**"); hdr2.markdown("**LLM**")
                hdr3.markdown("**Your call**"); hdr4.markdown("**Category**")
                st.divider()
                for skill in known_skills:
                    _render_skill(skill, is_new=False)
        elif known_skills:
            if new_skills:
                st.markdown(f"#### ✅ {len(known_skills)} known skill(s)")
            hdr1, hdr2, hdr3, hdr4 = st.columns([2.5, 1.3, 2.3, 2.5])
            hdr1.markdown("**Skill**"); hdr2.markdown("**LLM**")
            hdr3.markdown("**Your call**"); hdr4.markdown("**Category**")
            st.divider()
            for skill in known_skills:
                _render_skill(skill, is_new=False)

        with st.expander("➕ Add a skill Claude missed"):
            m1, m2, m3, m4 = st.columns([2.5, 1.5, 2, 1])
            new_skill_name = m1.text_input("Skill name", placeholder="e.g. rust", key="new_skill_name")
            new_cls        = m2.radio("Classification", ["primary", "secondary"], horizontal=True, key="new_cls")
            new_cat        = m3.selectbox("Category", TAXONOMY_CATEGORIES, key="new_cat")
            m4.write(""); m4.write("")
            if m4.button("Add") and new_skill_name.strip():
                add_manual_skill(job, new_skill_name, new_cls, new_cat)
                st.session_state.pop("new_skill_name", None)
                st.rerun()

        st.divider()

        save_col, _ = st.columns([1, 3])
        if save_col.button("✅ Save & Next →", type="primary", use_container_width=True):
            all_skills = get_job_skills(job["job_id"], job["company_name"])
            decisions = {}
            for skill in all_skills:
                sid = skill["id"]
                decisions[sid] = {
                    "classification": st.session_state.get(f"cls_{sid}", "secondary"),
                    "category":       st.session_state.get(f"cat_{sid}", "Other / Uncategorized"),
                }
            save_review(job, decisions)
            st.session_state.pop("current_job_key", None)
            st.toast("✅ Saved! Loading next job…")
            st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE: Taxonomy
# ══════════════════════════════════════════════════════════════════════════════

elif page == "📚 Taxonomy":
    st.header("📚 Skill Taxonomy")
    st.caption("All approved skills from completed reviews. Export to taxonomy.json when you're done reviewing.")

    rows = conn.execute(
        """
        SELECT skill_name, category, primary_count, secondary_count,
               first_seen_company, added_at
        FROM   taxonomy
        ORDER  BY category, skill_name
        """
    ).fetchall()

    if not rows:
        st.info("No skills in taxonomy yet — complete some reviews first.")
        st.stop()

    df = pd.DataFrame(rows, columns=["Skill", "Category", "Primary Count", "Secondary Count", "First Seen @", "Added"])

    cats = ["All"] + sorted(df["Category"].unique().tolist())
    selected_cat = st.selectbox("Filter by category", cats)
    if selected_cat != "All":
        df = df[df["Category"] == selected_cat]

    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Primary Count":   st.column_config.NumberColumn(format="%d"),
            "Secondary Count": st.column_config.NumberColumn(format="%d"),
        },
    )
    st.caption(f"{len(df)} skills shown")

    st.divider()
    if st.button("💾 Export taxonomy.json", type="primary"):
        n = export_taxonomy_json()
        st.success(f"✅ Exported {n} skills to `skill_taxonomy/taxonomy.json`")


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE: Dashboard
# ══════════════════════════════════════════════════════════════════════════════

elif page == "📊 Dashboard":
    st.header("📊 Progress Dashboard")

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Total IT Jobs", stats["total"])
    m2.metric("Skills Extracted", stats["extracted"])
    m3.metric("Jobs Reviewed", stats["reviewed"])
    m4.metric("Taxonomy Size", stats["taxonomy_size"])

    st.divider()

    # Per-company progress
    st.subheader("Per-company breakdown")
    co_rows = conn.execute(
        """
        SELECT j.company_name,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE j.extraction_status='extracted') AS extracted,
               COUNT(*) FILTER (WHERE j.review_status='reviewed')      AS reviewed,
               COUNT(*) FILTER (WHERE j.review_status='skipped')       AS skipped,
               COUNT(*) FILTER (WHERE j.extraction_status='pending')   AS pending_extract
        FROM   jobs j
        GROUP  BY j.company_name
        ORDER  BY j.company_name
        """
    ).fetchall()

    co_df = pd.DataFrame(
        co_rows,
        columns=["Company", "Total", "Extracted", "Reviewed", "Skipped", "Pending Extraction"]
    )
    co_df["Review %"] = (co_df["Reviewed"] / co_df["Total"].clip(lower=1) * 100).round(1)

    st.dataframe(
        co_df,
        use_container_width=True,
        hide_index=True,
        column_config={"Review %": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%.1f%%")},
    )

    st.divider()

    # ── April 2026 skill demand ───────────────────────────────────────────────
    st.subheader("📅 Skill Demand by Month")

    available_months = conn.execute(
        """
        SELECT DISTINCT SUBSTR(j.date_posted, 1, 7) AS ym
        FROM   extracted_skills es
        JOIN   jobs j ON j.job_id=es.job_id AND j.company_name=es.company_name
        WHERE  j.date_posted IS NOT NULL AND j.date_posted != ''
        ORDER  BY ym DESC
        """
    ).fetchall()

    month_options = ["All time"] + [r[0] for r in available_months if r[0]]

    selected_month = st.selectbox(
        "Filter by month",
        options=month_options,
        index=month_options.index("2026-04") if "2026-04" in month_options else 0,
    )

    month_filter_sql = ""
    month_params: list = []
    if selected_month != "All time":
        month_filter_sql = "AND j.date_posted LIKE ?"
        month_params = [f"{selected_month}%"]

    demand_rows = conn.execute(
        f"""
        SELECT es.skill_name, t.category,
               SUM(CASE WHEN es.user_classification='primary'   THEN 1 ELSE 0 END) AS primary_cnt,
               SUM(CASE WHEN es.user_classification='secondary' THEN 1 ELSE 0 END) AS secondary_cnt,
               COUNT(DISTINCT es.job_id) AS job_count
        FROM   extracted_skills es
        JOIN   jobs j ON j.job_id=es.job_id AND j.company_name=es.company_name
        LEFT   JOIN taxonomy t ON t.skill_name=es.skill_name
        WHERE  es.user_classification IN ('primary','secondary')
        {month_filter_sql}
        GROUP  BY es.skill_name
        ORDER  BY job_count DESC
        LIMIT  30
        """,
        month_params,
    ).fetchall()

    if demand_rows:
        demand_df = pd.DataFrame(
            demand_rows,
            columns=["Skill", "Category", "Primary (Required)", "Secondary (Preferred)", "Jobs"]
        )
        label = f"Top 30 Skills — {selected_month}"
        st.caption(label)
        st.dataframe(
            demand_df,
            use_container_width=True,
            hide_index=True,
            column_config={
                "Primary (Required)":   st.column_config.NumberColumn(format="%d"),
                "Secondary (Preferred)": st.column_config.NumberColumn(format="%d"),
                "Jobs":                 st.column_config.NumberColumn(format="%d"),
            },
        )
        st.bar_chart(demand_df.set_index("Skill")["Jobs"].head(20))
    else:
        st.info("No reviewed skills yet for the selected period. Complete some reviews first.")

    st.divider()

    # All-time taxonomy top skills
    st.subheader("All-time taxonomy")
    tax_rows = conn.execute(
        """
        SELECT skill_name, category,
               primary_count + secondary_count AS total_mentions,
               primary_count, secondary_count
        FROM   taxonomy
        ORDER  BY total_mentions DESC
        LIMIT  30
        """
    ).fetchall()

    if tax_rows:
        tax_df = pd.DataFrame(tax_rows, columns=["Skill", "Category", "Total Mentions", "Primary", "Secondary"])
        st.dataframe(tax_df, use_container_width=True, hide_index=True)
    else:
        st.info("No skills in taxonomy yet.")

    st.divider()
    st.subheader("Daily monitor history")
    run_rows = conn.execute(
        "SELECT run_at, company_name, csv_file, new_jobs FROM daily_runs ORDER BY run_at DESC LIMIT 20"
    ).fetchall()
    if run_rows:
        run_df = pd.DataFrame(run_rows, columns=["Run At", "Company", "CSV", "New Jobs"])
        st.dataframe(run_df, use_container_width=True, hide_index=True)
    else:
        st.info("No daily runs recorded yet.")
