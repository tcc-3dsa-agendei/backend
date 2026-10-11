import { APIError } from "better-auth"
import { auth } from "@/lib/auth"
import { resolveApiError } from "@/lib/errors"
import { logApiFailure } from "@/lib/logger"

export const handleAuthRequest = async (request: Request) => {
  try {
    const response = await auth.handler(request)
    if (response.status === 404 && !(await response.clone().text()).trim()) {
      const headers = new Headers(response.headers)
      headers.delete("Content-Length")
      headers.set("Content-Type", "application/json")
      return new Response(JSON.stringify({ message: "Não encontrado" }), { status: 404, headers })
    }
    if (response.status >= 500) {
      logApiFailure(500, undefined, "auth")
      const headers = new Headers(response.headers)
      headers.delete("Content-Length")
      headers.set("Content-Type", "application/json")
      return new Response(JSON.stringify({ message: "Erro interno do servidor" }), { status: 500, headers })
    }
    return response
  } catch (error) {
    const result = resolveApiError(error)
    logApiFailure(result.statusCode, error, "auth")
    const headers = new Headers(error instanceof APIError ? error.headers : undefined)
    headers.delete("Content-Length")
    headers.set("Content-Type", "application/json")
    const body = error instanceof APIError && error.statusCode < 500 ? error.body : { message: result.message }
    return new Response(JSON.stringify(body), { status: result.statusCode, headers })
  }
}
