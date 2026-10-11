import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { appointments } from "@/db/schema/appointments"
import { apiDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { appointmentParamsSchema } from "@/routes/appointments/schema"

export const deleteAppointment = new Elysia().use(sessionMiddleware).delete(
  "/:appointmentId",
  async ({ params, status, session }) => {
    const [deletedAppointment] = await db
      .delete(appointments)
      .where(and(eq(appointments.userId, session.userId), eq(appointments.id, params.appointmentId)))
      .returning()

    if (!deletedAppointment) {
      throw new DomainError(404, "Agendamento não encontrado")
    }

    logOperation("appointments.delete", session.userId, deletedAppointment.id)
    return status(204)
  },
  {
    auth: true,
    detail: apiDetail("appointments.delete", "appointments", 204),
    params: appointmentParamsSchema
  }
)
