import { describe, expect, spyOn, test } from "bun:test"
import { DomainError, getDatabaseError, resolveApiError } from "@/lib/errors"
import { logApiFailure, logOperation } from "@/lib/logger"

describe("error handling", () => {
  test("preserves expected business errors", () => {
    expect(resolveApiError(new DomainError(404, "Serviço não encontrado"))).toEqual({
      statusCode: 404,
      message: "Serviço não encontrado"
    })
  })

  test.each([
    ["23505", "schedule_user_week_day_unique", 409],
    ["23505", "users_cnpj_normalized_unique", 409],
    ["23503", "appointments_service_id_services_id_fk", 409],
    ["23P01", "appointment_user_time_exclusion", 409],
    ["23514", "schedule_time_order_check", 422],
    ["23514", "appointment_time_order_check", 422]
  ])("maps known database constraints: %s / %s", (code, constraint, statusCode) => {
    const error = new Error("SQL and private parameters", { cause: { code, constraint } })
    expect(getDatabaseError(error)).toEqual({ code, constraint })
    expect(resolveApiError(error).statusCode).toBe(statusCode)
    expect(resolveApiError(error).message).not.toContain("private")
  })

  test.each([new Error("password=secret"), { code: "23505", constraint: "unknown_unique" }])(
    "sanitizes unexpected failures",
    (error) => expect(resolveApiError(error)).toEqual({ statusCode: 500, message: "Erro interno do servidor" })
  )

  test.each([
    ["PARSE", 422],
    ["VALIDATION", 422],
    ["NOT_FOUND", 404],
    ["INVALID_COOKIE_SIGNATURE", 401]
  ])("maps framework errors: %s", (code, statusCode) =>
    expect(resolveApiError(undefined, code).statusCode).toBe(statusCode)
  )

  test("does not loop on cyclic error causes", () => {
    const error: { cause?: unknown } = {}
    error.cause = error
    expect(getDatabaseError(error)).toBeUndefined()
  })

  test("does not log raw private errors or customer data", () => {
    const errorLog = spyOn(console, "error").mockImplementation(() => {})
    const infoLog = spyOn(console, "info").mockImplementation(() => {})
    try {
      logApiFailure(500, new Error("password=secret; customerPhone=11987654321"), "appointments.create")
      expect(errorLog).toHaveBeenCalledWith({
        operation: "appointments.create",
        result: "failure",
        statusCode: 500,
        category: "request"
      })
      logOperation("appointments.status", "user-id", "appointment-id", { from: "scheduled", to: "confirmed" })
      expect(infoLog).toHaveBeenCalledWith({
        operation: "appointments.status",
        userId: "user-id",
        resourceId: "appointment-id",
        result: "success",
        from: "scheduled",
        to: "confirmed"
      })
    } finally {
      errorLog.mockRestore()
      infoLog.mockRestore()
    }
  })
})
