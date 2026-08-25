import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, requireSendPermission } from "./config.js";

const credentials = { TITAN_EMAIL: "me@example.com", TITAN_APP_PASSWORD: "app-password" };

test("loads secure Titan defaults and disables sending", () => {
  const config = loadConfig(credentials);
  assert.equal(config.imapHost, "imap.titan.email");
  assert.equal(config.imapPort, 993);
  assert.equal(config.smtpHost, "smtp.titan.email");
  assert.equal(config.smtpPort, 465);
  assert.equal(config.allowSend, false);
});

test("requires both explicit configuration and confirmation before sending", () => {
  const disabled = loadConfig(credentials);
  assert.throws(() => requireSendPermission(disabled, true), /TITAN_ALLOW_SEND=true/);

  const enabled = loadConfig({ ...credentials, TITAN_ALLOW_SEND: "true" });
  assert.throws(() => requireSendPermission(enabled, false), /confirm=true/);
  assert.doesNotThrow(() => requireSendPermission(enabled, true));
});

test("rejects invalid port configuration", () => {
  assert.throws(() => loadConfig({ ...credentials, TITAN_IMAP_PORT: "0" }), /valid TCP port/);
});
