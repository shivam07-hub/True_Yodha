"use client"

import { Fragment } from "react"
import Image from "next/image"
import { useQuery } from "@tanstack/react-query"
import { humanCheckSlots, type HumanCheckSlots } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { rupees } from "@/lib/use-catalogue"
import { LINKEDIN_PATH, SHIVAM_LINKEDIN_URL } from "../linkedin"
import { SectionTitle } from "./section-title"
import { LandingUploadButton } from "./upload-button"
import { uploadDestination, type RolePick } from "./role-picker"

const MINUTE = 60 * 1000

/** The agreed list, nothing more (spec #66 §5). */
const CREDENTIALS = ["MBA, IIM Lucknow", "B.Tech, MIT Manipal", "CAT 99.65", "XAT 98.05"]

/** A dotted run that wraps between items, never inside one ("XAT / 98.05"). */
function Terms({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <Fragment key={item}>
          {i > 0 ? " · " : null}
          <span className="lp-term">{item}</span>
        </Fragment>
      ))}
    </>
  )
}

interface LandingReviewerProps {
  /** Rides the upload: the slot is offered after the score (ENG3's door). */
  pick: RolePick | null
}

/**
 * Spec #66 chapter 6, on Finlatics' "Meet Our Mentors" pattern: a plain
 * heading, one line, one person. Every paid check is read by Shivam, five at a
 * time (Q15), so the dots are his desk, live: filled = a check on it, hollow =
 * free now. All five filled says when a check bought now comes back, because a
 * check sells in every state (Q16, ENG3). A failed read hides the line; it
 * never shows a count it did not read.
 */
export function LandingReviewer({ pick }: LandingReviewerProps) {
  const { data: slots } = useQuery({
    queryKey: ["landing", "human-check"],
    queryFn: () => humanCheckSlots.get(),
    staleTime: MINUTE,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return (
    <section className="lp-chapter" data-bridge-step aria-label="Meet your reviewer">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle>Meet your reviewer</SectionTitle>
          <p className="lp-section-sub">Every paid review is read by one person.</p>
        </div>

        <div className="lp-reviewer">
          <Image
            className="lp-reviewer-photo"
            src="/reviewer/shivam-pathak.jpg"
            alt="Shivam Pathak"
            width={400}
            height={400}
            sizes="(max-width: 720px) 72px, 128px"
          />
          <h3 className="lp-reviewer-name">
            <a href={SHIVAM_LINKEDIN_URL} target="_blank" rel="noreferrer" aria-label="Shivam Pathak on LinkedIn">
              Shivam Pathak
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d={LINKEDIN_PATH} />
              </svg>
            </a>
          </h3>
          <p className="lp-reviewer-bio">
            Shivam has rewritten nearly 5,000 CVs and works in Data &amp; AI at a global tech
            consulting firm, after Accenture and JLL.
          </p>
          <p className="lp-reviewer-creds">
            <Terms items={CREDENTIALS} />
          </p>
        </div>

        {slots ? <SlotsLine slots={slots} /> : null}

        <div className="lp-chapter-action">
          <LandingUploadButton source="landing_reviewer" destination={uploadDestination(pick)}>
            Apply with your CV
          </LandingUploadButton>
        </div>
      </div>
    </section>
  )
}

function SlotsLine({ slots }: { slots: HumanCheckSlots }) {
  const taken = slots.capacity - slots.slots_open
  const full = slots.slots_open === 0
  const terms = [
    full ? `All ${slots.capacity} taken` : `${slots.slots_open} open now`,
    "CV check",
    "LinkedIn rewrite",
    full ? `yours back by ${formatDateTime(slots.ready_by)}` : `back in ${slots.check_hours} hours`,
    rupees(slots.price_paise),
  ]
  return (
    <p className="lp-reviewer-slots">
      <span className="lp-reviewer-dots" aria-hidden="true">
        {Array.from({ length: slots.capacity }, (_, i) => (
          <span key={i} className="lp-reviewer-dot" data-taken={i < taken ? "true" : "false"} />
        ))}
      </span>
      <span>
        <Terms items={terms} />
      </span>
    </p>
  )
}
