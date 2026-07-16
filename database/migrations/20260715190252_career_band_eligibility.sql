-- Career Band is the durable role-family boundary for browse and Career Ops.

BEGIN;

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS career_band TEXT;

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_career_band_chk;
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_career_band_chk CHECK (
        career_band IS NULL OR career_band IN (
            'engineering_data',
            'business_product_operations',
            'research_people_public_impact',
            'design_creative'
        )
    );

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS target_career_band TEXT,
    ADD COLUMN IF NOT EXISTS explored_career_bands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_target_career_band_chk;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_target_career_band_chk CHECK (
        target_career_band IS NULL OR target_career_band IN (
            'engineering_data',
            'business_product_operations',
            'research_people_public_impact',
            'design_creative'
        )
    );

ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_explored_career_bands_chk;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_explored_career_bands_chk CHECK (
        explored_career_bands <@ ARRAY[
            'engineering_data',
            'business_product_operations',
            'research_people_public_impact',
            'design_creative'
        ]::TEXT[]
    );

COMMIT;
