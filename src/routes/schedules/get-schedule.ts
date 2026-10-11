import { and, asc, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { schedules } from "@/db/schema/schedules"
import { apiDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { scheduleParamsSchema, serializeSchedule } from "@/routes/schedules/schema"

export const getSchedule = new Elysia()
  .use(sessionMiddleware)
  .get(
    "/",
    async ({ status, session }) => {
      const result = await db.query.schedules.findMany({
        where: eq(schedules.userId, session.userId),
        orderBy: asc(schedules.weekDay),
        limit: 7
      })

      return status(200, { schedules: result.map(serializeSchedule) })
    },
    { auth: true, detail: apiDetail("schedules.list", "schedules", 200, true, [401, 422, 500]) }
  )
  .get(
    "/:scheduleId",
    async ({ params, status, session }) => {
      const result = await db.query.schedules.findFirst({
        where: and(eq(schedules.userId, session.userId), eq(schedules.id, params.scheduleId))
      })

      if (!result) {
        throw new DomainError(404, "Agenda não encontrada")
      }

      return status(200, { schedule: serializeSchedule(result) })
    },
    {
      auth: true,
      detail: apiDetail("schedules.get", "schedules", 200, false, [401, 404, 422, 500]),
      params: scheduleParamsSchema
    }
  )
