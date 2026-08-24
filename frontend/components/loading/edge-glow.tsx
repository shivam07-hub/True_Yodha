/**
 * Accent edge-glow loader — the genuine "can't show a page skeleton yet" state
 * (e.g. the OAuth callback, which only decides /home vs /welcome after the token
 * exchange). It is now the full-bleed preset of the shared <AccentField> primitive
 * (dashboard-loading grill Q10): one motion engine for both this and the /home
 * masked playground, so the accent motif can't drift between them. The named
 * `EdgeGlow` export is preserved here so the callback import never churns.
 */
export { EdgeGlow } from "./accent-field"
