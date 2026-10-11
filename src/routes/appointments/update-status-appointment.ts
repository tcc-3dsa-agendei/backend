import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { type AppointmentStatus, appointments } from "@/db/schema/appointments"
import { apiDetail } from "@/lib/api-documentation"
import { lockAppointment } from "@/lib/appointment-availability"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { appointmentParamsSchema, updateStatusAppointmentSchema } from "@/routes/appointments/schema"

const allowedStatusTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: []
}

export const updateStatusAppointment = new Elysia().use(sessionMiddleware).patch(
  "/:appointmentId/status",
  async ({ params, body, status, session }) => {
    const observedAppointment = await db.query.appointments.findFirst({
      where: and(eq(appointments.userId, session.userId), eq(appointments.id, params.appointmentId))
    })
    if (!observedAppointment) throw new DomainError(404, "Agendamento não encontrado")

    const result = await db.transaction(
      async (tx) => {
        const currentAppointment = await lockAppointment(tx, session.userId, params.appointmentId)
        if (
          currentAppointment.status !== observedAppointment.status ||
          currentAppointment.startAt.getTime() !== observedAppointment.startAt.getTime() ||
          currentAppointment.endAt.getTime() !== observedAppointment.endAt.getTime()
        ) {
          throw new DomainError(409, "O agendamento foi alterado por outra operação")
        }
        if (!allowedStatusTransitions[currentAppointment.status].includes(body.status)) {
          throw new DomainError(
            422,
            `Não é possível alterar o status de "${currentAppointment.status}" para "${body.status}"`
          )
        }

        const now = Date.now()
        if (body.status === "completed" && currentAppointment.endAt.getTime() > now) {
          throw new DomainError(422, "O agendamento ainda não terminou")
        }
        if (body.status === "no_show" && currentAppointment.startAt.getTime() > now) {
          throw new DomainError(422, "O agendamento ainda não começou")
        }

        const [updatedAppointment] = await tx
          .update(appointments)
          .set({ status: body.status })
          .where(
            and(
              eq(appointments.userId, session.userId),
              eq(appointments.id, params.appointmentId),
              eq(appointments.status, currentAppointment.status)
            )
          )
          .returning()
        if (!updatedAppointment) throw new DomainError(409, "O agendamento foi alterado por outra operação")

        return { appointment: updatedAppointment, from: currentAppointment.status }
      },
      { isolationLevel: "read committed" }
    )
    logOperation("appointments.status", session.userId, result.appointment.id, { from: result.from, to: body.status })
    return status(200, { appointment: result.appointment })
  },
  {
    auth: true,
    detail: apiDetail("appointments.update", "appointments", 200),
    params: appointmentParamsSchema,
    body: updateStatusAppointmentSchema
  }
)
