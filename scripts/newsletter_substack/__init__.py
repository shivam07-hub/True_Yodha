"""Myro newsletter issues → Substack drafts.

The private editor API has no public write surface. This package creates
drafts with a browser session cookie. It does not publish and it does not
send email unless ``publish_draft`` is called with ``confirm=True``, and
even then the publish request forces email send off.

Environment (live create-draft only when both are set):

- ``SUBSTACK_PUBLICATION_URL`` — publication origin, for example
  ``https://<slug>.substack.com``. Not ``https://himyro.substack.com``:
  that host is a publication titled "mimi", not the Myro hiring newsletter
  (checked 2026-10-15). The client refuses that host.
- ``SUBSTACK_SID`` — session cookie value (``substack.sid``, or
  ``connect.sid`` on a custom domain). Secret. Never commit it, never log it.

The website subscribe box reads a different variable, the same origin and
no cookie: ``NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL`` in the frontend env.
Leave it unset to keep the on-site email capture.

When neither Substack variable is set, conversion and the stdio MCP still
run. They do not call the network.

Launch the MCP server (stdio, local only):

    backend/.venv/bin/python scripts/newsletter-substack-mcp.py

Tools: ``push_issue_draft``, ``get_draft``, ``publish_draft``.
``push_issue_draft`` uploads the chart. There is no separate upload tool.
"""
