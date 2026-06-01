-- 20260601 — Newsletter distribution agent
--
-- Review-first campaign distribution for Myro Newsletter. This stores public
-- outreach contacts with provenance, generated channel drafts, campaign
-- approval state, and an email queue. Sending/posting remains an explicit
-- downstream step; no client role receives table access.

CREATE TABLE IF NOT EXISTS public.newsletter_outreach_contacts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name text NOT NULL,
    email             text NOT NULL UNIQUE,
    contact_type      text NOT NULL DEFAULT 'newspaper',
    outreach_basis    text NOT NULL,
    source_url        text,
    source_label      text,
    status            text NOT NULL DEFAULT 'active',
    notes             text,
    last_contacted_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT newsletter_outreach_contacts_type_chk
        CHECK (contact_type IN (
            'newspaper', 'college', 'student_community', 'company', 'partner', 'other'
        )),
    CONSTRAINT newsletter_outreach_contacts_basis_chk
        CHECK (outreach_basis IN (
            'public_media_contact', 'existing_relationship', 'opt_in',
            'manual_research', 'partner_referral'
        )),
    CONSTRAINT newsletter_outreach_contacts_status_chk
        CHECK (status IN ('active', 'unsubscribed', 'bounced', 'suppressed')),
    CONSTRAINT newsletter_outreach_contacts_source_chk
        CHECK (source_url IS NOT NULL OR source_label IS NOT NULL),
    CONSTRAINT newsletter_outreach_contacts_email_lower_chk
        CHECK (email = lower(trim(email)))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_outreach_contacts_status
    ON public.newsletter_outreach_contacts (status, contact_type);

CREATE TABLE IF NOT EXISTS public.newsletter_distribution_campaigns (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_slug    text NOT NULL,
    issue_title   text NOT NULL,
    summary       text NOT NULL,
    canonical_url text NOT NULL,
    cta_role      text,
    issue_number  integer,
    status        text NOT NULL DEFAULT 'draft',
    approved_by   text,
    approved_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT newsletter_distribution_campaigns_status_chk
        CHECK (status IN (
            'draft', 'ready_for_review', 'approved', 'queued',
            'sent', 'failed', 'cancelled'
        ))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_distribution_campaigns_issue
    ON public.newsletter_distribution_campaigns (issue_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS public.newsletter_distribution_messages (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id        uuid NOT NULL REFERENCES public.newsletter_distribution_campaigns(id)
                       ON DELETE CASCADE,
    channel            text NOT NULL,
    variant            text NOT NULL DEFAULT 'primary',
    subject            text,
    body               text NOT NULL,
    call_to_action_url text NOT NULL,
    status             text NOT NULL DEFAULT 'ready_for_review',
    external_id        text,
    error              text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT newsletter_distribution_messages_channel_chk
        CHECK (channel IN ('email', 'linkedin', 'x', 'instagram', 'whatsapp')),
    CONSTRAINT newsletter_distribution_messages_status_chk
        CHECK (status IN (
            'draft', 'ready_for_review', 'approved', 'queued',
            'sent', 'posted', 'failed', 'skipped'
        )),
    CONSTRAINT newsletter_distribution_messages_unique_variant
        UNIQUE (campaign_id, channel, variant)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_distribution_messages_campaign
    ON public.newsletter_distribution_messages (campaign_id, channel);

CREATE TABLE IF NOT EXISTS public.newsletter_email_outreach_queue (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     uuid NOT NULL REFERENCES public.newsletter_distribution_campaigns(id)
                    ON DELETE CASCADE,
    contact_id      uuid NOT NULL REFERENCES public.newsletter_outreach_contacts(id)
                    ON DELETE CASCADE,
    message_id      uuid NOT NULL REFERENCES public.newsletter_distribution_messages(id)
                    ON DELETE CASCADE,
    recipient_email text NOT NULL,
    status          text NOT NULL DEFAULT 'queued',
    queued_at       timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz,
    error           text,
    CONSTRAINT newsletter_email_outreach_queue_status_chk
        CHECK (status IN ('queued', 'sent', 'failed', 'skipped', 'suppressed')),
    CONSTRAINT newsletter_email_outreach_queue_once
        UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email_outreach_queue_status
    ON public.newsletter_email_outreach_queue (status, queued_at);

CREATE OR REPLACE FUNCTION public.newsletter_campaign_approved_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        NEW.approved_at = COALESCE(NEW.approved_at, now());
    END IF;
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_newsletter_campaign_approved_at
    ON public.newsletter_distribution_campaigns;
CREATE TRIGGER trg_newsletter_campaign_approved_at
    BEFORE UPDATE ON public.newsletter_distribution_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.newsletter_campaign_approved_at();

ALTER TABLE public.newsletter_outreach_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_distribution_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_distribution_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_email_outreach_queue ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.newsletter_outreach_contacts IS
    'Review-first newsletter outreach contacts with required provenance and suppression status.';
COMMENT ON TABLE public.newsletter_distribution_campaigns IS
    'Newsletter distribution campaigns. Approved before queueing or posting.';
COMMENT ON TABLE public.newsletter_distribution_messages IS
    'Per-channel generated drafts for email, LinkedIn, X, Instagram, and WhatsApp.';
COMMENT ON TABLE public.newsletter_email_outreach_queue IS
    'Email outreach queue. One row per campaign/contact; sender jobs process approved rows only.';

NOTIFY pgrst, 'reload schema';
