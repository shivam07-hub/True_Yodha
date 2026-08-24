import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CONFIG_FILE = join(homedir(), ".config", "titan-email-mcp", ".env");

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

export function loadPrivateEnvironment(file = process.env.TITAN_CONFIG_FILE || DEFAULT_CONFIG_FILE): void {
  if (!existsSync(file)) return;

  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(`Refusing to read ${file}: it must not be readable by group or others (run chmod 600).`);
  }

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, name, value] = match;
    if (process.env[name] === undefined) process.env[name] = unquote(value);
  }
}
