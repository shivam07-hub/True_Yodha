"""Match Quality — does the product show a person the jobs they should see?

Every other gate proves the code is correct or reachable. None of them asks the
only question a job seeker has. On 2026-09-19 that gap cost us a real answer: a
backend engineer with a payments history had 34 jobs in her entire feed out of
38,824 live, and none of the 35 a manual search found for her. Six green gates
said nothing, because the code was correct — it was correct about the wrong
jobs.

Three parts, deliberately separate:

  `profile.py`           what we know about a person, from their account
  `reference_matcher.py` the yardstick — an uncapped search of the whole corpus
  `gate.py`              what production actually shows, measured against it

The yardstick shares NO code with production retrieval, ranking or eligibility.
It reads the `main_skills` mirror instead of the `job_skills` join the matcher
uses, and re-states the experience and direction rules in its own terms. A
reference built from the production modules would agree with production by
construction and measure nothing.

It is a yardstick, not truth. It was written by reading three shortlists a human
curated by hand (Rupanjana, Deveshwar, Namitha) and encoding the rules they
implied. Where it disagrees with a human, the human is right and the yardstick
is the thing to fix — `gate.py --validate` exists for exactly that.
"""
