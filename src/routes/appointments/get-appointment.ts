import { and, desc, eq, gte, lt } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { appointments } from "@/db/schema/appointments"
import { apiDetail } from "@/lib/api-documentation"
import { paginate } from "@/lib/pagination"
import { sessionMiddleware } from "@/middleware/session-middleware"
import { getAppointmentsQuerySchema } from "@/routes/appointments/schema"

export const getAppointment = new Elysia().use(sessionMiddleware).get(
  "/",
  async ({ query, status, session }) => {
    const { page: pageNumber, pageSize, from, to } = query
    const result = await db.query.appointments.findMany({
      columns: {
        id: true,
        userId: true,
        serviceId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        startAt: true,
        endAt: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true
      },
      where: and(
        eq(appointments.userId, session.userId),
        from ? gte(appointments.startAt, from) : undefined,
        to ? lt(appointments.startAt, to) : undefined
      ),
      orderBy: [desc(appointments.startAt), desc(appointments.id)],
      limit: pageSize + 1,
      offset: (pageNumber - 1) * pageSize,
      with: {
        service: {
          columns: { id: true, name: true, description: true, durationInMinutes: true, price: true }
        }
      }
    })

    const page = paginate(result, pageNumber, pageSize)
    return status(200, {
      appointments: page.items,
      pagination: page.pagination
    })
  },
  {
    auth: true,
    detail: apiDetail("appointments.list", "appointments", 200, true, [401, 422, 500]),
    query: getAppointmentsQuerySchema
  }
)
