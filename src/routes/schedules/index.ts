import { Elysia } from "elysia"
import { errorMiddleware } from "@/middleware/error-middleware"
import { createSchedule } from "@/routes/schedules/create-schedule"
import { deleteSchedule } from "@/routes/schedules/delete-schedule"
import { editSchedule } from "@/routes/schedules/edit-schedule"
import { getSchedule } from "@/routes/schedules/get-schedule"

export const schedulesRoutes = new Elysia({ prefix: "/schedules" })
  .use(errorMiddleware)
  .use([createSchedule, getSchedule, editSchedule, deleteSchedule])
