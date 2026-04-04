# Phase 1G — End-to-End Validation

> Final gate before declaring Phase 1 complete.
> All items must pass before MVP is announced live.

---

## Checklist

### User Journey
- [ ] Full journey works: land → upload CV → target role → score reveal → dashboard
- [ ] LinkedIn OAuth sign-in works end-to-end
- [ ] CV upload handles PDF and DOCX (max 10MB enforced)
- [ ] Score reveal animation plays correctly

### Real User Testing
- [ ] 3 real users tested on staging (friends/family, not team members)
- [ ] Feedback collected and blockers resolved

### Performance
- [ ] All pages render correctly at 375px and 390px
- [ ] Page load < 3 seconds on simulated 4G (use Chrome DevTools throttle)
- [ ] No console errors in production build

### Security
- [ ] No API keys in any committed file (`git grep -r "sk-" .` returns nothing)
- [ ] RLS policies verified — user can only read their own scores and XP
- [ ] `rank_tier` and `percentile` confirmed absent from all API responses

### Deployment
- [ ] `GET /health` returns `{"status": "ok"}` from Railway URL
- [ ] Vercel production URL loads correctly
- [ ] Auto-deploy confirmed: push to `main` → Vercel builds → deploys within 3 minutes

---

## Sign-Off Criteria

Phase 1 is complete when:
1. All 7 phase checklists are 100% checked
2. 3 external users have successfully completed the full journey
3. No open P0 or P1 bugs
4. CLAUDE.md Last Session Summary is updated with "Phase 1 complete"
