# CV Tier A — the machine must not jam, and must not lie

**Architecture spec #58. Implementation by Cursor. Written 2026-10-02 from the
CEO grill (D7, Shivam, 2026-09-30).** UI slices go through `/frontend-design`.

> **VERIFY IN CODE before building.** Line numbers are from `a213fee2`. Each
> fix is its own commit on `Develop`, six gates green. Tier B (#48 full schema,
> #51, #53, #54) waits for front-door numbers — see BACKLOG §5.

---

## 1 · The rule

A tailored CV is what a person sends to an employer. The machine may be slow
before it is wrong, and it may never block a CV that is fine. Five defects break
that today; each was measured on the Amazon Sr. PM build (BACKLOG §5,
2026-09-18) and re-anchored in code on 2026-10-02.

## 2 · The five fixes

### A · #52 — a blank cert is not a cert (smallest; do first)

`certs: [""]` prints a bare `CERTIFICATIONS` heading and a lone `•` into every
download. The bug exists **twice**: `frontend/lib/cv-compose.ts:176-185` and
`backend/app/services/cv_compose.py:135-144`.
**Fix at the shape, not the renderers:** a blank string is no content, so
ingest hygiene (`coerce_sections(ingest=True)`, CONTEXT §CV Structured Contract)
drops blank list items, and both renderers skip blank items through one shared
`is_blank` rule. Pinned by `test_cv_artifact_golden.py`: `certs [""]` renders no
heading in text, PDF or DOCX.

### B · Fabricated-role guard — a tailored CV cannot invent a job

Observed: v99 added `E.L.I.T.E Manager · Capgemini`, a job never held, and
promoted `Management Consulting Intern` to `Strategy Consultant`.
**Rule:** every `(company, title)` pair in a job document's `experience` must
match a pair in the person's master (normalised for case, whitespace and
punctuation), and its dates may not widen.
**Where:** the CV Version Writer Seam — `CVVersionsRepository.create` when
`job_id` is set, and `update_job_draft` (`repositories/cv.py:645`). Every
tailored write passes through it: weave apply (`routers/cv/weave.py:520`),
career (`routers/cv/career.py:396`), save (`routers/cv/versions.py:216`), job
draft (`:407`), polish (`:525`, `:693`), and the #56 Human Check.
**Errors:** the seam raises `FabricatedRoleError` naming the pair. Model-writing
paths (weave, polish) must not surface that as a 422 to the person: they drop
the invented entry before writing and log `metric cv.fabricated_role_dropped`.
A person who wants a new role adds it to the master first (fix D).

### C · #47 minimum — rewrites keep the sections the schema cannot hold

`routers/cv/skill_edit.py:212` and `:440` regenerate the master's `body_text`
through `cv_skill_edit.render_baseline_text` → `cv_compose.render_deterministic`,
which emits only the seven contract keys. Any other heading vanishes. Measured:
5 users lost `LEADERSHIP ROLES`, `RECOGNITIONS & ACHIEVEMENTS`, `PERSONAL
DETAILS`, `AWARDS & ACTIVITIES`, `CERTIFICATIONS & ACHIEVEMENTS`.
**Fix:** `render_deterministic(..., carry_unknown_from=previous_body_text)`
appends, verbatim and in their original order, every block whose heading is not
one of the seven. Every master rewrite passes the previous `body_text`. A test
feeds those five headings and asserts they survive.

### D · #50 — add a role or project on desktop; the phone edits the right document

- Desktop: `ProjectsBody` returns `null` when there are no projects
  (`components/cv/builder/cv-paper-sections.tsx:166-167`), and `EmptySection`
  is wired only to summary and skills. There is no add-role control.
- Phone: `components/cv/mobile/mobile-main-editor.tsx:51` writes through
  `useMasterAutosave`, i.e. to the master, even when the person is shaping a
  job's CV.

**Fix:** roles and projects are facts about the person, so **adding one writes to
the master**, and it then appears on every job document (which only chooses and
phrases). Desktop gets `EmptySection` for projects and an "Add role" control,
both writing to the master. On a job document the phone edits go through the
job-draft endpoint (`routers/cv/versions.py:380`), never the master autosave.
This is also what makes fix B livable.

### E · #49 — the page meter is measured, and never blocks a download

`frontend/lib/cv/page-fill.ts:23-25` estimates fill as 98 characters × 50 lines
and counts only identity, summary, experience and skills
(`use-playground-model.ts:155`). It read 110% on a CV that printed at 97%, and
`playground-view.tsx:279` refuses the download unless `pageFill.fits`.
**Fix:** one `measurePageFill(sheetElement)` reads the real rendered height of
the export DOM at the export page width — the preview *is* the export
(ADR-0020). **Download is never gated.** Over one page, the sheet shows "2 pages"
and offers "Fit to one page" (`trim-confirm.tsx`) as the person's choice. Delete
the character model once nothing reads it.

## 3 · Platform sweep

| Surface | Touched by |
|---|---|
| Desktop playground | A, B, D, E |
| Phone CV editor | A, D (document routing) |
| Exports: PDF + DOCX (backend), text (both composers) | A, C |
| Weave and polish (model writes) | B — drop, never 422 |
| Restructure / skill edit (master rewrite) | C |
| #56 Human Check delivery | B (the reviewer is bound by the same rule) |
| Anonymous `/cv-preview` | A (shares the composer) |
| Extension imports | none |
| Light / dark, 375px | D and E controls |

## 4 · Work, in order

| # | Fix | Done when |
|---|---|---|
| S1 | A · blank certs | Golden test: no bare heading in any export |
| S2 | B · fabricated-role guard | Seam tests: invented pair refused; weave drops it and logs; master-added role passes |
| S3 | C · keep unknown sections | The five measured headings survive a master rewrite |
| S4 | E · measured page fill | A CV at 97% downloads; a real 2-page CV shows "2 pages" and still downloads |
| S5 | D · add role/project; phone routing | Add a role on desktop → it appears on the job doc; a phone edit on a job doc leaves the master untouched |

## 5 · How we will know it worked

BACKLOG QA checks **T1–T3** pass with the QA account; no download in
`core_loop_events` is preceded by a refused attempt; `metric
cv.fabricated_role_dropped` is visible in the logs when the model invents.
