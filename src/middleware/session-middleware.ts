import { Elysia } from "elysia"
import { auth } from "@/lib/auth"

export const sessionMiddleware = new Elysia().macro({
  auth: {
    resolve: async ({ request, status }) => {
      const result = await auth.api.getSession({
        headers: request.headers
      })

      if (!result) {
        return status(401, {
          message: "Acesso negado"
        })
      }

      return {
        session: result.session,
        user: result.user
      }
    }
  }
})
