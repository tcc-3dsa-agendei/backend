import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { services } from "@/db/schema/services"
import { apiDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { editServiceSchema, serviceParamsSchema } from "@/routes/services/schema"

export const editService = new Elysia().use(sessionMiddleware).put(
  "/:serviceId",
  async ({ params, body, status, session }) => {
    const [editedService] = await db
      .update(services)
      .set({
        name: body.name,
        description: body.description,
        durationInMinutes: body.durationInMinutes,
        price: body.price
      })
      .where(and(eq(services.userId, session.userId), eq(services.id, params.serviceId)))
      .returning()

    if (!editedService) {
      throw new DomainError(404, "Serviço não encontrado")
    }

    logOperation("services.edit", session.userId, editedService.id)

    return status(200, { service: editedService })
  },
  {
    auth: true,
    detail: apiDetail("services.edit", "services", 200),
    params: serviceParamsSchema,
    body: editServiceSchema
  }
)
