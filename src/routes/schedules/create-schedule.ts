import { Elysia } from "elysia"
import { schedules } from "@/db/schema/schedules"
import { apiDetail } from "@/lib/api-documentation"
import { logOperation } from "@/lib/logger"
import { withSchedulingLock } from "@/lib/scheduling"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { createScheduleSchema, serializeSchedule } from "@/routes/schedules/schema"

export const createSchedule = new Elysia().use(sessionMiddleware).post(
  "/",
  async ({ body, status, session }) => {
    const schedule = await withSchedulingLock(session.userId, async (tx) => {
      const [createdSchedule] = await tx
        .insert(schedules)
        .values({ ...body, userId: session.userId })
        .returning()

      if (!createdSchedule) {
        throw new Error("Agenda não retornada após criação")
      }

      return serializeSchedule(createdSchedule)
    })

    logOperation("schedules.create", session.userId, schedule.id)
    return status(201, {
      schedule
    })
  },
  {
    auth: true,
    detail: apiDetail("schedules.create", "schedules", 201),
    body: createScheduleSchema
  }
)
