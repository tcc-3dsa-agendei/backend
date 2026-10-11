import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { schedules } from "@/db/schema/schedules"
import { apiDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { appointmentFitsSchedule } from "@/lib/schedule-time"
import { getFutureActiveAppointments, withSchedulingLock } from "@/lib/scheduling"
import { sessionMiddleware } from "@/middleware/session-middleware"
import {
  editScheduleSchema,
  hasValidScheduleHours,
  scheduleParamsSchema,
  serializeSchedule
} from "@/routes/schedules/schema"

export const editSchedule = new Elysia().use(sessionMiddleware).put(
  "/:scheduleId",
  async ({ params, body, status, session }) => {
    const schedule = await withSchedulingLock(session.userId, async (tx) => {
      const currentSchedule = await tx.query.schedules.findFirst({
        where: and(eq(schedules.userId, session.userId), eq(schedules.id, params.scheduleId))
      })

      if (!currentSchedule) {
        throw new DomainError(404, "Agenda não encontrada")
      }

      const updatedSchedule = {
        weekDay: body.weekDay ?? currentSchedule.weekDay,
        startTime: body.startTime ?? currentSchedule.startTime,
        endTime: body.endTime ?? currentSchedule.endTime
      }

      if (!hasValidScheduleHours(updatedSchedule)) {
        throw new DomainError(422, "O horário final deve ser posterior ao horário inicial")
      }

      const futureAppointments = await getFutureActiveAppointments(tx, session.userId, currentSchedule.weekDay)

      if (futureAppointments.some((appointment) => !appointmentFitsSchedule(appointment, updatedSchedule))) {
        throw new DomainError(409, "A alteração deixaria agendamentos futuros fora do horário de funcionamento")
      }

      const [editedSchedule] = await tx
        .update(schedules)
        .set({
          weekDay: body.weekDay,
          startTime: body.startTime,
          endTime: body.endTime
        })
        .where(and(eq(schedules.userId, session.userId), eq(schedules.id, params.scheduleId)))
        .returning()

      if (!editedSchedule) {
        throw new DomainError(404, "Agenda não encontrada")
      }

      return serializeSchedule(editedSchedule)
    })
    logOperation("schedules.edit", session.userId, schedule.id)
    return status(200, { schedule })
  },
  {
    auth: true,
    detail: apiDetail("schedules.edit", "schedules", 200),
    params: scheduleParamsSchema,
    body: editScheduleSchema
  }
)
