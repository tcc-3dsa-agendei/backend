import { Elysia } from "elysia"
import { errorMiddleware } from "@/middleware/error-middleware"
import { deleteAppointment } from "@/routes/appointments/delete-appointment"
import { editAppointment } from "@/routes/appointments/edit-appointment"
import { getAppointment } from "@/routes/appointments/get-appointment"
import { updateStatusAppointment } from "@/routes/appointments/update-status-appointment"

export const appointmentsRoutes = new Elysia({ prefix: "/appointments" })
  .use(errorMiddleware)
  .use([getAppointment, editAppointment, deleteAppointment, updateStatusAppointment])
