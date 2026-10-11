import { and, asc, eq, gt, lt, ne } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { appointments } from "@/db/schema/appointments"
import { schedules } from "@/db/schema/schedules"
import { services } from "@/db/schema/services"
import { users } from "@/db/schema/users"
import { env } from "@/env"
import { bookingDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { getBookingSlots } from "@/lib/schedule-time"
import { errorMiddleware } from "@/middleware/error-middleware"
import { createAppointment } from "@/routes/public/create-appointment"
import { availabilityQuerySchema, companyParamsSchema } from "@/routes/public/schema"
import { serializeSchedule } from "@/routes/schedules/schema"

const findCompany = async (companyId: string) => {
  const company = await db.query.users.findFirst({ columns: { name: true }, where: eq(users.id, companyId) })
  if (!company) throw new DomainError(404, "Empresa não encontrada")
  return company
}

export const publicRoutes = new Elysia({ prefix: "/public/companies" })
  .use(errorMiddleware)
  .get(
    "/:companyId",
    async ({ params }) => {
      const company = await findCompany(params.companyId)
      const [companySchedules, companyServices] = await Promise.all([
        db.query.schedules.findMany({
          columns: { weekDay: true, startTime: true, endTime: true },
          where: eq(schedules.userId, params.companyId),
          orderBy: [asc(schedules.weekDay)]
        }),
        db.query.services.findMany({
          columns: { id: true, name: true, description: true, durationInMinutes: true, price: true },
          where: eq(services.userId, params.companyId),
          orderBy: [asc(services.name), asc(services.id)]
        })
      ])
      return {
        company: {
          name: company.name,
          timeZone: env.SCHEDULING_TIME_ZONE,
          schedules: companySchedules.map(serializeSchedule),
          services: companyServices
        }
      }
    },
    { params: companyParamsSchema, detail: bookingDetail("public.companies.get", "PublicCompanyResponse", 200) }
  )
  .get(
    "/:companyId/availability",
    async ({ params, query }) => {
      await findCompany(params.companyId)
      const service = await db.query.services.findFirst({
        columns: { durationInMinutes: true },
        where: and(eq(services.userId, params.companyId), eq(services.id, query.serviceId))
      })
      if (!service) throw new DomainError(404, "Serviço não encontrado")

      const windows = await db.query.schedules.findMany({
        columns: { weekDay: true, startTime: true, endTime: true },
        where: and(
          eq(schedules.userId, params.companyId),
          eq(schedules.weekDay, new Date(`${query.date}T00:00:00Z`).getUTCDay())
        )
      })
      const slots = windows
        .flatMap((window) => getBookingSlots(query.date, service.durationInMinutes, window))
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      const first = slots[0]
      const last = slots.at(-1)
      if (!first || !last) return { slots: [] }

      const occupied = await db.query.appointments.findMany({
        columns: { startAt: true, endAt: true },
        where: and(
          eq(appointments.userId, params.companyId),
          ne(appointments.status, "cancelled"),
          lt(appointments.startAt, last.endAt),
          gt(appointments.endAt, first.startAt)
        )
      })
      return {
        slots: slots.filter((slot) => !occupied.some((busy) => busy.startAt < slot.endAt && busy.endAt > slot.startAt))
      }
    },
    {
      params: companyParamsSchema,
      query: availabilityQuerySchema,
      detail: bookingDetail("public.availability.list", "Availability", 200)
    }
  )
  .use(createAppointment)
