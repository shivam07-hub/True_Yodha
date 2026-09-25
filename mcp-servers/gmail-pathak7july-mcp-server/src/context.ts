/** Shared runtime handles passed to every tool registrar. */

import type { MailConfig } from "./config.js";
import type { MailImap } from "./services/imap.js";
import type { MailSmtp } from "./services/smtp.js";

export interface ServerContext {
  config: MailConfig;
  imap: MailImap;
  smtp: MailSmtp;
}
