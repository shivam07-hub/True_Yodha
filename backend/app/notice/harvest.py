"""Harvest belt stalls and recoveries for the daily closer."""

from __future__ import annotations

import logging
from collections.abc import Mapping

from app.notice.fingerprint import cause_key_for
from app.notice.types import CloseProof, Sighting
from app.services.probe import INGESTION, SNAPSHOTS, VERIFIER, BeltState, snapshot_belt

_logger = logging.getLogger("app.notice")

def harvest_belts(
    *,
    skill_awaiting: int | None,
    verifier_state: BeltState | None,
    sha: str,
    on_main: bool,
    alert_above: int = 100,
    ingestion_state: BeltState | None = None,
    closer_state: BeltState | None = None,
    snapshot_states: Mapping[str, BeltState] | None = None,
) -> tuple[list[Sighting], list[CloseProof]]:
    sightings: list[Sighting] = []
    proofs: list[CloseProof] = []
    if skill_awaiting is not None:
        if skill_awaiting >= alert_above:
            sightings.append(Sighting.dead_man(belt="skill_floor"))
        else:
            proofs.append(
                CloseProof(
                    cause_key="dead_man:skill_floor",
                    test_nodeid="harvest:skill_floor_recovered",
                    sha=sha,
                    on_main=on_main,
                )
            )
    if verifier_state in VERIFIER.opens_on:
        sightings.append(Sighting.dead_man(belt=VERIFIER.belt))
    elif verifier_state == "ok":
        proofs.append(
            CloseProof(
                cause_key="dead_man:listing_verifier",
                test_nodeid="harvest:listing_verifier_ok",
                sha=sha,
                on_main=on_main,
            )
        )
    # Ingestion opens only when stalled (168h). `degraded` is the 72h aim we
    # are knowingly behind, so it must not open a permanent row — and it must
    # not close a real stall. A scraper dead for six days is not a recovery.
    if ingestion_state in INGESTION.opens_on:
        sightings.append(Sighting.dead_man(belt=INGESTION.belt))
    elif ingestion_state == "ok":
        proofs.append(
            CloseProof(
                cause_key="dead_man:job_ingestion",
                test_nodeid="harvest:job_ingestion_ran",
                sha=sha,
                on_main=on_main,
            )
        )
    # The closer's own belt. This process running is the recovery. The API
    # opens the Notice when the heartbeat is stale; unknown (no row yet) is
    # neither a stall nor a close.
    if closer_state == "ok":
        proofs.append(
            CloseProof(
                cause_key="dead_man:notice_closer",
                test_nodeid="harvest:notice_closer_ran",
                sha=sha,
                on_main=on_main,
            )
        )
    # Each Tier-0 snapshot task is its own belt: a stale one opens, a fresh one
    # is its own recovery. One refreshing must not close another that is not.
    for task, state in sorted((snapshot_states or {}).items()):
        sighting = Sighting.dead_man(belt=snapshot_belt(task).belt)
        if state == "stalled":
            sightings.append(sighting)
        elif state == "ok" and task in SNAPSHOTS:
            # An undeclared task keys to `dead_man:unknown`, which it must not
            # close: that row may be another belt's.
            proofs.append(
                CloseProof(
                    cause_key=cause_key_for(sighting),
                    test_nodeid=f"harvest:snapshot.{task}_fresh",
                    sha=sha,
                    on_main=on_main,
                )
            )
    return sightings, proofs


def harvest_upload_stalls(has_spent_budget: bool) -> list[Sighting]:
    if not has_spent_budget:
        return []
    return [Sighting.upload_guarantee(break_kind="job_never_claimed")]
