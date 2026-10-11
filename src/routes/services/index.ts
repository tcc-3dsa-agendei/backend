import { Elysia } from "elysia"
import { errorMiddleware } from "@/middleware/error-middleware"
import { createService } from "@/routes/services/create-service"
import { deleteService } from "@/routes/services/delete-service"
import { editService } from "@/routes/services/edit-service"
import { getService } from "@/routes/services/get-service"

export const servicesRoutes = new Elysia({ prefix: "/services" })
  .use(errorMiddleware)
  .use([createService, getService, editService, deleteService])
