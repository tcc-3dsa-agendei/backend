import { and, eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { appointments } from "@/db/schema/appointments"
import { services } from "@/db/schema/services"
import { bookingDetail } from "@/lib/api-documentation"
import { ensureAppointmentAvailability } from "@/lib/appointment-availability"
import { DomainError } from "@/lib/errors"
import { logOperation } from "@/lib/logger"
import { withSchedulingLock } from "@/lib/scheduling"
import { createAppointmentSchema } from "@/routes/appointments/schema"
import { companyParamsSchema } from "@/routes/public/schema"

export const createAppointment = new Elysia().post(
  "/:companyId/appointments",
  async ({ body, status, params }) => {
    const appointment = await withSchedulingLock(
      params.companyId,
      async (tx) => {
        const service = await tx.query.services.findFirst({
          where: and(eq(services.userId, params.companyId), eq(services.id, body.serviceId))
        })

        if (!service) {
          throw new DomainError(404, "Serviço não encontrado")
        }

        const endAt = new Date(body.startAt.getTime() + service.durationInMinutes * 60_000)

        await ensureAppointmentAvailability(
          tx,
          params.companyId,
          { startAt: body.startAt, endAt },
          { bookingGrid: true }
        )

        const [appointment] = await tx
          .insert(appointments)
          .values({
            userId: params.companyId,
            serviceId: body.serviceId,
            customerName: body.customerName,
            customerEmail: body.customerEmail,
            customerPhone: body.customerPhone,
            startAt: body.startAt,
            endAt,
            status: "scheduled",
            notes: body.notes
          })
          .returning()

        if (!appointment) throw new Error("Agendamento não retornado após criação")
        return appointment
      },
      404
    )
    logOperation("appointments.create", params.companyId, appointment.id)
    return status(201, {
      appointment: {
        id: appointment.id,
        serviceId: appointment.serviceId,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status
      }
    })
  },
  {
    detail: bookingDetail("public.appointments.create", "PublicAppointmentResponse", 201),
    params: companyParamsSchema,
    body: createAppointmentSchema
  }
)
