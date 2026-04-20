interface TruthMirrorLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizes = { sm: 20, md: 32, lg: 64 }

export function TruthMirrorLogo({ size = "md", className = "" }: TruthMirrorLogoProps) {
  const px = sizes[size]
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Truth Mirror"
    >
      {/* Full shield outline */}
      <path
        d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5C16.4 21 20 16.8 20 12V6L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Left half — the Yodha (solid, real) */}
      <clipPath id="left-half">
        <rect x="0" y="0" width="12" height="24" />
      </clipPath>
      <path
        d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5V2.5Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Right half — the reflection (ghost) */}
      <path
        d="M12 2.5L20 6v6c0 4.8-3.6 9-8 10.5V2.5Z"
        fill="currentColor"
        opacity="0.2"
      />
      {/* Mirror axis line */}
      <line
        x1="12" y1="2.5"
        x2="12" y2="22"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.5"
      />
    </svg>
  )
}
