import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { appointments } from "@/db/schema/appointments"
import { services } from "@/db/schema/services"
import { apiDetail } from "@/lib/api-documentation"
import { ensureAppointmentAvailability, lockAppointment } from "@/lib/appointment-availability"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { withSchedulingLock } from "@/lib/scheduling"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { appointmentParamsSchema, editAppointmentSchema } from "@/routes/appointments/schema"

export const editAppointment = new Elysia().use(sessionMiddleware).put(
  "/:appointmentId",
  async ({ params, body, status, session }) => {
    const appointment = await withSchedulingLock(session.userId, async (tx) => {
      const currentAppointment = await lockAppointment(tx, session.userId, params.appointmentId)
      const serviceId = body.serviceId ?? currentAppointment.serviceId
      const startAt = body.startAt ?? currentAppointment.startAt
      const serviceChanged = serviceId !== currentAppointment.serviceId
      const startChanged = startAt.getTime() !== currentAppointment.startAt.getTime()
      const rescheduling = serviceChanged || startChanged
      let endAt = currentAppointment.endAt

      if (rescheduling) {
        if (!["scheduled", "confirmed"].includes(currentAppointment.status)) {
          throw new DomainError(422, "Não é possível reagendar um agendamento em estado final")
        }

        let durationInMilliseconds = currentAppointment.endAt.getTime() - currentAppointment.startAt.getTime()
        if (serviceChanged) {
          const service = await tx.query.services.findFirst({
            where: and(eq(services.userId, session.userId), eq(services.id, serviceId))
          })
          if (!service) throw new DomainError(404, "Serviço não encontrado")
          durationInMilliseconds = service.durationInMinutes * 60_000
        }

        endAt = new Date(startAt.getTime() + durationInMilliseconds)
        await ensureAppointmentAvailability(
          tx,
          session.userId,
          { startAt, endAt },
          { excludeAppointmentId: params.appointmentId }
        )
      }

      const [editedAppointment] = await tx
        .update(appointments)
        .set({
          ...(rescheduling ? { serviceId, startAt, endAt } : {}),
          customerName: body.customerName,
          customerEmail: body.customerEmail,
          customerPhone: body.customerPhone,
          notes: body.notes
        })
        .where(and(eq(appointments.userId, session.userId), eq(appointments.id, params.appointmentId)))
        .returning()

      if (!editedAppointment) {
        throw new DomainError(404, "Agendamento não encontrado")
      }

      return editedAppointment
    })
    logOperation("appointments.edit", session.userId, appointment.id)
    return status(200, { appointment })
  },
  {
    auth: true,
    detail: apiDetail("appointments.edit", "appointments", 200),
    params: appointmentParamsSchema,
    body: editAppointmentSchema
  }
)
