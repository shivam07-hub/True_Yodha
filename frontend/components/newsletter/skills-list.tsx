interface SkillRow {
  name: string
  count: number
}

interface SkillsListProps {
  skills: SkillRow[]
}

export function SkillsList({ skills }: SkillsListProps) {
  const max = Math.max(...skills.map((s) => s.count), 1)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "20px 0 40px" }}>
      {skills.map((skill, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", width: 20, flexShrink: 0 }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 14, color: "var(--tm-text)", flex: 1 }}>
            {skill.name}
          </span>
          <div style={{ width: 100, height: 4, background: "var(--tm-border-soft)", borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
            <div style={{
              height: "100%", borderRadius: 999,
              background: "linear-gradient(90deg, var(--data-1), var(--data-6))",
              width: `${(skill.count / max) * 100}%`,
            }} />
          </div>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)", width: 32, textAlign: "right", flexShrink: 0 }}>
            {skill.count}
          </span>
        </div>
      ))}
    </div>
  )
}
