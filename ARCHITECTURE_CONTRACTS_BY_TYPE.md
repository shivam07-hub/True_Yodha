# Two contracts carried by convention, not by type

**Architecture spec. Implementation by Cursor. Written 2026-09-27.**

Candidates 3 and 8 of the 2026-09-27 architecture review. Candidates 1, 2 and 4
are one larger piece, specced separately in
[ARCHITECTURE_LISTING_TIME.md](ARCHITECTURE_LISTING_TIME.md).

These two are unrelated in subject and identical in shape: **a rule every
caller must obey, written in a docstring, enforced by nothing.** In both cases
the module itself is good. The seam is what fails.

---

# 1 · Match health — the default argument that restores the old bug

## The defect

`backend/app/services/matching/match_freshness.py` is one of the better modules
in the codebase: it names the exact defect it exists for ("Ten warmer rows made
a dead run read as `vetted`"; "331 profiles hold a direction newer than their
last run"), declares itself the test surface, and `test_match_freshness.py`
covers all five states.

`compute_match_health` (`backend/app/services/jobs_workflow.py:50-57`) takes it
as `freshness: Any = None` — optional and untyped. Its own docstring states the
consequence plainly:

> Omitted (None) means "not asked", never "fine": the answer is then exactly
> what it was before this state existed.

Callers, verified 2026-09-27:

| Call site | Passes `freshness`? |
|---|---|
| `routers/jobs/match.py:145` — **`/jobs/matches`**, the hottest authed surface | **no** |
| `routers/jobs/collections.py:62` | **no** |
| `routers/jobs/match.py:178` — `/matches/retry` | yes |
| `routers/users.py:76` | computes the same fact a third way |

`collections.py:62` omits it under a comment reading *"Same health the
/jobs/matches banner reads — one rule, one module."* Both halves of that
sentence are true and the result is still wrong, because both callers are in
the mode where the rule cannot fire.

And `backend/tests/test_match_health.py:144` explicitly asserts the
`freshness=None` path — **the broken caller shape is pinned as correct by a
test**, so nothing in CI will ever object.

**What the user gets:** they change their target role, the Match Run has not
caught up, and `/jobs/matches` renders matches for the old direction with
nothing saying so. `stale_direction` exists precisely to say so.

## The decision

**Required parameter, three explicit values. Not an optional one.**

```
freshness: MatchFreshness | Literal["not_asked"]     # no default
```

The docstring's reason for the default is legitimate and survives: those
profile columns are genuinely not on this module's path, and a caller that
cannot pay for them should not be forced to. So this does **not** force the
read. It forces the *decision to be stated*.

- A caller that can pay, passes the state.
- A caller that cannot, writes `freshness="not_asked"` — visible in the diff,
  greppable across the repo, and answerable in review.
- A caller that forgets no longer exists: the type rejects it.

The difference between this and the status quo is the difference between an
admission and an omission. An omission is invisible; this is the same failure
mode that killed `tailored_cv_created_at`, which had one writer and no callers
for the whole life of the feature.

## Work, in order

1. Make the parameter required; let the type checker enumerate the call sites.
2. `/jobs/matches` and `collections.py` — **pass the real state**, not
   `"not_asked"`. Measure the read before and after; if it is genuinely
   expensive, fold the two columns into a profile read the endpoint already
   does rather than reverting to `"not_asked"`. `"not_asked"` is for a caller
   with no profile read at all, not a cost we did not like the look of.
3. `routers/users.py:76` — delete the third derivation, read the module.
4. Rewrite `test_match_health.py:144`. It currently pins the bug. It should
   assert that `"not_asked"` yields the documented pre-2026-06 answer **and**
   that the real states yield `stale_direction` / `computing` — the thing no
   test covers today.
5. Delete `Any` from the signature. `now: Any = None` on the same function is
   the same smell; type it.

## How we will know it worked

- `grep -rn 'compute_match_health' backend/app` shows every call site naming
  its freshness argument. No omissions possible.
- A test fails if a caller is added without one.
- A user whose direction moved sees `stale_direction` on `/jobs/matches`.

---

# 2 · Dead-man probes — four copies of a concept with no module

## The defect

`_age_hours` is **byte-identical** (verified by hash, 2026-09-27) in three
files:

- `backend/app/services/ingestion_health.py:55`
- `backend/app/services/verifier_health.py:45`
- `backend/app/services/notice_closer_health.py:37`

Each also hand-rolls its own `_CachedCheck` dataclass, module-global `_cache`,
`reset_cache()` test seam and `_emit()`. A fourth copy of the same ISO-age
maths sits at `jobs_workflow.py:117-128` as `_iso_age_seconds`.

Adding a fourth belt today costs: a copy of `_age_hours`, a copy of the cache,
a copy of `reset_cache`, a copy of `_emit`, a `/health` key in
`main.py:277-286`, and a branch in `harvest_belts`. That is the signature of a
concept that never got a module.

**Two sharper problems inside it.**

**A read that writes.** `check_ingestion(now=None) -> IngestionHealth`
(`ingestion_health.py:120`) calls `_emit` (`:66-74`), which calls
`observe(Sighting.dead_man(belt="job_ingestion"))` — it opens a Notice.
`notice/closer.py:75` calls it *purely to obtain a string*, which it hands to
`harvest_belts`, which opens the same sighting again from `harvest.py:117-118`.
This is absorbed today only because `notice/board.py:35,112` dedupes by
fingerprint. The signature advertises a query and performs a write; the
correctness rests on a dedupe two modules away.

**The belt→Notice rule, written twice, asymmetrically.**
`verifier_health._emit:56-58` opens on `stalled|degraded`;
`ingestion_health._emit:68` opens on `stalled` only. `harvest.harvest_belts`
then re-encodes *both* rules, taking each state as a bare `str | None`
(`:82,86,87`) — so the four-value vocabulary `ok|degraded|stalled|unknown`
crosses that seam with no type at all.

## The decision

**One `Probe` module. Reads are pure; opening a Notice is a separate, named
act.**

- A probe is declared, not hand-written: its belt name, its source timestamp,
  its degraded and stalled thresholds, and **which states open a Notice** — the
  per-belt asymmetry becomes data on the declaration instead of an `if` in two
  files.
- `check(...)` returns a state and writes nothing. A caller that wants a string
  gets a string. `notice/closer.py` stops opening Notices as a side effect of
  asking a question.
- The state is a **type**, not `str | None`. `ok | degraded | stalled |
  unknown` crosses the `harvest_belts` seam as that type.
- Caching and `reset_cache` live once.

Two adapters already exist (ingestion, verifier) and a third is in tree
(notice-closer), so this is a **real seam, not a hypothetical one** — the test
the review applies before proposing any abstraction.

**Keep:** the dead-man behaviour itself, exactly as it is. It is load-bearing
and the September ingestion outage is the proof. This changes where the rule
lives, never what it decides.

## Also, on the way past

`backend/app/services/forge_service.py` — 15 lines, **zero callers anywhere in
`backend/`** (verified 2026-09-27), mirrored by hand into
`frontend/lib/level-thresholds.ts:3-12`, and its own docstring says the feature
it declares was removed. It fails the deletion test outright: delete it and
nothing reappears. Remove it in whichever commit passes nearest — the
frontend copy has four real readers and is the live one.

## How we will know it worked

- `grep -rn 'def _age_hours' backend/app` returns **one** result.
- A new belt is a declaration, not six edits.
- `notice/closer.py` can ask a probe its state without opening anything.
- `grep -rn forge_service backend/` returns nothing.
