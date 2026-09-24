/**
 * Minimal .env loader.
 *
 * Deliberately does NOT go through a shell: sourcing a .env in sh expands
 * `$NAME` inside values, which silently mangles any password containing a
 * dollar sign. Values here are taken literally, apart from optional wrapping
 * quotes. Variables already present in the environment win, so an explicit
 * override from the MCP client config still works.
 */

import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(dir: string): string | null {
  const file = path.join(dir, ".env");
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(separator + 1).trim();

    // Strip one layer of matching quotes; keep everything inside verbatim.
    const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
    if (quoted) value = quoted[2];

    if (!(key in process.env)) process.env[key] = value;
  }
  return file;
}
