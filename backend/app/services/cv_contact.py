"""Deterministic CV header parsing — the contact block, read locally.

Why this is not an LLM job
--------------------------
The contact block (name, title, email, phone, location, LinkedIn) is the one
part of a CV that is *positional and literal*, not interpretive. An LLM adds
nothing here and costs two things: a round-trip, and — fatally — it cannot see
the header at all, because `sanitize_cv_text_for_ai` strips direct identifiers
before anything leaves the machine. Asking the model for a name it was never
shown is how `[REDACTED_CV_HEADER]` ended up printed as a user's name on a
downloaded CV.

So the header never leaves. It is parsed here, on our own machine, from the
raw extracted text. This is simultaneously the most private and the most
accurate option available.

Contract
--------
Pure, offline, no network, no LLM. Every field is verbatim from the CV or an
empty string — this module never guesses a name (ADR-0016, no fabrication).
"""

from __future__ import annotations

import re

# Headings that end the header block. Includes the ones `cv_compose` emits, so
# a Myro-composed CV round-trips through this parser unchanged.
_SECTION_WORDS = {
    "experience", "work experience", "professional experience", "employment",
    "employment history", "work history", "career history",
    "education", "academic background", "qualifications",
    "skills", "technical skills", "core skills", "key skills", "competencies",
    "projects", "personal projects", "academic projects",
    "certifications", "certificates", "licenses",
    "summary", "professional summary", "profile", "objective", "about",
    "achievements", "awards", "honors", "honours", "publications",
    "interests", "hobbies", "languages", "references", "volunteering",
}

_MAX_HEADER_LINES = 12  # a header longer than this is not a header

_EMAIL = re.compile(r"(?i)(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w.-])")
_LINKEDIN = re.compile(r"(?i)\b(?:https?://)?(?:[\w-]+\.)?linkedin\.com/[^\s|·•,]+")
_URL = re.compile(r"(?i)\bhttps?://[^\s|·•,]+|\b(?:www\.)[^\s|·•,]+")
# A candidate digit run. Validated by `looks_like_phone` — the raw shape alone
# matches dates and metric triples, which is exactly the bug this replaces.
PHONE_CANDIDATE = re.compile(r"(?<!\w)(\+?\(?\d[\d\s().-]{6,17}\d)(?!\w)")
_DMY_DATE = re.compile(r"^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$")
_YEARISH = re.compile(r"\b(?:19|20)\d{2}\b")
_DELIMITERS = re.compile(r"\s*[|·•‧∙]\s*|\s+[–—]\s+")
# Starts with a letter and holds no digits. Unicode-aware, so "José Álvarez" and
# "Ashwani Maurya" are both names — an ASCII-only shape silently dropped the
# former and fell back to a profile name that may not match the CV.
_NAME_ALLOWED = re.compile(r"^[^\W\d_][^\d]*$", re.UNICODE)
# Anything outside letters, spaces, and name punctuation disqualifies it.
_NAME_BAD_CHARS = re.compile(r"[^\w .'\-]", re.UNICODE)
# "Bengaluru, India" — a location, not a job title.
_LOCATION_SHAPE = re.compile(r"^[^\d]{2,40}$")


def looks_like_phone(token: str) -> bool:
    """True only for a real phone-shaped token.

    Rejects the two false positives that made the previous loose pattern eat CV
    content: `dd-mm-yyyy` dates and space-separated metric triples
    (`250 500 1200`). A phone has 7–15 digits and is not a date.
    """
    tok = token.strip()
    if _DMY_DATE.match(tok):
        return False
    if len(_YEARISH.findall(tok)) >= 2:
        return False
    digits = re.sub(r"\D", "", tok)
    if not 7 <= len(digits) <= 15:
        return False
    # A bare digit run of exactly a year, or several years in a row, is a date.
    return not (len(digits) == 8 and _YEARISH.search(tok) and "-" in tok)


# A phone written unambiguously: country code, parenthesised area code, or
# punctuated groups. Metrics are written with spaces, never with these.
_PHONE_LABEL = re.compile(r"(?i)(?:phone|tel|telephone|mob|mobile|cell|contact|whatsapp)\W{0,3}$")


