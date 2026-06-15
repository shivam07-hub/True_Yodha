import { getAllIssues, getIssueBySlug, datasetToCsv } from "@/lib/newsletter"

export const dynamic = "force-static"

// Pre-render a CSV for every issue that ships a `dataset:` block. Issues without
// one are simply not generated → the download link only appears where data exists.
export async function generateStaticParams() {
  const issues = await getAllIssues()
  return issues.filter((i) => i.dataset).map((i) => ({ slug: i.slug }))
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const issue = await getIssueBySlug(params.slug)
  if (!issue?.dataset) {
    return new Response("Not found", { status: 404 })
  }
  const csv = datasetToCsv(issue.dataset)
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${issue.slug}.csv"`,
      "Cache-Control": "public, max-age=3600",
    },
  })
}
