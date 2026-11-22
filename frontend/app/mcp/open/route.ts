import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { createMarketApi } from "@/lib/mcp/market-api"
import { registerOpenTools } from "@/lib/mcp/open-tools"

/**
 * POST /mcp/open — Myro's open MCP door: market answers, no sign-in
 * (ARCHITECTURE_MCP.md §3A).
 *
 * Stateless: a fresh server and transport per request, JSON responses, no
 * session id, so any instance answers any call and nothing about one caller
 * outlives their request. Each tool read is bounded at 8s (lib/mcp/market-api),
 * under the platform's function ceiling, so no maxDuration is set here.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const server = new McpServer({ name: "myro-market", version: "1.0.0" })
  registerOpenTools(
    server,
    createMarketApi({
      baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
      partnerKey: process.env.MYRO_MCP_OPEN_KEY,
    }),
  )
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}

function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. This MCP server is stateless: POST only." },
      id: null,
    }),
    { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } },
  )
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed
