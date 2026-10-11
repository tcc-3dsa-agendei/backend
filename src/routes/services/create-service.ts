import { Elysia } from "elysia"
import { db } from "@/db"
import { services } from "@/db/schema/services"
import { apiDetail } from "@/lib/api-documentation"
import { logOperation } from "@/lib/logger"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { createServiceSchema } from "@/routes/services/schema"

export const createService = new Elysia().use(sessionMiddleware).post(
  "/",
  async ({ body, status, session }) => {
    const [service] = await db
      .insert(services)
      .values({
        name: body.name,
        description: body.description,
        durationInMinutes: body.durationInMinutes,
        price: body.price,
        userId: session.userId
      })
      .returning()

    if (!service) throw new Error("Serviço não retornado após criação")

    logOperation("services.create", session.userId, service.id)

    return status(201, {
      service
    })
  },
  {
    auth: true,
    detail: apiDetail("services.create", "services", 201),
    body: createServiceSchema
  }
)
