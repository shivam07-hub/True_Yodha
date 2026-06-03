import { Detail, P, Section } from "@/components/docs/docs-sections"
import {
  PUBLIC_SCORE_DOMAINS,
  SCORE_ENGINE_FACTS,
  workedClusterScore,
  workedDomainScore,
} from "@/lib/score-methodology"

const WORKED = workedClusterScore({
  userSkillCount: 2,
  totalClusterSkills: 50,
  strongestLevel: 2,
})
const WORKED_DOMAIN = workedDomainScore(WORKED.clusterScore, 2)

export function ScoringSection() {
  return (
    <Section id="scoring" title="Your Myro Score">
      <P>
        Your Myro Score is a number from 0 to 100. It reflects the skill evidence in
        your CV, grouped into public career domains. The page does not recompute your
        score; it explains the same backend engine used after CV upload and score refresh.
      </P>
      <P>
        There are no fixed domain weights. A skill only contributes when your CV has
        evidence for it, and domains with no evidence are not counted against you.
      </P>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, margin: "16px 0" }}>
        {PUBLIC_SCORE_DOMAINS.map((domain) => (
          <div key={domain.short} style={{ border: "1px solid var(--tm-border-soft)", borderRadius: 8, padding: "10px 12px", background: "var(--tm-surface)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text)" }}>{domain.short}</div>
            <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.45, color: "var(--tm-text-faint)" }}>{domain.full}</div>
          </div>
        ))}
      </div>

      <Detail summary="Step-by-step calculation">
        <ol style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <li>
            <strong>Skill evidence</strong> — each CV signal maps to a skill level:
            mention L1, project L2, impact or certification L3, leadership L4.
            Enough depth evidence can lift a skill to L5.
          </li>
          <li>
            <strong>Cluster score</strong> — related skills are grouped first. The
            strongest level is divided by 5, then multiplied by a log coverage factor:
            <code style={{ marginLeft: 4 }}>{SCORE_ENGINE_FACTS.clusterFormula}</code>.
          </li>
          <li>
            <strong>Domain score</strong> — cluster scores in the same domain are averaged
            by skill count, then a breadth bonus rewards proving several skills in that
            domain. Result: 0-100 per domain.
          </li>
          <li>
            <strong>Myro Score</strong> — the final score is the mean of domains where
            your CV has evidence. Job-market demand shapes upgrade suggestions, not the
            total score itself.
          </li>
        </ol>
      </Detail>

      <Detail summary="Worked example">
        <p style={{ margin: 0 }}>
          Suppose your CV proves 2 skills in a 50-skill cluster and your strongest
          evidence is L2. The log coverage is <strong>{WORKED.coverage}</strong>;
          the cluster score is <strong>{WORKED.clusterScore}/100</strong>. With two
          evidenced skills in that domain, the breadth bonus lifts the domain score
          to about <strong>{WORKED_DOMAIN}/100</strong>.
        </p>
      </Detail>

      <P>
        To improve the score, add clearer evidence to your CV: shipped work, numbers,
        certification, leadership, and more than one proved skill inside the same area.
      </P>
    </Section>
  )
}
