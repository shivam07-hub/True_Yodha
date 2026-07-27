import type { ElementType } from "react"
import {
  BookOpen,
  Briefcase,
  Building2,
  Clock,
  FileText,
  Lightbulb,
  RefreshCw,
  Target,
} from "lucide-react"
import { LinkedInIcon } from "@/components/icons/social-icons"
import { XP_EARN_ACTIONS, MYRO_COINS_POLICY, XP_SPEND_ACTIONS } from "@/lib/xp-policy"

type XpAction = typeof XP_EARN_ACTIONS[number] | typeof XP_SPEND_ACTIONS[number]
type XpIcon = ElementType

// Only live earn actions are surfaced. Planned actions (e.g. referral) stay in
// XP_EARN_ACTIONS so flipping status:"live" auto-surfaces them once shipped —
// we never show an unearnable "PLANNED" reward to the user.
const liveEarnActions = XP_EARN_ACTIONS.filter((item) => item.status === "live")
const earnIcons: XpIcon[] = [Clock, BookOpen, LinkedInIcon, FileText, Briefcase]
const spendIcons: XpIcon[] = [Target, Building2, Lightbulb, RefreshCw]

function XpActionRow({
  item,
  icon: Icon,
  compact,
}: {
  item: XpAction
  icon: XpIcon
  compact?: boolean
}) {
  const iconSize = compact ? 15 : 17
  const iconBox = compact ? 28 : 34

  return (
    /* The amount column is `auto` + nowrap, so it cannot shrink. Beside a
       minmax(0,1fr) text column at 375px it claimed ~200px and starved the
       text to a ~4-character ribbon — "Clear / a / skill / level" one word per
       line, with the amount interleaved into the title. `.tm-xp-row` drops the
       third column on phones and re-flows the amount under the text instead
       (see globals.css). Keeping the grid in CSS is what lets it be
       width-aware at all; inline styles cannot carry a media query. */
    <div
      className="tm-xp-row"
      style={{
        gridTemplateColumns: `${iconBox}px minmax(0,1fr) auto`,
        gap: compact ? 10 : 12,
        padding: compact ? "10px 0" : "14px 0",
      }}
    >
      <div
        style={{
          width: iconBox,
          height: iconBox,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: "var(--tm-int-bg-wash)",
          color: "var(--tm-interactive)",
          border: "1px solid var(--tm-int-border)",
        }}
      >
        <Icon size={iconSize} aria-hidden />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: "var(--tm-text)" }}>
            {item.title}
          </span>
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: compact ? 12 : 13,
            color: "var(--tm-text-faint)",
            lineHeight: 1.5,
          }}
        >
          {item.detail}
        </div>
      </div>
      <div
        className="tm-xp-row-amount"
        style={{
          fontFamily: "var(--tm-font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: compact ? 12 : 13,
          fontWeight: 800,
          color: item.amount.startsWith("+") ? "var(--tm-success)" : "var(--tm-interactive)",
          paddingTop: 2,
        }}
      >
        {item.amount}
      </div>
    </div>
  )
}

export function XpGuideLists({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: compact ? 24 : 28,
      }}
    >
      <section>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "var(--tm-text-faint)",
            marginBottom: 6,
          }}
        >
          Earn Myro Coins
        </div>
        {liveEarnActions.map((item, index) => (
          <XpActionRow
            key={item.title}
            item={item}
            icon={earnIcons[index] ?? Clock}
            compact={compact}
          />
        ))}
      </section>

      <section>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "var(--tm-text-faint)",
            marginBottom: 6,
          }}
        >
          Spend Myro Coins
        </div>
        {XP_SPEND_ACTIONS.map((item, index) => (
          <XpActionRow key={item.title} item={item} icon={spendIcons[index] ?? Target} compact={compact} />
        ))}
      </section>
    </div>
  )
}

export function XpFairnessNote({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        padding: compact ? "10px 12px" : "14px 16px",
        borderRadius: 8,
        border: "1px solid var(--tm-border-soft)",
        background: "rgba(255,255,255,0.025)",
        fontSize: compact ? 12 : 13,
        color: "var(--tm-text-faint)",
        lineHeight: 1.5,
      }}
    >
      Fairness rule: Myro should only spend Myro Coins when the action completes. Skill advice is charged after advice exists,
      and match refresh spends {MYRO_COINS_POLICY.matchRefreshCost} Myro Coins only when it writes new matches.
    </div>
  )
}
