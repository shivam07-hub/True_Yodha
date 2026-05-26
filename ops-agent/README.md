# Myro Website Ops Agent

Repo-native CLI for checking Myro website operations from local source-of-truth context.

The v1 agent is intentionally local and read-only. It reads repository files, git state, and optional public health URLs. It does not send messages, mutate production systems, or use service-role credentials.

## Commands

Run from this directory:

```bash
python -m myro_ops.cli health
python -m myro_ops.cli feedback
python -m myro_ops.cli cv-upload
python -m myro_ops.cli release
python -m myro_ops.cli brief
python -m myro_ops.cli ask "what broke?"
```

## Optional Live Checks

Set these only when you want public URL checks included:

```bash
export MYRO_API_BASE_URL="https://your-api.example.com"
export MYRO_WEB_BASE_URL="https://your-web.example.com"
```

Generated reports are written under `reports/` and ignored by git.

## Safety Model

- Local repo checks work without credentials.
- Secret-looking values are redacted before report rendering.
- `.env` files are never read into reports.
- Production writes are out of scope for v1.
- New repeated procedures should become tested tools under `myro_ops/tools/`.

## Adding A Tool

1. Add a test under `tests/`.
2. Add a tool module under `myro_ops/tools/`.
3. Return a `ToolResult`.
4. Register the command in `myro_ops/tool_registry.py`.
5. Run `python -m pytest -q`.
