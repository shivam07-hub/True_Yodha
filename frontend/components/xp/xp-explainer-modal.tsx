"use client"

import {
  BookOpen,
  Building2,
  Clock,
  FileText,
  Lightbulb,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  X,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { XP_EARN_ACTIONS, XP_POLICY, XP_SPEND_ACTIONS } from "@/lib/xp-policy"

const earnIcons = [Clock, BookOpen, FileText, Share2]
const spendIcons = [Target, Building2, Lightbulb, RefreshCw]

function XpRow({
  title,
  detail,
  amount,
  icon: Icon,
  muted,
}: {
  title: string
  detail: string
  amount: string
  icon: typeof Clock
  muted?: boolean
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "28px minmax(0,1fr) auto",
      gap: 10,
      alignItems: "start",
      padding: "10px 0",
      borderBottom: "1px solid var(--tm-border-soft)",
      opacity: muted ? 0.68 : 1,
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        background: "var(--tm-accent-wash)",
        color: "var(--tm-accent)",
        border: "1px solid var(--tm-accent-ring)",
      }}>
        <Icon size={15} aria-hidden />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text)" }}>{title}</span>
          {muted && (
            <span style={{
              fontSize: 10,
              fontFamily: "var(--tm-font-mono)",
              color: "var(--tm-text-faint)",
              border: "1px solid var(--tm-border-soft)",
              borderRadius: 999,
              padding: "1px 6px",
            }}>
              PLANNED
            </span>
          )}
        </div>
        <div style={{ marginTop: 3, fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.45 }}>
          {detail}
        </div>
      </div>
      <div style={{
        fontFamily: "var(--tm-font-mono)",
        fontSize: 12,
        fontWeight: 700,
        color: amount.startsWith("+") ? "var(--tm-success)" : "var(--tm-accent)",
        whiteSpace: "nowrap",
        paddingTop: 2,
      }}>
        {amount}
      </div>
    </div>
  )
}

export function XpExplainerModal({
  open,
  onClose,
  balance,
}: {
  open: boolean
  onClose: () => void
  balance: number
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[760px] max-w-[calc(100%-1.5rem)] p-0 bg-transparent ring-0"
        style={{
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-lg)",
          boxShadow: "0 0 60px rgba(0,0,0,0.62)",
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "20px 22px",
          borderBottom: "1px solid var(--tm-border-soft)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "var(--tm-accent)",
            color: "var(--tm-accent-fg)",
            boxShadow: "0 0 18px var(--tm-accent-glow)",
            flexShrink: 0,
          }}>
            <Sparkles size={19} aria-hidden />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--tm-text)" }}>
              How XP Works
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--tm-text-faint)", lineHeight: 1.45 }}>
              Earn XP by doing career work. Spend it on heavier analysis.
            </p>
          </div>
          <div style={{
            padding: "7px 10px",
            borderRadius: 8,
            background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-accent-ring)",
            fontFamily: "var(--tm-font-mono)",
            fontSize: 13,
            fontWeight: 800,
            color: "var(--tm-text)",
            whiteSpace: "nowrap",
          }}>
            {balance} XP
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close XP guide"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid transparent",
              background: "transparent",
              color: "var(--tm-text-faint)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div style={{ padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          <section>
            <div style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 6 }}>
              Earn XP
            </div>
            {XP_EARN_ACTIONS.map((item, index) => (
              <XpRow
                key={item.title}
                title={item.title}
                detail={item.detail}
                amount={item.amount}
                icon={earnIcons[index]}
                muted={item.status === "planned"}
              />
            ))}
          </section>

          <section>
            <div style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 6 }}>
              Spend XP
            </div>
            {XP_SPEND_ACTIONS.map((item, index) => (
              <XpRow
                key={item.title}
                title={item.title}
                detail={item.detail}
                amount={item.amount}
                icon={spendIcons[index]}
              />
            ))}
          </section>
        </div>

        <div style={{
          margin: "0 22px 22px",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--tm-border-soft)",
          background: "rgba(255,255,255,0.025)",
          fontSize: 12,
          color: "var(--tm-text-faint)",
          lineHeight: 1.45,
        }}>
          Fairness rule: Myro should only spend XP when the action completes. Skill advice is charged after advice exists, and match refresh spends {XP_POLICY.matchRefreshCost} XP only when it writes new matches.
        </div>
      </DialogContent>
    </Dialog>
  )
}