def is_unambiguous_phone(token: str, preceding: str = "") -> bool:
    """True when `token` is a phone by *shape or label*, not merely by digit count.

    In a CV body, `250 500 1200` is a metric far more often than a phone, and
    redacting it damages the user's own bullet. The header parser can afford the
    permissive test because its context already says "this is the contact block";
    the body backstop cannot, so it demands a positive signal.
    """
    if not looks_like_phone(token):
        return False
    tok = token.strip()
    return (
        tok.startswith("+")
        or "(" in tok
        or ")" in tok
        or len(re.findall(r"[-.]", tok)) >= 2
        or bool(_PHONE_LABEL.search(preceding[-24:]))
    )


def find_phone(text: str, *, strict: bool = False) -> str:
    """First validated phone in `text`, or "".

    `strict=True` applies `is_unambiguous_phone` — use it anywhere the
    surrounding text is professional content rather than a contact block.
    """
    for match in PHONE_CANDIDATE.finditer(text):
        token = match.group(1).strip()
        if strict:
            if is_unambiguous_phone(token, text[: match.start()]):
                return token
        elif looks_like_phone(token):
            return token
    return ""


def is_section_heading(line: str) -> bool:
    """True when `line` reads as a CV section heading rather than content."""
    stripped = line.strip().strip(":").strip()
    if not stripped or len(stripped) > 40:
        return False
    return re.sub(r"[^a-z ]", "", stripped.lower()).strip() in _SECTION_WORDS


def header_lines(text: str) -> list[str]:
    """The CV's header block: non-empty lines before the first section heading,
    capped at `_MAX_HEADER_LINES`.

    Detected, never positional. A CV whose name and contact share one line has a
    one-line header; a CV with six contact lines has a six-line header. The old
    "blank the first three lines" rule deleted real experience rows from the
    former and left identifiers in the latter.
    """
    out: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if is_section_heading(line):
            break
        out.append(line)
        if len(out) >= _MAX_HEADER_LINES:
            break
    return out


def has_direct_identifier(line: str) -> bool:
    """True when the line carries an email, phone, or URL."""
    return bool(_EMAIL.search(line) or _LINKEDIN.search(line) or _URL.search(line)) or bool(find_phone(line))


def _segments(line: str) -> list[str]:
    return [s.strip() for s in _DELIMITERS.split(line) if s.strip()]


def _name_candidate(segment: str) -> str:
    """`segment` as a person's name, or "" when it is not name-shaped."""
    seg = segment.strip().strip(",")
    if not seg or len(seg) > 60 or is_section_heading(seg):
        return ""
    if not _NAME_ALLOWED.match(seg) or _NAME_BAD_CHARS.search(seg):
        return ""
    return seg if 1 <= len(seg.split()) <= 5 else ""


def _looks_like_location(segment: str) -> bool:
    """"Bengaluru, India" — a comma-joined place, not a job title."""
    seg = segment.strip()
    return "," in seg and bool(_LOCATION_SHAPE.match(seg))


def parse_contact(raw_text: str) -> dict[str, str]:
    """Extract the contact block from raw CV text.

    Returns every key always; a field we cannot read verbatim is "". Callers
    fall back to the profile name — which only works because this never returns
    a placeholder.
    """
    empty = {"name": "", "title": "", "email": "", "phone": "", "location": "", "linkedin": ""}
    lines = header_lines(raw_text or "")
    if not lines:
        return empty

    window = "\n".join(lines)
    email_match = _EMAIL.search(window)
    linkedin_match = _LINKEDIN.search(window)
    email = email_match.group(0) if email_match else ""
    linkedin = linkedin_match.group(0) if linkedin_match else ""
    phone = find_phone(window)

    name = ""
    name_line_index = -1
    for index, line in enumerate(lines):
        for segment in _segments(line):
            candidate = _name_candidate(segment)
            if candidate:
                name, name_line_index = candidate, index
                break
        if name:
            break

    # Location: a "City, Country" shaped segment that is neither the name nor an
    # identifier. Anything less certain stays empty rather than guessed.
    location = ""
    for line in lines:
        for segment in _segments(line):
            if segment != name and not has_direct_identifier(segment) and _looks_like_location(segment):
                location = segment
                break
        if location:
            break

    # The line under the name is the headline/current role, unless it is the
    # location we just read.
    title = ""
    if 0 <= name_line_index < len(lines) - 1:
        nxt = lines[name_line_index + 1]
        segments = _segments(nxt)
        first = segments[0] if segments else ""
        if (
            first
            and first != location
            and not _looks_like_location(first)
            and not has_direct_identifier(nxt)
            and len(first) <= 80
            and not is_section_heading(first)
        ):
            title = first

    return {
        "name": name,
        "title": title,
        "email": email,
        "phone": phone,
        "location": location,
        "linkedin": linkedin,
    }
