-- S3: hard vs soft, derived from the taxonomy and never retyped.
--
-- `role_family_for_job` carried a hand-typed exclusion list. Checked against the
-- live taxonomy, THREE of its five names matched no L2 cluster at all
-- ('Teamwork and Collaboration', 'Time Management', 'Leadership'), while three
-- real soft clusters were missing. Result: 1,233 prod jobs have a soft skill as
-- their career family — 525 "Personal Attributes", 353 "Initiative and
-- Leadership", 292 "Business Communications", 61 "Social Skills", 2 "Physical
-- Abilities". A candidate's career direction read "Personal Attributes".
--
-- TWO DIFFERENT QUESTIONS, which the old list conflated:
--
--   1. Is this SKILL soft?  ->  l1_domain = 'Physical and Inherent Abilities'.
--      Verified by sampling all five of its clusters: Resilience, Decisiveness,
--      Finger Dexterity, Teamwork, Complex Problem Solving. Uniformly soft.
--      The Communication clusters are deliberately NOT included here: sampling
--      found "Post Office Protocol (POP3)", "Sendmail", "Rocket Chat" and
--      "Amplitude Modulation Signaling Systems" inside them. Calling those soft
--      would silently delete real technical requirements from every skill gap
--      and from company demand — a worse error than leaving "Body Language"
--      classified as hard, because it removes signal rather than adding noise.
--
--   2. Is this CLUSTER a career family?  ->  the soft L1's clusters, PLUS the
--      two Communication clusters. "Communication" is not a job family the way
--      "Software Development" is, whatever the hardness of the skills in it.
--
-- The original bug was not that a list existed. It was that nobody checked the
-- names resolved. So the list is asserted below and the migration fails loudly
-- if a named cluster ever stops existing.

-- 1. skill_kind — a STORED generated column. It cannot be hand-set, cannot
--    drift from the taxonomy, and needs no backfill or trigger.
ALTER TABLE public.skills
    DROP COLUMN IF EXISTS skill_kind;

ALTER TABLE public.skills
    ADD COLUMN skill_kind TEXT
    GENERATED ALWAYS AS (
        CASE WHEN l1_domain = 'Physical and Inherent Abilities' THEN 'soft' ELSE 'hard' END
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_skills_skill_kind ON public.skills (skill_kind);

COMMENT ON COLUMN public.skills.skill_kind IS
  'Derived from l1_domain, never written. soft = Physical and Inherent Abilities (270 skills). Soft skills are captured and shown but never enter a skill gap and never become a role_family — we cannot teach Resilience, so ranking it wastes the one thing we sell.';

-- 2. The career-family exclusion, table-driven with a name assertion.
CREATE OR REPLACE FUNCTION public.non_family_clusters()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    -- Hard skills live in these, so they are not soft — but neither is a career
    -- direction. Asserted below precisely because the list they replace named
    -- three clusters that did not exist.
    communication_clusters CONSTANT TEXT[] := ARRAY['Communication', 'Business Communications'];
    resolved TEXT[];
BEGIN
    SELECT array_agg(DISTINCT cluster) INTO resolved
    FROM (
        SELECT l2_cluster AS cluster FROM public.skills
        WHERE skill_kind = 'soft' AND NULLIF(btrim(l2_cluster), '') IS NOT NULL
        UNION
        SELECT unnest(communication_clusters)
    ) AS all_clusters;
    RETURN COALESCE(resolved, ARRAY[]::TEXT[]);
END;
$$;

DO $$
DECLARE
    missing TEXT;
BEGIN
    FOREACH missing IN ARRAY ARRAY['Communication', 'Business Communications'] LOOP
        IF NOT EXISTS (SELECT 1 FROM public.skills WHERE l2_cluster = missing) THEN
            RAISE EXCEPTION
                'non_family_clusters names "%" but no skill has that l2_cluster. '
                'This is the exact bug being fixed — a name that resolves to nothing '
                'silently excludes nothing.', missing;
        END IF;
    END LOOP;
END;
$$;

-- 3. role_family_for_job now asks the taxonomy instead of a literal list.
CREATE OR REPLACE FUNCTION public.role_family_for_job(p_job_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    resolved_family TEXT;
BEGIN
    SELECT skill.l2_cluster
    INTO resolved_family
    FROM public.job_skills AS job_skill
    JOIN public.skills AS skill ON skill.id = job_skill.skill_id
    WHERE job_skill.job_id = p_job_id
      AND NULLIF(BTRIM(skill.l2_cluster), '') IS NOT NULL
      AND skill.l2_cluster <> ALL (public.non_family_clusters())
    GROUP BY skill.l2_cluster
    ORDER BY COUNT(*) DESC, skill.l2_cluster ASC
    LIMIT 1;

    RETURN resolved_family;
END;
$$;

-- 4. Repair. Only jobs currently filed under a non-family cluster can change:
--    the old list never wrongly EXCLUDED anything (its three dead names matched
--    nothing), it only wrongly INCLUDED. NULL is a legitimate outcome — it means
--    the corpus has no specific-enough evidence, which is the documented meaning.
UPDATE public.jobs AS job
SET role_family = public.role_family_for_job(job.job_id)
WHERE job.role_family = ANY (public.non_family_clusters());

REVOKE ALL ON FUNCTION public.non_family_clusters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.non_family_clusters() TO service_role;
