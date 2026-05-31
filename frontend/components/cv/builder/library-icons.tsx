"use client"

export function LIcon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d}/>
    </svg>
  )
}

export const I = {
  folder:   "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  plus:     "M12 5v14M5 12h14",
  chevR:    "M9 6l6 6-6 6",
  chevD:    "M6 9l6 6 6-6",
  edit:     "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  target:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  pulse:    "M3 12h4l2-6 4 12 2-6h6",
  file:     "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z M14 3v6h6",
  upload:   "M12 21V9m0 0L7 14m5-5l5 5 M4 5h16",
  close:    "M18 6 6 18M6 6l12 12",
}
