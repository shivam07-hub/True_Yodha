interface PostAuthDestinationInput {
  next: string | null
  firstSignup: boolean
  hasPendingAnonCv: boolean
}

export function postAuthDestination({
  next,
  firstSignup,
  hasPendingAnonCv,
}: PostAuthDestinationInput): string {
  if (hasPendingAnonCv) return "/cv?upload=1"
  return next ?? (firstSignup ? "/onboarding" : "/market")
}
