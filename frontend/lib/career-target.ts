/**
 * The two caps on a career target.
 *
 * The definition is `backend/app/services/career_target.py`; these repeat it,
 * and `backend/tests/test_target_limits.py` fails if they stop being equal.
 * They used to live one per surface and drifted: the screen allowed five
 * cities while the request model still said three, so the fourth city was a
 * 422 the person could only retry.
 */

/** How many cities a person may target. */
export const MAX_TARGET_LOCATIONS = 5

/** How many kinds of work a person may target. Wide on purpose — retrieval ORs
 *  across them into one ranked list, so the cap only bounds the array. */
export const MAX_TARGET_ROLES = 20
