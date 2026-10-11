import { and, desc, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { services } from "@/db/schema/services"
import { apiDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { paginate, paginationQuerySchema } from "@/lib/pagination"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { serviceParamsSchema } from "@/routes/services/schema"

export const getService = new Elysia()
  .use(sessionMiddleware)
  .get(
    "/",
    async ({ query, status, session }) => {
      const result = await db.query.services.findMany({
        where: eq(services.userId, session.userId),
        orderBy: [desc(services.createdAt), desc(services.id)],
        limit: query.pageSize + 1,
        offset: (query.page - 1) * query.pageSize
      })

      const page = paginate(result, query.page, query.pageSize)
      return status(200, { services: page.items, pagination: page.pagination })
    },
    {
      auth: true,
      detail: apiDetail("services.list", "services", 200, true, [401, 422, 500]),
      query: paginationQuerySchema
    }
  )
  .get(
    "/:serviceId",
    async ({ params, status, session }) => {
      const result = await db.query.services.findFirst({
        where: and(eq(services.userId, session.userId), eq(services.id, params.serviceId))
      })

      if (!result) {
        throw new DomainError(404, "Serviço não encontrado")
      }

      return status(200, { service: result })
    },
    {
      auth: true,
      detail: apiDetail("services.get", "services", 200, false, [401, 404, 422, 500]),
      params: serviceParamsSchema
    }
  )
