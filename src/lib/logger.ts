import type { AppointmentStatus } from "@/db/schema/appointments"
import { getDatabaseError } from "@/lib/errors"

type Operation =
  | "schedules.create"
  | "schedules.edit"
  | "schedules.delete"
  | "services.create"
  | "services.edit"
  | "services.delete"
  | "appointments.create"
  | "appointments.edit"
  | "appointments.delete"
  | "appointments.status"

export const logOperation = (
  operation: Operation,
  userId: string,
  resourceId: string,
  transition?: { from: AppointmentStatus; to: AppointmentStatus }
) => {
  console.info({
    operation,
    userId,
    resourceId,
    result: "success",
    ...(transition ? { from: transition.from, to: transition.to } : {})
  })
}

export const logApiFailure = (statusCode: number, error: unknown, operation = "api") => {
  const databaseError = getDatabaseError(error)
  const entry = { operation, result: "failure", statusCode, category: databaseError ? "database" : "request" }
  if (statusCode >= 500) console.error(entry)
  else console.warn(entry)
}
