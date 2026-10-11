import { cors } from "@elysia/cors"
import { openapi } from "@elysia/openapi"
import { Elysia } from "elysia"
import { env } from "@/env"
import { apiSchemas } from "@/lib/api-documentation"
import { handleAuthRequest } from "@/lib/auth-handler"
import { errorMiddleware } from "@/middleware/error-middleware"
import { appointmentsRoutes } from "@/routes/appointments"
import { bookingLink } from "@/routes/booking-link"
import { publicRoutes } from "@/routes/public"
import { schedulesRoutes } from "@/routes/schedules"
import { servicesRoutes } from "@/routes/services"

export const app = new Elysia()

app.use(
  cors({
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 300,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    origin: env.FRONTEND_URL
  })
)

app.use(
  openapi({
    path: "/docs",
    openapiVersion: "3.0.3",
    documentation: {
      info: { title: "Agendei API", version: "1.0.0" },
      components: {
        schemas: apiSchemas,
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: env.BETTER_AUTH_URL.startsWith("https://")
              ? "__Secure-better-auth.session_token"
              : "better-auth.session_token"
          }
        }
      }
    }
  })
)

app.use(errorMiddleware)

app.all("/api/auth", ({ request }) => handleAuthRequest(request), { parse: "none", detail: { hide: true } })
app.all("/api/auth/*", ({ request }) => handleAuthRequest(request), { parse: "none", detail: { hide: true } })

app.use(schedulesRoutes)
app.use(servicesRoutes)
app.use(appointmentsRoutes)
app.use(bookingLink)
app.use(publicRoutes)
