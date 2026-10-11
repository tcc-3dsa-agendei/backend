import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db } from "@/db"
import { schedules } from "@/db/schema/schedules"
import { services } from "@/db/schema/services"
import { env } from "@/env"
import { bookingDetail } from "@/lib/api-documentation"
import { DomainError } from "@/lib/errors"
import { sessionMiddleware } from "@/middleware/session-middleware"

export const bookingLink = new Elysia().use(sessionMiddleware).get(
  "/booking-link",
  async ({ session }) => {
    const [service, schedule] = await Promise.all([
      db.query.services.findFirst({ columns: { id: true }, where: eq(services.userId, session.userId) }),
      db.query.schedules.findFirst({ columns: { id: true }, where: eq(schedules.userId, session.userId) })
    ])
    if (!service || !schedule) throw new DomainError(422, "Cadastre ao menos um serviço e um dia de atendimento")

    return { url: `${env.FRONTEND_URL.replace(/\/+$/, "")}/agendar/${session.userId}` }
  },
  { auth: true, detail: bookingDetail("booking-link.get", "BookingLink", 200, true) }
)
