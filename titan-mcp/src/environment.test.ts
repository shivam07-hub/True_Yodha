import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadPrivateEnvironment } from "./environment.js";

test("loads credentials from a private file without overwriting the process environment", () => {
  const directory = mkdtempSync(join(tmpdir(), "titan-mcp-"));
  const file = join(directory, ".env");
  writeFileSync(file, 'TITAN_EMAIL=file@example.com\nTITAN_APP_PASSWORD="file secret"\n');
  chmodSync(file, 0o600);

  const original = process.env.TITAN_EMAIL;
  delete process.env.TITAN_EMAIL;
  loadPrivateEnvironment(file);
  assert.equal(process.env.TITAN_EMAIL, "file@example.com");
  assert.equal(process.env.TITAN_APP_PASSWORD, "file secret");

  process.env.TITAN_EMAIL = "process@example.com";
  loadPrivateEnvironment(file);
  assert.equal(process.env.TITAN_EMAIL, "process@example.com");
  if (original === undefined) delete process.env.TITAN_EMAIL;
  else process.env.TITAN_EMAIL = original;
  delete process.env.TITAN_APP_PASSWORD;
});

test("rejects a secret file readable by other users", () => {
  const directory = mkdtempSync(join(tmpdir(), "titan-mcp-"));
  const file = join(directory, ".env");
  writeFileSync(file, "TITAN_EMAIL=file@example.com\n");
  chmodSync(file, 0o644);
  assert.throws(() => loadPrivateEnvironment(file), /chmod 600/);
});
