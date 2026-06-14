# Myro User Feedback

This directory is the system of record for sanitized Myro user-research
analysis.

## Privacy boundary

Commit only:

- candidate-facing research instructions;
- blank intake and scoring templates;
- de-identified observations;
- aggregate counts and themes;
- sanitized quotations;
- analysis reports and product recommendations.

Never commit:

- CV files or CV text;
- names, email addresses, phone numbers, or application IDs;
- raw form or spreadsheet exports;
- unredacted screenshots or recordings;
- authentication details;
- private links that grant access to candidate files.

Raw responses must remain in the access-controlled form or hiring system. Use a
random research ID such as `B2-0001` when moving an observation into this
directory. Keep the separate identity-to-research-ID mapping outside Git.

## Canonical files

- `01-candidate-assignment-message.md`: ready-to-send assignment brief.
- `02-feedback-intake-and-scoring.md`: form schema and hiring rubric.
- `03-feedback-analysis-playbook.md`: repeatable analysis process.

## Working rule

Hiring assessment and product research use the same submission but answer
different questions:

- Hiring asks how carefully the candidate observed, reasoned, prioritized, and
  communicated.
- Product research asks what happened in Myro, how often it happened, how
  severely it affected users, and what evidence supports a change.

A low Myro Score, an imperfect CV, negative feedback, or disagreement with the
team must never reduce a candidate's hiring score.
