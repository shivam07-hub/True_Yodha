-- The direction a user sees is the family; 65 stored titles still say otherwise.
--
-- Migration 20260909100000 made the L2 family the name of a direction on every
-- surface, because `label` — the family's modal job title — names twenty families
-- "Custom Software Engineer" and is not what anybody chose. Direction writes the
-- family now. Users who chose BEFORE that still carry the old value in
-- `target_role_titles`, which is what Settings chips, Practice and the score
-- header render.
--
-- NOT a blanket rewrite. Previewing it first showed the blanket version would
-- have DESTROYED better data than it wrote:
--
--   "Senior Software Engineer"  ->  "Artificial Intelligence and Machine Learning (AI/ML)"
--   "SOLUTION ARCHITECT"        ->  "Business Leadership"
--
-- The first is the user's own words and is strictly better than the family name.
-- The second is a corpus artifact that only ever appeared because Direction wrote
-- `label`. Those are different states and they do not get the same treatment
-- (an empty slot is three states: stated, cleared, absent).
--
-- Measured 2026-09-09 over the 149 users holding a family:
--
--   user typed a real title            46   KEEP — their words beat our taxonomy
--   corpus label artifact              39   replace: it is a label, not a choice
--   empty titles, valid family         26   fill: pure gain, nothing overwritten
--   orphan, a non-family entry         38   untouched (role-scope recovery owns these)
--
-- Only the middle two are touched: 65 rows. A title is judged a corpus artifact
-- only when EVERY entry exactly equals some family's stored `label` — that string
-- cannot be reached by typing, so it can only have come from the old write.
--
-- Snapshots are deliberately NOT rewritten. `career_target_snapshots` records what
-- a direction WAS at a point in time; the profile is the current projection, and
-- it is the projection the surfaces read.

update public.user_profiles p
set target_role_titles = p.target_roles,
    target_role_title  = p.target_roles[1]
where p.target_roles is not null
  and array_length(p.target_roles, 1) > 0
  -- every stored target resolves to a live family
  and (
    select bool_and(l.family is not null)
    from unnest(p.target_roles) f
    left join public.role_family_labels l on l.family = f
  )
  and p.target_role_titles is distinct from p.target_roles
  and (
    -- empty: nothing to lose
    coalesce(array_length(array_remove(coalesce(p.target_role_titles, '{}'), ''), 1), 0) = 0
    -- or every entry is a corpus label, never a typed title
    or (
      select bool_and(exists (
        select 1 from public.role_family_labels l where l.label = x
      ))
      from unnest(array_remove(p.target_role_titles, '')) x
    )
  );
