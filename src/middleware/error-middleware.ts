import { Elysia } from "elysia"
import { resolveApiError } from "@/lib/errors"
import { logApiFailure } from "@/lib/logger"

export const errorMiddleware = new Elysia({ name: "api-errors" }).onError(
  { as: "global" },
  ({ error, code, status, route, request }) => {
    const result = resolveApiError(error, String(code))
    logApiFailure(result.statusCode, error, `${request.method} ${route ?? "unmatched"}`)
    return status(result.statusCode, { message: result.message })
  }
)
