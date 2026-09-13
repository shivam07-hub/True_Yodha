# Myro Runs A Bounded Tool-Router, Not An Open Agent Loop

**Status:** Accepted
**Date:** 2026-06-05
**Related:** ADR-0008 (durable background work / provider budget), MYRO_TUTOR_DESIGN.md

## Decision

Each Myro turn is handled by a **bounded tool-router**: a cheap intent classifier routes to
**one** tool from a small, fixed belt (`recruiter_read`, `rewrite_experience`, `ats_pass`,
`explain_skill`, `find_referrers`, `playbook_lookup`, `memory_read/write`, `schedule_recall`).
Everything downstream of the router is deterministic-as-possible. Tools are **opted-in per
surface** — `/cv` exposes the CV belt, `/forge` the tutoring belt.

## Considered Options

- **Open agent-native loop with parallel sub-agents (DeepTutor):** rejected — our wedge is narrow
  and high-stakes (a CV going to a real employer). An open ReAct loop burns the provider budget
  (ADR-0008), adds latency to the user-blocking CV path, and widens the safety surface for no
  benefit the narrow flow needs.
- **Pure linear pipeline, no router:** rejected — cannot handle the genuine intent fan-out
  (cv-fix vs skill-explain vs referral vs match-question).
- **Bounded router + fixed per-surface tool belt:** accepted — predictable cost, latency, and
  safety; matches the existing deterministic-services discipline. We can graduate to a richer
  loop later if a real need appears; we do not pay for it on day one.
