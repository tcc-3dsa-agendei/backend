import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { schedules } from "@/db/schema/schedules"
import { apiDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { getFutureActiveAppointments, withSchedulingLock } from "@/lib/scheduling"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { scheduleParamsSchema } from "@/routes/schedules/schema"

export const deleteSchedule = new Elysia().use(sessionMiddleware).delete(
  "/:scheduleId",
  async ({ params, status, session }) => {
    const schedule = await withSchedulingLock(session.userId, async (tx) => {
      const currentSchedule = await tx.query.schedules.findFirst({
        where: and(eq(schedules.userId, session.userId), eq(schedules.id, params.scheduleId))
      })

      if (!currentSchedule) {
        throw new DomainError(404, "Agenda não encontrada")
      }

      const futureAppointments = await getFutureActiveAppointments(tx, session.userId, currentSchedule.weekDay)

      if (futureAppointments.length > 0) {
        throw new DomainError(409, "Há agendamentos futuros vinculados a este dia da semana")
      }

      const [deletedSchedule] = await tx
        .delete(schedules)
        .where(and(eq(schedules.userId, session.userId), eq(schedules.id, params.scheduleId)))
        .returning()

      if (!deletedSchedule) {
        throw new DomainError(404, "Agenda não encontrada")
      }

      return deletedSchedule
    })
    logOperation("schedules.delete", session.userId, schedule.id)
    return status(204)
  },
  {
    auth: true,
    detail: apiDetail("schedules.delete", "schedules", 204),
    params: scheduleParamsSchema
  }
)
