# MYRO MENTOR — one voice, one memory
### Handoff for the next session · written 2026-08-13 · Claude

Myro has **sixteen** system prompts, **two** memory writers, and **two** surfaces
where a user can actually talk to it. This file is the design for collapsing that
into one mentor, plus everything left open from the standardised-matching work.

Read [CLAUDE.md](CLAUDE.md) first. Then this. Everything below is measured, not
assumed — the numbers are from production on 2026-08-13.

---

## 0. FIRST — nothing below is on production

`himyro.com` → Vercel Production → **`main`**. Every commit from the 2026-08-13
session is on **`Develop`**. `main`'s last merge is PR #228.

So the Myro Search modal on himyro.com is the OLD one (seven typed rows, "Myro
reads the inputs below"). The conversation exists, on `Develop`, unreleased.
**Shivam owns the merge** — CLAUDE.md stage-one item #1. Do not write this as an
agent TODO; it is not one.

Everything else in this file assumes that merge has happened or is scheduled.

---

## 1. What is actually wrong

### Sixteen voices

Sixteen modules define their own `_SYSTEM` / `build_system_prompt`:

```
cv_parser · cv_weave · gap_planner · intent_chat_service · jd_coverage
job_file_parser · job_query_parser · job_switch_plan_service · llm_ranker
memory_distiller · prep_brief · reach_pack · persona_synthesis
project_rewrite · role_dedup · story_dedup
```

Some of these are genuinely mechanical (`role_dedup`, `job_file_parser` — parsers,
not personalities). But `cv_weave`, `gap_planner`, `intent_chat_service`,
`prep_brief`, `job_switch_plan_service` and `reach_pack` all **talk to the user**,
and each invented its own tone, its own name for the user, and its own idea of
what Myro knows. The CV mentor and the job concierge are the same character to
the user and different characters in the code.

### One-way memory

Memory is READ by 12 modules. It is WRITTEN by exactly two:

- `memory_distiller` — batch, from CV + stories
- `intent_chat_service` — the job concierge

**The CV mentor writes nothing. The skills path writes nothing.** A user can
spend an hour with the mentor rewriting bullets, explaining what they actually
did and what they want next — and Myro ends that hour knowing exactly what it
knew at the start. The `memory-panel` in the CV builder is a manual add form
("Tell Myro something to remember"), not a conversation that listens.

That is the gap. "What Myro knows about you" is a living document with one pen.

### The conversation is a block, not a conversation

The 2026-08-13 pre-flight work (`4e1266c5`) put a chat panel ABOVE the seven-row
form. It proposes into the draft and never writes — those contracts are right and
tested. But it is still a widget bolted to a form, on one screen. The user asked
for a mentor that is present wherever they are, not a second input control.

---

## 2. The deep module — Myro Mentor

One module owns "Myro talking to a user and learning from it". Everything that
speaks routes through it.

### The seam

```
mentor.converse(user_id, surface, messages) -> MentorTurn
  MentorTurn = { reply, proposals[], learned[] }
```

- **`surface`** — `cv` | `skills` | `job_intent` | `prep`. Selects the task
  framing and the tools available, **not** the personality. One voice, four jobs.
- **`proposals[]`** — typed, surface-specific, always propose-only. The
  pre-flight's `FilterDiff` is the existing example and the shape to follow.
- **`learned[]`** — candidate memory facts extracted from THIS turn. This is the
  thing that does not exist today.

### Three rules that must not bend

1. **One voice, composed not copied.** A shared `MYRO_VOICE` preamble plus a
   per-surface task block. Not sixteen prompts that happen to agree today. The
   voice contract already exists in `reader_voice.py` (write TO the reader, never
   about them) — the mentor is where it becomes structural.
2. **Every surface writes what it learns.** `learned[]` flows into `user_memory`
   through the kinds `matching/targeting.py` already maps (`constraint`,
   `work_mode`, `aspiration`, `note`) — the Targeting Brief must be able to read
   it without a fourth store being invented.
3. **Propose, never write silently.** The distiller's propose-only lock on
   `user_profiles` columns holds everywhere. Memory facts may land as
   `source="distilled"` with confidence; targeting columns need the user's
   Run/Save. This is already how the pre-flight behaves; make it the rule.

### Why this is a deep module and not a refactor

Delete `mentor` and the complexity does not move — it reappears in six places
that each re-derive "who is Myro, what does he know, and what may he change".
That is the deletion test passing. Its interface is small (one call, three
returns) and it hides the voice, the grounding retrieval, the proposal typing and
the memory write behind it.

### Do this first, before any code

`/grill-me` on the fork this creates: **does the mentor write memory on every
turn, or only on turns the user confirms?** Every-turn is how it becomes a living
document; confirmed-only is how it stays trustworthy. The 2026-08-13 session
locked "propose, never persist" for the pre-flight specifically because the
modal's Discard has to mean discard. Whether that generalises to the CV mentor —
where there is no Discard and the conversation IS the product — is not decided
and must not be decided by whoever writes the code first.

---

## 3. Remaining work, in order

### A. Myro Mentor (the above)
Grill first. Then: shared voice preamble → `learned[]` extraction → wire `cv` and
`skills` surfaces → retire per-module prompts one at a time, each with a test that
the voice contract holds.

### B. R2 — precompute the ranked feed · BLOCKED ON DATA
Instrumentation shipped (`e203d2f5`). Needs **10+ prod samples** of
`metric phases.slow label=jobs.feed` before anything is built.
[ARCHITECTURE_READ_PATH.md](ARCHITECTURE_READ_PATH.md) §12 names two outcomes
that would make R2 the wrong build — read them before scoping. Do not skip this;
R2 was already scoped once on an unmeasured assumption.

### C. Candidate 5 — the company drill-down shows unranked cards
`/jobs/search` is public-repo and `JobSearchItem` carries no fit or verdict —
correct for anon. But an authed user on a company page gets the same `FeedCard`
component rendering the same jobs that carry a verdict on `/market`, blank here.
Lowest severity of the five; never started.

### D. Verification debt — three UI changes nobody has looked at
All shipped with contract tests and a green build, none eyeballed:
- the `stale_direction` card (onboarding result)
- the J1 warm landing and re-sorting the feed
- the pre-flight conversation

The QA account (`frontend/.env.local`) reaches `/market` but tops out at
`awaiting_skill_confirmation` step 1, so it **cannot** reach the onboarding
screen. See [reference: QA account]. Driving the in-app browser against a dev
server covers the first two; the third needs a user who is mid-onboarding.

### E. The reorder affordance — a design call, deliberately not invented
The feed re-sorts a few seconds after paint when the J1 warm lands. CONTEXT.md's
Provisional Match reasoning says "a list that reorders under someone mid-read is
worse than one that sharpens in place". The platform already has the honest
pattern for this — `verdict: "checking"`, upgrades in place, never fake-precise.
Applying it to the feed is the standardised answer. Shivam's call on the visible
treatment.

---

## 4. What shipped 2026-08-13 (context for the above)

| Commit | |
|---|---|
| `a155ed27` | Every brain path reads the Targeting Brief |
| `a0128683` | A missing scoping key is not a verdict |
| `7614f068` | A finished run is not proof this direction was searched |
| `ea372002` | A cached verdict is only current for the context that produced it |
| `719e0416` | Best fit is brain-ranked on arrival; Newest means newest |
| `1725cc73` | One ordering, every surface — client-side fit twins deleted |
| `501cfcbd` | Company lookup: 44,517ms → 4.5ms |
| `e203d2f5` | Feed phase instrumentation |
| `79388703` | Ordering contract gate + honest-state metrics |
| `4e1266c5` | Myro Search asks first |

Four defects found, all the same shape: **absence read as a negative verdict**,
failing silently with a green board. 162 of 196 users were told the market had
nothing for them while holding 1,289 real match rows; 152 of 153 brain-rated
users were never offered the CV core loop. Both from one NULL column.

The standing lesson is in `feedback_absence_is_not_a_verdict`: when a conjunction
decides what a user sees, every term needs an explicit answer for "what does
absent mean", and the honest default is almost never a bar.
