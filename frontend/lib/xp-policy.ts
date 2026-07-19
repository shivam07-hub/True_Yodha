export const MYRO_COINS_POLICY = {
  welcomeBaseline: 3000,
  linkedInProfile: 50,
  diaryEntry: 30,
  // Following a company is FREE — the 10 compare-slot cap is the only limit.
  followedCompanyLimit: 10,
  analyseJobCost: 10,
  // Myro Search — flat, every run (no free-if-new tier). Mirrors the backend
  // MATCH_RUN_COST=100. Charged on confirm; refund only on system failure.
  matchRefreshCost: 100,
  verifiedInviteReward: 100,
  addJobReward: 20,
} as const

export const XP_EARN_ACTIONS = [
  {
    title: "Clear a skill level",
    detail: "Pass an upskilling set (8/10 or better) to bank Myro Coins and raise your level.",
    amount: "+20 / +30 / +50 Myro Coins",
    meta: "first clear per level",
    status: "live",
  },
  {
    title: "Complete your diary",
    detail: "Log what you practiced or shipped so your skill evidence keeps improving.",
    amount: `+${MYRO_COINS_POLICY.diaryEntry} Myro Coins`,
    meta: "per entry",
    status: "live",
  },
  {
    title: "Add your LinkedIn",
    detail: "Connect your public profile so applications and CV work have a stronger identity signal.",
    amount: `+${MYRO_COINS_POLICY.linkedInProfile} Myro Coins`,
    meta: "once",
    status: "live",
  },
  {
    title: "Build your CV baseline",
    detail: "Upload a CV or write your experience during onboarding.",
    amount: `+${MYRO_COINS_POLICY.welcomeBaseline} Myro Coins`,
    meta: "once",
    status: "live",
  },
  {
    title: "Save a job",
    detail: "Add a job to your collection — paste it, or upload the posting as a PDF, Word doc, or screenshot.",
    amount: `+${MYRO_COINS_POLICY.addJobReward} Myro Coins`,
    meta: "per job",
    status: "live",
  },
  {
    title: "Share with a friend",
    detail: "A verified invite should reward the work of bringing another job seeker in.",
    amount: `+${MYRO_COINS_POLICY.verifiedInviteReward} Myro Coins`,
    meta: "planned",
    status: "planned",
  },
] as const

export const XP_SPEND_ACTIONS = [
  {
    title: "Analyse a job",
    detail: "Run the skill gap and explanation for a saved job.",
    amount: `-${MYRO_COINS_POLICY.analyseJobCost} Myro Coins`,
  },
  {
    title: "Myro Search",
    detail: "Run the brain over the live market against your CV — the matches that clear the bar fill your Myro Ops folder.",
    amount: `-${MYRO_COINS_POLICY.matchRefreshCost} Myro Coins per search`,
  },
] as const
