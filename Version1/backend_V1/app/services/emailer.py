"""
Email delivery service.
Phase 1: Mock — logs the email that would be sent.
Phase 5: Will use SendGrid or Gmail SMTP.
"""

import logging
from app.schemas import MatchResponse
from app.config import SENDGRID_API_KEY, SENDER_EMAIL

logger = logging.getLogger(__name__)


def _format_email_body(response: MatchResponse) -> str:
    """Format match results into a clean email body."""
    lines = [
        f"Hi {response.candidate_name},",
        "",
        f"We've analyzed your CV against {response.total_jobs_in_db:,} active job listings "
        f"and found your top {len(response.top_matches)} matches:",
        "",
    ]

    for match in response.top_matches:
        lines.append(f"{'─' * 50}")
        lines.append(f"#{match.rank}  {match.job_title} @ {match.company_name}  ({match.score}% match)")
        location_parts = []
        if match.location_city:
            location_parts.append(match.location_city)
        if match.work_mode:
            location_parts.append(match.work_mode.title())
        if location_parts:
            lines.append(f"   Location: {' | '.join(location_parts)}")
        if match.seniority_level:
            lines.append(f"   Level: {match.seniority_level.title()}")
        if match.matching_skills:
            lines.append(f"   Matching skills: {', '.join(match.matching_skills)}")
        if match.missing_skills:
            lines.append(f"   Skills to develop: {', '.join(match.missing_skills)}")
        lines.append(f"   Why it's a fit: {match.reasoning}")
        if match.job_url:
            lines.append(f"   Apply here: {match.job_url}")
        lines.append("")

    lines.extend([
        "─" * 50,
        "",
        "Good luck with your applications!",
        "— Job Match Bot",
    ])

    return "\n".join(lines)


async def send_results_email(response: MatchResponse) -> bool:
    """
    Send match results to the candidate via email.

    Phase 1 (current): Logs the email content.
    Phase 5: Will use SendGrid API.

    Returns:
        True if email was sent (or logged) successfully.
    """
    email_body = _format_email_body(response)

    if SENDGRID_API_KEY:
        # TODO Phase 5: Real SendGrid implementation
        # sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        # message = Mail(from_email=SENDER_EMAIL, to_emails=response.candidate_email, ...)
        # sg.send(message)
        pass

    # ── Mock: just log it ─────────────────────────────────────────
    logger.info(f"[MOCK EMAIL] To: {response.candidate_email}")
    logger.info(f"[MOCK EMAIL] Subject: Your Top {len(response.top_matches)} Job Matches")
    logger.info(f"[MOCK EMAIL] Body:\n{email_body}")

    return True
