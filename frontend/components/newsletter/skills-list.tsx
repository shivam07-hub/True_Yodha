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
    <div className="nl-fig" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {skills.map((skill, i) => (
        <div key={i} className="nl-bar">
          <span className="nl-num" style={{ width: 20, fontSize: 11, color: "var(--tm-text-faint)" }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="nl-bar-name" style={{ flex: 1, fontSize: 14 }}>{skill.name}</span>
          <div className="nl-bar-track" style={{ flex: "0 0 100px", height: 4 }}>
            <div className="nl-bar-fill" style={{ width: `${(skill.count / max) * 100}%` }} />
          </div>
          <span className="nl-num" style={{ width: 32, fontSize: 12, color: "var(--tm-text-faint)" }}>
            {skill.count}
          </span>
        </div>
      ))}
    </div>
  )
}
