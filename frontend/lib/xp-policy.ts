export const XP_POLICY = {
  welcomeBaseline: 3000,
  linkedInProfile: 50,
  diaryEntry: 30,
  forgeAmbientMinutes: 25,
  forgeAmbientRate: 2,
  forgeFocusedMinutes: 25,
  forgeFocusedRate: 3,
  skillAdviceCost: 20,
  followCompanyCost: 10,
  followedCompanyLimit: 10,
  followCompanyFloor: -30,
  analyseJobCost: 10,
  matchRefreshCost: 150,
  verifiedInviteReward: 100,
  addJobReward: 20,
} as const

export const XP_EARN_ACTIONS = [
  {
    title: "Practice a skill",
    detail: "Tokens build quietly in the background during practice sessions.",
    amount: `+${XP_POLICY.forgeFocusedMinutes * XP_POLICY.forgeFocusedRate} tokens`,
    meta: "soft cap 25 min",
    status: "live",
  },
  {
    title: "Complete your diary",
    detail: "Log what you practiced or shipped so your skill evidence keeps improving.",
    amount: `+${XP_POLICY.diaryEntry} tokens`,
    meta: "per entry",
    status: "live",
  },
  {
    title: "Add your LinkedIn",
    detail: "Connect your public profile so applications and CV work have a stronger identity signal.",
    amount: `+${XP_POLICY.linkedInProfile} tokens`,
    meta: "once",
    status: "live",
  },
  {
    title: "Build your CV baseline",
    detail: "Upload a CV or write your experience during onboarding.",
    amount: `+${XP_POLICY.welcomeBaseline} tokens`,
    meta: "once",
    status: "live",
  },
  {
    title: "Track a job",
    detail: "Add a job to your tracker — paste it, or upload the posting as a PDF, Word doc, or screenshot.",
    amount: `+${XP_POLICY.addJobReward} tokens`,
    meta: "per job",
    status: "live",
  },
  {
    title: "Share with a friend",
    detail: "A verified invite should reward the work of bringing another job seeker in.",
    amount: `+${XP_POLICY.verifiedInviteReward} tokens`,
    meta: "planned",
    status: "planned",
  },
] as const

export const XP_SPEND_ACTIONS = [
  {
    title: "Analyse a job",
    detail: "Run the skill gap and explanation for a saved job.",
    amount: `-${XP_POLICY.analyseJobCost} tokens`,
  },
  {
    title: "Follow a target company",
    detail: `Track up to ${XP_POLICY.followedCompanyLimit} companies. Following can use the ${XP_POLICY.followCompanyFloor} token floor.`,
    amount: `-${XP_POLICY.followCompanyCost} tokens`,
  },
  {
    title: "Get skill advice",
    detail: "Charged only after advice is generated from your CV evidence.",
    amount: `-${XP_POLICY.skillAdviceCost} tokens`,
  },
  {
    title: "Refresh matches",
    detail: "Requires enough tokens to start. Charged only when new matches are written.",
    amount: `-${XP_POLICY.matchRefreshCost} tokens if new`,
  },
] as const
