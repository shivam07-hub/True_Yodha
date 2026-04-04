# Taxonomy Changelog

> Log every change to `taxonomy.json` or `Skill_Taxonomy_v1.xlsx` here.
> Format: `YYYY-MM-DD | Changed by | What changed | Why`

---

## How to update the taxonomy

1. Update `Skill_Taxonomy_v1.xlsx` first (human-readable master)
2. Update `taxonomy.json` to match
3. Log the change below
4. Run `python3 backend/app/services/taxonomy_loader.py` to regenerate `database/seed_skills.sql`
5. Apply migration to Supabase

---

## Change Log

| Date | Changed by | Change | Reason |
|------|-----------|--------|--------|
| 2026-04-04 | Setup | Initial taxonomy established — 63 skills × 10 domains | v1.0 baseline |

