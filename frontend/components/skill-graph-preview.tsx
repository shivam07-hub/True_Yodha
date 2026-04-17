"use client"

// Skill graph visualization — unlocked (possessed) vs locked (target) skills
// Inspired by Obsidian's connected graph view

interface Node {
  id: string
  x: number
  y: number
  label: string
  unlocked: boolean
}

interface Edge {
  from: string
  to: string
}

const NODES: Node[] = [
  { id: "python",    x: 70,  y: 55,  label: "Python",       unlocked: true  },
  { id: "sql",       x: 180, y: 35,  label: "SQL",          unlocked: true  },
  { id: "react",     x: 45,  y: 140, label: "React",        unlocked: true  },
  { id: "ts",        x: 145, y: 115, label: "TypeScript",   unlocked: true  },
  { id: "java",      x: 270, y: 65,  label: "Java",         unlocked: true  },
  { id: "analysis",  x: 100, y: 195, label: "Data Analysis",unlocked: true  },
  { id: "ml",        x: 235, y: 140, label: "ML",           unlocked: false },
  { id: "spark",     x: 175, y: 195, label: "Spark",        unlocked: false },
  { id: "k8s",       x: 305, y: 155, label: "Kubernetes",   unlocked: false },
  { id: "go",        x: 310, y: 85,  label: "Go",           unlocked: false },
]

const EDGES: Edge[] = [
  { from: "python", to: "sql"      },
  { from: "python", to: "ml"       },
  { from: "python", to: "analysis" },
  { from: "sql",    to: "analysis" },
  { from: "sql",    to: "spark"    },
  { from: "react",  to: "ts"       },
  { from: "ts",     to: "ml"       },
  { from: "java",   to: "k8s"      },
  { from: "java",   to: "go"       },
  { from: "ml",     to: "spark"    },
  { from: "k8s",    to: "go"       },
  { from: "analysis", to: "spark"  },
]

function getNode(id: string) {
  return NODES.find((n) => n.id === id)!
}

export function SkillGraphPreview() {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-background/50">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Your skill graph · live preview
        </p>
      </div>
      <svg
        viewBox="0 0 360 240"
        className="w-full"
        style={{ maxHeight: 220 }}
        aria-label="Skill graph visualization"
      >
        {/* Edges */}
        {EDGES.map((e, i) => {
          const a = getNode(e.from)
          const b = getNode(e.to)
          const bothUnlocked = a.unlocked && b.unlocked
          return (
            <line
              key={i}
              x1={a.x} y1={a.y}
              x2={b.x} y2={b.y}
              strokeWidth="1"
              stroke={bothUnlocked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              opacity={bothUnlocked ? 0.3 : 0.12}
            />
          )
        })}

        {/* Nodes */}
        {NODES.map((node) => (
          <g key={node.id}>
            {/* Glow ring on unlocked nodes */}
            {node.unlocked && (
              <circle
                cx={node.x} cy={node.y} r="10"
                fill="hsl(var(--primary))"
                opacity="0.12"
              >
                <animate
                  attributeName="r"
                  values="8;13;8"
                  dur="3s"
                  repeatCount="indefinite"
                  begin={`${(NODES.indexOf(node) * 0.4).toFixed(1)}s`}
                />
                <animate
                  attributeName="opacity"
                  values="0.12;0.04;0.12"
                  dur="3s"
                  repeatCount="indefinite"
                  begin={`${(NODES.indexOf(node) * 0.4).toFixed(1)}s`}
                />
              </circle>
            )}

            {/* Node circle */}
            <circle
              cx={node.x} cy={node.y} r="5"
              fill={node.unlocked ? "hsl(var(--primary))" : "transparent"}
              stroke={node.unlocked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              strokeWidth="1.5"
              opacity={node.unlocked ? 1 : 0.4}
            />

            {/* Label */}
            <text
              x={node.x}
              y={node.y + 16}
              textAnchor="middle"
              fontSize="8"
              fill={node.unlocked ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
              opacity={node.unlocked ? 0.8 : 0.4}
              fontFamily="inherit"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-border px-4 py-2">
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary inline-block" />
          Skills you have
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full border border-muted-foreground opacity-40 inline-block" />
          Skills to unlock
        </span>
      </div>
    </div>
  )
}
