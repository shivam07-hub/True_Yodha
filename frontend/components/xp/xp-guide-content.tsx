import type { ElementType } from "react"
import {
  BookOpen,
  Building2,
  Clock,
  FileText,
  Lightbulb,
  RefreshCw,
  Share2,
  Target,
} from "lucide-react"
import { LinkedInIcon } from "@/components/icons/social-icons"
import { XP_EARN_ACTIONS, XP_POLICY, XP_SPEND_ACTIONS } from "@/lib/xp-policy"

type XpAction = typeof XP_EARN_ACTIONS[number] | typeof XP_SPEND_ACTIONS[number]
type XpIcon = ElementType

const earnIcons: XpIcon[] = [Clock, BookOpen, LinkedInIcon, FileText, Share2]
const spendIcons: XpIcon[] = [Target, Building2, Lightbulb, RefreshCw]

function XpActionRow({
  item,
  icon: Icon,
  compact,
  muted,
}: {
  item: XpAction
  icon: XpIcon
  compact?: boolean
  muted?: boolean
}) {
  const iconSize = compact ? 15 : 17
  const iconBox = compact ? 28 : 34

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${iconBox}px minmax(0,1fr) auto`,
        gap: compact ? 10 : 12,
        alignItems: "start",
        padding: compact ? "10px 0" : "14px 0",
        borderBottom: "1px solid var(--tm-border-soft)",
        opacity: muted ? 0.68 : 1,
      }}
    >
      <div
        style={{
          width: iconBox,
          height: iconBox,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: "var(--tm-accent-wash)",
          color: "var(--tm-accent)",
          border: "1px solid var(--tm-accent-ring)",
        }}
      >
        <Icon size={iconSize} aria-hidden />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: "var(--tm-text)" }}>
            {item.title}
          </span>
          {muted && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--tm-font-mono)",
                color: "var(--tm-text-faint)",
                border: "1px solid var(--tm-border-soft)",
                borderRadius: 999,
                padding: "1px 6px",
              }}
            >
              PLANNED
            </span>
          )}
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
        style={{
          fontFamily: "var(--tm-font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: compact ? 12 : 13,
          fontWeight: 800,
          color: item.amount.startsWith("+") ? "var(--tm-success)" : "var(--tm-accent)",
          whiteSpace: "nowrap",
          paddingTop: 2,
          textAlign: "right",
          minWidth: 64,
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
          Earn XP
        </div>
        {XP_EARN_ACTIONS.map((item, index) => (
          <XpActionRow
            key={item.title}
            item={item}
            icon={earnIcons[index] ?? Clock}
            compact={compact}
            muted={item.status === "planned"}
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
          Spend XP
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
      Fairness rule: Myro should only spend XP when the action completes. Skill advice is charged after advice exists,
      and match refresh spends {XP_POLICY.matchRefreshCost} XP only when it writes new matches.
    </div>
  )
}
