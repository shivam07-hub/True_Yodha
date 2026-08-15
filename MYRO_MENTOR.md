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
  framing and the tools available, **not** the personality. One voice, four jobs
  — and, per lock 6, one thread beneath all four.
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

---

## 2b. GRILL-LOCKED 2026-08-14 · seven decisions

Settled with Shivam. Not open again without a reason.

**First, the measurement that reframed it.** Of **520** users: **25** clear the
canvas's signal gate, **4** hold any memory fact, **2** a career goal, **1** a
deal-breaker, **1** a persona canvas (written 2026-07-25, never since). But
**72** confirmed a direction at onboarding's `target-confirm`. Myro does not
have a rendering problem for 516 of these people — it has never asked them
anything. Reach, not layout, chooses where this starts.

Second: **the paragraph already exists.** `PersonaCanvas` — "What Myro knows
about you", three movements, judgment-tier, edits pinned through regeneration.
It is not built from nothing; it is built from something almost nobody has.

1. **One document, not two.** A fourth movement — **IV · What you're looking
   for** — joins the canvas and holds wants, won't-takes and target companies.
   Biography and targeting change at very different rates; they still share one
   name, one voice and one writer, because a user has one Myro.

2. **Onboarding asks.** `target-confirm` already proposes from the CV and takes
   a correction — 72 users deep, 18× anything else. It grows to capture the
   wants/won't-takes axis. The mentor refines from there, on every surface.

3. **Structure is truth; prose is the view.** Typed values are stored and read;
   the paragraph is rendered from them. **The matcher never parses prose** — a
   verdict caches permanently per (user, job), so a mis-parse is unfixable, and
   we have already paid for that once (70% memory-blind verdicts, 2026-08-13).

4. **The sentence is the interface.** The pre-flight's six form sections are
   replaced by movement IV with its nouns as controls — tap a role to drop it,
   tap the city to change it. Anything larger goes through Myro, which proposes
   typed edits back. One representation; no second place the same fact lives.

5. **Remember freely, confirm what it searches on.** A turn that teaches Myro
   something lands in memory immediately — that is what makes it a living
   document. Anything that changes what the matcher ranks on moves only after
   the user sees it in the paragraph and accepts it. Memory generous, targeting
   deliberate; the modal's Discard stays honest.

6. **One thread, all surfaces.** Not four conversations wearing one voice. Myro
   on the search can say "you told me yesterday you led that migration". The
   summarisation this forces is a known cost and is owned by the mentor module.

7. **Slice 1 is movement IV, true for the 72.** Below.

---

## 3. Remaining work, in order

### A. Myro Mentor — four slices

1. **Movement IV, live.** `target-confirm` captures wants + won't-takes →
   stored structured → rendered as the inline-editable sentence, replacing the
   pre-flight form. No mentor rebuild, no new prompts. Ships the visible half
   against the reach that already exists.
2. **One voice.** ✅ SHIPPED `06d0b512` — `myro_voice.py`. The brief said six
   prompts, one voice; reading them says two registers, and collapsing all six
   would have broken two. `speaking_to_reader` (search chat, interview brief,
   switch plan, persona canvas) carries the `reader_voice` address contract,
   which exactly ONE of those four carried before. `drafting_for_reader`
   (`cv_weave`, `reach_pack`) does NOT — those write what the user sends under
   their own name, so Myro must be invisible. `gap_planner` gets neither and
   the test asserts that, since it only emits `latent|absent` JSON.
3. **`learned[]`.** ✅ SHIPPED `2a72c0a4` — `mentor_learn.py`. The two places a
   user actually confides on the CV surface (the brain-dump notebook, intake's
   `raw_text`) learn on the turn instead of waiting for a 12h-debounced batch
   gated on behavioural signals that exclude facts. Reuses the distiller's
   `_ALLOWED_KINDS` / `parse_facts` / `select_new` — one parser, one dedup, one
   tombstone rule. Lock 5 is enforced by an AST test, not a promise. **The
   `skills` surface has no free-text confession point and is deliberately not
   wired.**
4. **One thread** across all four surfaces, with summarisation.

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
