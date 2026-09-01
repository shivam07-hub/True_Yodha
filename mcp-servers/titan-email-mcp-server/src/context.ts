/** Shared runtime handles passed to every tool registrar. */

import type { TitanConfig } from "./config.js";
import type { TitanImap } from "./services/imap.js";
import type { TitanSmtp } from "./services/smtp.js";

export interface ServerContext {
  config: TitanConfig;
  imap: TitanImap;
  smtp: TitanSmtp;
}
