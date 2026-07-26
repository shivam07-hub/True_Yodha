import assert from "node:assert/strict"
import test from "node:test"

import { readTraceId } from "../lib/api-error"

test("readTraceId reads the API correlation header first", () => {
  const response = new Response(null, {
    headers: {
      "x-correlation-id": "correlation-from-header",
      "x-trace-id": "legacy-trace",
    },
  })

  assert.equal(
    readTraceId(response, { correlation_id: "correlation-from-body" }),
    "correlation-from-header",
  )
})

test("readTraceId falls back to the correlation ID response field", () => {
  const response = new Response(null)

  assert.equal(
    readTraceId(response, { correlation_id: "correlation-from-body" }),
    "correlation-from-body",
  )
})
