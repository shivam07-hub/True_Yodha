export const XP_POLICY = {
  welcomeBaseline: 1000,
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
  matchRefreshCost: 50,
  verifiedInviteReward: 100,
} as const

export const XP_EARN_ACTIONS = [
  {
    title: "Forge a skill",
    detail: "Focused sessions earn 3 XP per minute. Ambient sidebar sessions earn 2 XP per minute.",
    amount: `+${XP_POLICY.forgeFocusedMinutes * XP_POLICY.forgeFocusedRate} XP`,
    meta: "focused 25 min",
    status: "live",
  },
  {
    title: "Complete your diary",
    detail: "Log what you practiced or shipped so your skill evidence keeps improving.",
    amount: `+${XP_POLICY.diaryEntry} XP`,
    meta: "per entry",
    status: "live",
  },
  {
    title: "Add your LinkedIn",
    detail: "Connect your public profile so applications and CV work have a stronger identity signal.",
    amount: `+${XP_POLICY.linkedInProfile} XP`,
    meta: "once",
    status: "live",
  },
  {
    title: "Build your CV baseline",
    detail: "Upload a CV or write your experience during onboarding.",
    amount: `+${XP_POLICY.welcomeBaseline} XP`,
    meta: "once",
    status: "live",
  },
  {
    title: "Share with a friend",
    detail: "A verified invite should reward the work of bringing another job seeker in.",
    amount: `+${XP_POLICY.verifiedInviteReward} XP`,
    meta: "planned",
    status: "planned",
  },
] as const

export const XP_SPEND_ACTIONS = [
  {
    title: "Analyse a job",
    detail: "Run the skill gap and explanation for a saved job.",
    amount: `-${XP_POLICY.analyseJobCost} XP`,
  },
  {
    title: "Follow a target company",
    detail: `Track up to ${XP_POLICY.followedCompanyLimit} companies. Following can use the ${XP_POLICY.followCompanyFloor} XP floor.`,
    amount: `-${XP_POLICY.followCompanyCost} XP`,
  },
  {
    title: "Get skill advice",
    detail: "Charged only after advice is generated from your CV evidence.",
    amount: `-${XP_POLICY.skillAdviceCost} XP`,
  },
  {
    title: "Refresh matches",
    detail: "Requires enough XP to start. Charged only when new matches are written.",
    amount: `-${XP_POLICY.matchRefreshCost} XP if new`,
  },
] as const
