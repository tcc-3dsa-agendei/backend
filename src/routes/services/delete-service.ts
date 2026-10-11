import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { services } from "@/db/schema/services"
import { apiDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { serviceParamsSchema } from "@/routes/services/schema"

export const deleteService = new Elysia().use(sessionMiddleware).delete(
  "/:serviceId",
  async ({ params, status, session }) => {
    const [deletedService] = await db
      .delete(services)
      .where(and(eq(services.userId, session.userId), eq(services.id, params.serviceId)))
      .returning()

    if (!deletedService) {
      throw new DomainError(404, "Serviço não encontrado")
    }

    logOperation("services.delete", session.userId, deletedService.id)
    return status(204)
  },
  {
    auth: true,
    detail: apiDetail("services.delete", "services", 204),
    params: serviceParamsSchema
  }
)
