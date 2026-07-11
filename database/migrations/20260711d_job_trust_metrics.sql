-- Operational north-star metrics for trusted job recommendations.

CREATE INDEX IF NOT EXISTS idx_job_feedback_liveness_created
    ON public.job_feedback_events (reason_code, created_at DESC)
    WHERE reason_code IN ('apply_link_live', 'apply_link_closed');

CREATE OR REPLACE VIEW public.job_trust_exposure_daily
WITH (security_invoker = true)
AS
SELECT
    shown_at::DATE AS metric_date,
    surface,
    COUNT(*)::BIGINT AS recommendation_exposures,
    COUNT(*) FILTER (
        WHERE confidence_at_show = 'active'
          AND verified_live_at IS NOT NULL
    )::BIGINT AS verified_live_exposures,
    ROUND(
        COUNT(*) FILTER (
            WHERE confidence_at_show = 'active'
              AND verified_live_at IS NOT NULL
        )::NUMERIC / NULLIF(COUNT(*), 0),
        4
    ) AS verified_live_exposure_rate
FROM public.job_recommendation_exposures
GROUP BY shown_at::DATE, surface;

CREATE OR REPLACE VIEW public.job_apply_liveness_daily
WITH (security_invoker = true)
AS
SELECT
    created_at::DATE AS metric_date,
    surface,
    COUNT(*)::BIGINT AS apply_answers,
    COUNT(*) FILTER (WHERE reason_code = 'apply_link_live')::BIGINT AS live_answers,
    COUNT(*) FILTER (WHERE reason_code = 'apply_link_closed')::BIGINT AS dead_clicks,
    ROUND(
        COUNT(*) FILTER (WHERE reason_code = 'apply_link_closed')::NUMERIC
        / NULLIF(COUNT(*), 0),
        4
    ) AS dead_click_rate
FROM public.job_feedback_events
WHERE feedback_kind = 'quality'
  AND reason_code IN ('apply_link_live', 'apply_link_closed')
GROUP BY created_at::DATE, surface;

REVOKE ALL ON public.job_trust_exposure_daily FROM PUBLIC;
REVOKE ALL ON public.job_trust_exposure_daily FROM anon, authenticated;
REVOKE ALL ON public.job_apply_liveness_daily FROM PUBLIC;
REVOKE ALL ON public.job_apply_liveness_daily FROM anon, authenticated;
GRANT SELECT ON public.job_trust_exposure_daily TO service_role;
GRANT SELECT ON public.job_apply_liveness_daily TO service_role;

COMMENT ON VIEW public.job_trust_exposure_daily IS
    'North star: verified-live recommendation exposure rate by day and surface.';
COMMENT ON VIEW public.job_apply_liveness_daily IS
    'Apply Transport answers and dead-click rate by day and surface.';

NOTIFY pgrst, 'reload schema';
