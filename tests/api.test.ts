import { afterAll, afterEach, beforeEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { app } from "@/app"
import { db } from "@/db"
import { appointments } from "@/db/schema/appointments"
import { users } from "@/db/schema/users"
import { auth } from "@/lib/auth"
import type { SchedulingTransaction } from "@/lib/scheduling"

const userId = "019c0000-0000-7000-8000-000000000001"
const appointmentId = "019c0000-0000-7000-8000-000000000002"
const serviceId = "019c0000-0000-7000-8000-000000000003"
const now = new Date("2030-01-01T12:00:00Z")
const currentAppointment: typeof appointments.$inferSelect = {
  id: appointmentId,
  userId,
  serviceId,
  customerName: "Maria",
  customerEmail: null,
  customerPhone: "11987654321",
  startAt: new Date("2030-01-07T12:00:00Z"),
  endAt: new Date("2030-01-07T12:30:00Z"),
  status: "scheduled",
  notes: null,
  createdAt: now,
  updatedAt: now
}
const session = {
  user: {
    id: userId,
    name: "Empresa",
    email: "test@example.com",
    emailVerified: false,
    image: null,
    cnpj: "04252011000110",
    createdAt: now,
    updatedAt: now
  },
  session: {
    id: "session-id",
    userId,
    token: "test-token",
    expiresAt: new Date("2031-01-01"),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null
  }
}
const dialect = new PgDialect()
const realUpdate = db.update.bind(db)

const request = (path: string, method = "GET", body?: unknown) =>
  app.handle(
    new Request(`http://localhost:3333${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  )

const sessionSpy = spyOn(auth.api, "getSession")
const transactionSpy = spyOn(db, "transaction")
const insertSpy = spyOn(db, "insert")
const updateSpy = spyOn(db, "update")
const deleteSpy = spyOn(db, "delete")
const authHandlerSpy = spyOn(auth, "handler")
const serviceList = spyOn(db.query.services, "findMany")
const serviceGet = spyOn(db.query.services, "findFirst")
const appointmentList = spyOn(db.query.appointments, "findMany")
const appointmentGet = spyOn(db.query.appointments, "findFirst")
const scheduleList = spyOn(db.query.schedules, "findMany")
const scheduleGet = spyOn(db.query.schedules, "findFirst")
const companyGet = spyOn(db.query.users, "findFirst")
const infoLog = spyOn(console, "info")
const warnLog = spyOn(console, "warn")
const errorLog = spyOn(console, "error")
const spies = [
  sessionSpy,
  transactionSpy,
  insertSpy,
  updateSpy,
  deleteSpy,
  authHandlerSpy,
  serviceList,
  serviceGet,
  appointmentList,
  appointmentGet,
  scheduleList,
  scheduleGet,
  companyGet,
  infoLog,
  warnLog,
  errorLog
]

beforeEach(() => {
  setSystemTime(now)
  for (const spy of spies) spy.mockReset()
  sessionSpy.mockResolvedValue(session)
  serviceList.mockResolvedValue([])
  serviceGet.mockResolvedValue(undefined)
  appointmentList.mockResolvedValue([])
  appointmentGet.mockResolvedValue(undefined)
  scheduleList.mockResolvedValue([])
  scheduleGet.mockResolvedValue(undefined)
  companyGet.mockResolvedValue(session.user)
  transactionSpy.mockRejectedValue(new Error("Unexpected transaction"))
  for (const write of [insertSpy, updateSpy, deleteSpy])
    write.mockImplementation(() => {
      throw new Error("Unexpected database write")
    })
  authHandlerSpy.mockResolvedValue(new Response(null, { status: 404 }))
  for (const log of [infoLog, warnLog, errorLog]) log.mockImplementation(() => {})
})
afterEach(() => setSystemTime())
afterAll(() => {
  for (const spy of spies) spy.mockRestore()
})

// Use the real Drizzle update validator so mocks cannot hide an empty SET.
const transaction = (locked = currentAppointment) => {
  const ownerLock = mock(async (_mode: string): Promise<{ id: string }[]> => [{ id: userId }])
  const lockWhere = mock((_condition: SQL) => ({ for: ownerLock }))
  const returning = mock(async () => [locked])
  const set = mock((values: Parameters<ReturnType<typeof db.update<typeof appointments>>["set"]>[0]) => {
    realUpdate(appointments).set(values)
    return { where: () => ({ returning }) }
  })
  const values = mock((input: typeof appointments.$inferInsert) => ({
    returning: async () => [{ ...currentAppointment, ...input }]
  }))
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where:
          table === users
            ? lockWhere
            : () => ({
                for: async () => [table === users ? { id: userId } : locked]
              })
      })
    }),
    update: () => ({ set }),
    insert: () => ({ values }),
    query: {
      services: {
        findFirst: mock(
          async (_options: {
            where: SQL
          }): Promise<{ id: string; userId: string; durationInMinutes: number } | undefined> => ({
            id: serviceId,
            userId,
            durationInMinutes: 60
          })
        )
      },
      schedules: {
        findMany: mock(async () => [{ weekDay: 1, startTime: "09:00", endTime: "18:00" }]),
        findFirst: mock(async () => ({ id: serviceId, userId, weekDay: 1, startTime: "09:00", endTime: "18:00" }))
      },
      appointments: {
        findFirst: mock(async (): Promise<{ id: string } | undefined> => undefined),
        findMany: mock(async () => [{ startAt: locked.startAt, endAt: locked.endAt }])
      }
    }
  }
  transactionSpy.mockImplementation(async (operation) => operation(tx as unknown as SchedulingTransaction))
  return { tx, set, values, returning, ownerLock, lockWhere }
}

describe("HTTP contracts and account isolation", () => {
  test.each(["/schedules", "/services", "/appointments", "/booking-link"])(
    "requires a session for %s",
    async (path) => {
      sessionSpy.mockResolvedValue(null)
      const response = await request(path)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ message: "Acesso negado" })
      expect(serviceList).not.toHaveBeenCalled()
      expect(scheduleList).not.toHaveBeenCalled()
      expect(appointmentList).not.toHaveBeenCalled()
    }
  )

  test.each(["/schedules", "/services", "/appointments"])("lists only the account's resources: %s", async (path) => {
    const response = await request(path)
    expect(response.status).toBe(200)
    const result = (await response.json()) as Record<string, unknown>
    expect(result[path.slice(1)]).toEqual([])
    const spy = path === "/services" ? serviceList : path === "/schedules" ? scheduleList : appointmentList
    const options = spy.mock.calls[0]?.[0]
    expect(options?.where).toBeDefined()
    expect(dialect.sqlToQuery(options?.where as import("drizzle-orm").SQL).params).toEqual([userId])
    if (path !== "/schedules") expect(result.pagination).toEqual({ page: 1, pageSize: 20, hasNext: false })
  })

  test.each(["/services", "/schedules"])("returns 404 for inaccessible IDs: %s", async (path) => {
    const response = await request(`${path}/${serviceId}`)
    expect(response.status).toBe(404)
    const spy = path === "/services" ? serviceGet : scheduleGet
    const where = spy.mock.calls[0]?.[0]?.where as import("drizzle-orm").SQL
    expect(dialect.sqlToQuery(where).params).toEqual([userId, serviceId])
  })

  test("passes pagination and date boundaries to the appointment query", async () => {
    const response = await request("/appointments?page=2&pageSize=5&from=2030-01-07T12:00:00Z&to=2030-01-08T12:00:00Z")
    expect(response.status).toBe(200)
    const options = appointmentList.mock.calls[0]?.[0]
    expect(options).toMatchObject({ limit: 6, offset: 5 })
    const where = dialect.sqlToQuery(options?.where as import("drizzle-orm").SQL)
    expect(where.params).toEqual([userId, "2030-01-07T12:00:00.000Z", "2030-01-08T12:00:00.000Z"])
    expect(where.sql).toContain('"start_at" >=')
    expect(where.sql).toContain('"start_at" <')
  })

  test("returns validation errors before accessing storage", async () => {
    expect((await request("/services?pageSize=101")).status).toBe(422)
    expect((await request("/services/not-a-uuid")).status).toBe(422)
    expect((await request(`/public/companies/${userId}/appointments`, "POST", {})).status).toBe(422)
    expect(serviceList).not.toHaveBeenCalled()
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  test("sanitizes unexpected storage errors", async () => {
    serviceList.mockRejectedValue(new Error("secret password and SQL"))
    const response = await request("/services")
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ message: "Erro interno do servidor" })
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret")
  })

  test("handles malformed JSON and missing routes", async () => {
    const malformed = await app.handle(
      new Request("http://localhost:3333/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      })
    )
    expect(malformed.status).toBe(422)
    expect((await request("/missing")).status).toBe(404)
    expect((await request("/api/auth/missing")).status).toBe(404)
  })

  test("publishes input schemas and cookie authentication in OpenAPI", async () => {
    const response = await request("/docs/json")
    expect(response.status).toBe(200)
    const document = (await response.json()) as {
      paths: Record<string, { post: { requestBody: { content: Record<string, { schema: { required: string[] } }> } } }>
    }
    expect(document).toMatchObject({
      openapi: "3.0.3",
      components: { securitySchemes: { sessionCookie: { in: "cookie" } } }
    })
    const creation = document.paths["/public/companies/{companyId}/appointments"]?.post
    expect(creation?.requestBody.content["application/json"]?.schema.required).toEqual(
      expect.arrayContaining(["serviceId", "startAt", "customerName", "customerEmail", "customerPhone"])
    )
    expect(creation).toMatchObject({
      security: [],
      responses: {
        "201": {
          content: { "application/json": { schema: { $ref: "#/components/schemas/PublicAppointmentResponse" } } }
        }
      }
    })
    expect(document.paths["/appointments/"]?.post).toBeUndefined()
    for (const path of ["/public/companies/{companyId}", "/public/companies/{companyId}/availability"])
      expect(document.paths[path]).toHaveProperty("get.security", [])
    expect(document.paths["/booking-link"]).toHaveProperty("get.security", [{ sessionCookie: [] }])
    expect(document).toHaveProperty("components.schemas.Appointment.properties.customerEmail", {
      type: "string",
      format: "email",
      nullable: true
    })
  })
})

describe("service writes and appointment deletion", () => {
  const service = {
    id: serviceId,
    userId,
    name: "Corte",
    description: null,
    durationInMinutes: 30,
    price: 25,
    createdAt: now,
    updatedAt: now
  }

  test("creates a service with the authenticated owner", async () => {
    const values = mock(() => ({ returning: async () => [service] }))
    insertSpy.mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>)
    const response = await request("/services", "POST", { name: "Corte", durationInMinutes: 30, price: 25 })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      service: { ...service, createdAt: now.toISOString(), updatedAt: now.toISOString() }
    })
    expect(values).toHaveBeenCalledWith({
      userId,
      name: "Corte",
      description: undefined,
      durationInMinutes: 30,
      price: 25
    })
  })

  test("partial service edits clear nullable fields and keep the owner filter", async () => {
    const where = mock((_condition: import("drizzle-orm").SQL) => ({
      returning: async () => [{ ...service, price: null }]
    }))
    const set = mock(() => ({ where }))
    updateSpy.mockReturnValue({ set } as unknown as ReturnType<typeof db.update>)
    const response = await request(`/services/${serviceId}`, "PUT", { price: null })
    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith({
      name: undefined,
      description: undefined,
      durationInMinutes: undefined,
      price: null
    })
    expect(dialect.sqlToQuery(where.mock.calls[0]?.[0] as import("drizzle-orm").SQL).params).toEqual([
      userId,
      serviceId
    ])
  })

  test.each(["services", "appointments"])("deletes owned %s without a response body", async (resource) => {
    const where = mock((_condition: import("drizzle-orm").SQL) => ({ returning: async () => [{ id: serviceId }] }))
    deleteSpy.mockReturnValue({ where } as unknown as ReturnType<typeof db.delete>)
    const response = await request(`/${resource}/${serviceId}`, "DELETE")
    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(dialect.sqlToQuery(where.mock.calls[0]?.[0] as import("drizzle-orm").SQL).params).toEqual([
      userId,
      serviceId
    ])
  })

  test.each(["services", "appointments"])("does not delete missing or inaccessible %s", async (resource) => {
    deleteSpy.mockReturnValue({ where: () => ({ returning: async () => [] }) } as unknown as ReturnType<
      typeof db.delete
    >)
    expect((await request(`/${resource}/${serviceId}`, "DELETE")).status).toBe(404)
    expect(infoLog).not.toHaveBeenCalled()
  })

  test("returns a conflict when a referenced service cannot be deleted", async () => {
    const returning = mock(async () => {
      throw { code: "23503", constraint: "appointments_service_id_services_id_fk" }
    })
    deleteSpy.mockReturnValue({ where: () => ({ returning }) } as unknown as ReturnType<typeof db.delete>)
    expect((await request(`/services/${serviceId}`, "DELETE")).status).toBe(409)
    expect(infoLog).not.toHaveBeenCalled()
  })

  test("sanitizes auth failures while preserving response cookies", async () => {
    authHandlerSpy.mockResolvedValue(
      new Response("private error", {
        status: 500,
        headers: { "Set-Cookie": "test-cookie=cleared; Max-Age=0" }
      })
    )
    const response = await request("/api/auth/sign-in/email", "POST", {})
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ message: "Erro interno do servidor" })
    expect(response.headers.get("Set-Cookie")).toContain("test-cookie=cleared")
  })
})

describe("appointment creation and opening-hour protection", () => {
  const path = `/public/companies/${userId}/appointments`
  const body = {
    serviceId,
    customerName: "Maria",
    customerEmail: "maria@example.com",
    customerPhone: "11987654321",
    startAt: "2030-01-07T09:00:00-03:00"
  }

  test("creates a reservation without a session using the URL owner and current duration", async () => {
    sessionSpy.mockResolvedValue(null)
    const fixture = transaction()
    const response = await request(path, "POST", body)
    expect(response.status).toBe(201)
    expect(fixture.values.mock.calls[0]?.[0]).toMatchObject({
      userId,
      serviceId,
      customerEmail: body.customerEmail,
      status: "scheduled",
      startAt: currentAppointment.startAt,
      endAt: new Date("2030-01-07T13:00:00Z")
    })
    expect(await response.json()).toEqual({
      appointment: {
        id: appointmentId,
        serviceId,
        startAt: "2030-01-07T12:00:00.000Z",
        endAt: "2030-01-07T13:00:00.000Z",
        status: "scheduled"
      }
    })
    expect(sessionSpy).not.toHaveBeenCalled()
    expect(dialect.sqlToQuery(fixture.lockWhere.mock.calls[0]?.[0] as SQL).params).toEqual([userId])
    expect(infoLog).toHaveBeenCalledTimes(1)
  })

  test("does not create appointments for missing or inaccessible services", async () => {
    const fixture = transaction()
    fixture.tx.query.services.findFirst.mockResolvedValue(undefined)
    expect((await request(path, "POST", body)).status).toBe(404)
    expect(dialect.sqlToQuery(fixture.tx.query.services.findFirst.mock.calls[0]?.[0].where as SQL).params).toEqual([
      userId,
      serviceId
    ])
    expect(fixture.values).not.toHaveBeenCalled()
    expect(infoLog).not.toHaveBeenCalled()
  })

  test("does not insert an overlapping reservation", async () => {
    const fixture = transaction()
    fixture.tx.query.appointments.findFirst.mockResolvedValue({ id: "occupied" })
    expect((await request(path, "POST", body)).status).toBe(409)
    expect(fixture.values).not.toHaveBeenCalled()
  })

  test("does not shorten opening hours past a future appointment", async () => {
    const fixture = transaction()
    expect((await request(`/schedules/${serviceId}`, "PUT", { endTime: "09:15" })).status).toBe(409)
    expect(fixture.set).not.toHaveBeenCalled()
  })

  test("does not delete opening hours containing a future appointment", async () => {
    transaction()
    expect((await request(`/schedules/${serviceId}`, "DELETE")).status).toBe(409)
  })

  test("validates the final opening interval during a partial edit", async () => {
    const fixture = transaction()
    expect((await request(`/schedules/${serviceId}`, "PUT", { startTime: "19:00" })).status).toBe(422)
    expect(fixture.set).not.toHaveBeenCalled()
  })

  test.each([null, session])("removes the old creation route regardless of session: %j", async (authentication) => {
    sessionSpy.mockResolvedValue(authentication)
    expect((await request("/appointments", "POST", body)).status).toBe(404)
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  test.each(["serviceId", "startAt", "customerName", "customerEmail", "customerPhone"])(
    "requires %s on public bookings",
    async (field) => {
      expect((await request(path, "POST", { ...body, [field]: undefined })).status).toBe(422)
      expect(transactionSpy).not.toHaveBeenCalled()
    }
  )

  test.each([
    { customerEmail: "invalid" },
    { customerEmail: null },
    { customerPhone: "123" },
    { userId: appointmentId },
    { status: "confirmed" }
  ])("rejects invalid or untrusted booking fields: %j", async (fields) => {
    expect((await request(path, "POST", { ...body, ...fields })).status).toBe(422)
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  test("returns 404 when the company is missing at lock acquisition", async () => {
    const fixture = transaction()
    fixture.ownerLock.mockResolvedValue([])
    expect((await request(path, "POST", body)).status).toBe(404)
    expect(fixture.tx.query.services.findFirst).not.toHaveBeenCalled()
    expect(fixture.values).not.toHaveBeenCalled()
  })

  test("ignores a different logged-in company when booking publicly", async () => {
    sessionSpy.mockResolvedValue({ ...session, session: { ...session.session, userId: appointmentId } })
    const fixture = transaction()
    expect((await request(path, "POST", body)).status).toBe(201)
    expect(fixture.values.mock.calls[0]?.[0].userId).toBe(userId)
    expect(sessionSpy).not.toHaveBeenCalled()
  })

  test.each([
    "2030-01-07T09:07:00-03:00",
    "2030-01-07T08:45:00-03:00",
    "2030-01-07T17:15:00-03:00",
    "2029-12-31T09:00:00-03:00"
  ])("rejects an invalid start or interval: %s", async (startAt) => {
    const fixture = transaction()
    expect((await request(path, "POST", { ...body, startAt })).status).toBe(422)
    expect(fixture.values).not.toHaveBeenCalled()
  })

  test("revalidates the current opening hours in the transaction", async () => {
    const fixture = transaction()
    fixture.tx.query.schedules.findMany.mockResolvedValue([])
    expect((await request(path, "POST", body)).status).toBe(422)
    expect(fixture.values).not.toHaveBeenCalled()
  })

  test("aligns the public grid to the opening minute", async () => {
    const fixture = transaction()
    fixture.tx.query.schedules.findMany.mockResolvedValue([{ weekDay: 1, startTime: "09:07", endTime: "18:00" }])
    expect((await request(path, "POST", { ...body, startAt: "2030-01-07T09:22:00-03:00" })).status).toBe(201)
    expect((await request(path, "POST", { ...body, startAt: "2030-01-07T09:15:00-03:00" })).status).toBe(422)
    expect(fixture.values).toHaveBeenCalledTimes(1)
  })
})

describe("appointment edits and status", () => {
  test("lists historical appointments with a nullable customer email", async () => {
    appointmentList.mockResolvedValue([currentAppointment])
    const response = await request("/appointments")
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty("appointments.0.customerEmail", null)
    expect(appointmentList.mock.calls[0]?.[0]?.columns).toHaveProperty("customerEmail", true)
  })

  test("adds a valid email to a legacy appointment without changing its phone or interval", async () => {
    const fixture = transaction({ ...currentAppointment, customerPhone: "(11) 98765-4321" })
    expect((await request(`/appointments/${appointmentId}`, "PUT", { customerEmail: "ana@example.com" })).status).toBe(
      200
    )
    expect(fixture.set).toHaveBeenCalledWith({
      customerName: undefined,
      customerEmail: "ana@example.com",
      customerPhone: undefined,
      notes: undefined
    })
    expect(fixture.tx.query.schedules.findMany).not.toHaveBeenCalled()
  })

  test("keeps minute precision for administrative rescheduling", async () => {
    const fixture = transaction()
    expect(
      (await request(`/appointments/${appointmentId}`, "PUT", { startAt: "2030-01-07T10:07:00-03:00" })).status
    ).toBe(200)
    expect(fixture.set.mock.calls[0]?.[0]).toMatchObject({ startAt: new Date("2030-01-07T13:07:00Z") })
  })
  test("customer corrections preserve historical intervals without querying availability", async () => {
    const fixture = transaction({ ...currentAppointment, status: "completed" })
    const response = await request(`/appointments/${appointmentId}`, "PUT", { notes: null, customerName: "Ana" })
    expect(response.status).toBe(200)
    expect(fixture.set).toHaveBeenCalledWith({
      customerName: "Ana",
      customerEmail: undefined,
      customerPhone: undefined,
      notes: null
    })
    expect(fixture.tx.query.schedules.findMany).not.toHaveBeenCalled()
    expect(fixture.tx.query.services.findFirst).not.toHaveBeenCalled()
  })

  test("moving the start preserves the booked duration even if the service changed", async () => {
    const fixture = transaction()
    const response = await request(`/appointments/${appointmentId}`, "PUT", { startAt: "2030-01-07T10:00:00-03:00" })
    expect(response.status).toBe(200)
    expect(fixture.set.mock.calls[0]?.[0]).toMatchObject({
      startAt: new Date("2030-01-07T13:00:00Z"),
      endAt: new Date("2030-01-07T13:30:00Z")
    })
    expect(fixture.tx.query.services.findFirst).not.toHaveBeenCalled()
  })

  test.each(["completed", "cancelled", "no_show"] as const)("does not reschedule final status %s", async (status) => {
    const fixture = transaction({ ...currentAppointment, status })
    const response = await request(`/appointments/${appointmentId}`, "PUT", { startAt: "2030-01-07T10:00:00-03:00" })
    expect(response.status).toBe(422)
    expect(fixture.set).not.toHaveBeenCalled()
  })

  test
    .each([{ serviceId }, { startAt: currentAppointment.startAt.toISOString() }])
    .failing("resending unchanged booking fields succeeds (known audit defect): %j", async (body) => {
      transaction()
      expect((await request(`/appointments/${appointmentId}`, "PUT", body)).status).toBe(200)
    })

  test("confirms a scheduled appointment", async () => {
    appointmentGet.mockResolvedValue(currentAppointment)
    const fixture = transaction()
    expect((await request(`/appointments/${appointmentId}/status`, "PATCH", { status: "confirmed" })).status).toBe(200)
    expect(fixture.set).toHaveBeenCalledWith({ status: "confirmed" })
  })

  test.each([
    ["confirmed", "completed"],
    ["scheduled", "no_show"],
    ["cancelled", "confirmed"]
  ] as const)("rejects invalid or premature status changes: %s to %s", async (from, to) => {
    const current = { ...currentAppointment, status: from }
    appointmentGet.mockResolvedValue(current)
    const fixture = transaction(current)
    expect((await request(`/appointments/${appointmentId}/status`, "PATCH", { status: to })).status).toBe(422)
    expect(fixture.set).not.toHaveBeenCalled()
  })

  test("detects an interval changed between observation and lock", async () => {
    appointmentGet.mockResolvedValue(currentAppointment)
    const fixture = transaction({ ...currentAppointment, startAt: new Date("2030-01-07T13:00:00Z") })
    expect((await request(`/appointments/${appointmentId}/status`, "PATCH", { status: "confirmed" })).status).toBe(409)
    expect(fixture.set).not.toHaveBeenCalled()
  })

  test("does not log success when commit fails", async () => {
    const fixture = transaction()
    transactionSpy.mockImplementation(async (operation) => {
      await operation(fixture.tx as unknown as SchedulingTransaction)
      throw new Error("Commit failed")
    })
    expect((await request(`/appointments/${appointmentId}`, "PUT", { notes: "test" })).status).toBe(500)
    expect(fixture.set).toHaveBeenCalled()
    expect(infoLog).not.toHaveBeenCalled()
  })
})

describe("public company, availability, and booking link", () => {
  const path = `/public/companies/${userId}`
  const availabilityPath = `${path}/availability?serviceId=${serviceId}&date=2030-01-07`
  const service = {
    id: serviceId,
    userId,
    name: "Corte",
    description: null,
    durationInMinutes: 30,
    price: 25,
    createdAt: now,
    updatedAt: now
  }
  const schedule = {
    id: appointmentId,
    userId,
    weekDay: 1,
    startTime: "09:00:00",
    endTime: "10:00:00",
    createdAt: now,
    updatedAt: now
  }
  const publicService = { id: serviceId, name: "Corte", description: null, durationInMinutes: 30, price: 25 }
  const publicSchedule = { weekDay: 1, startTime: "09:00:00", endTime: "10:00:00" }

  beforeEach(() => {
    serviceGet.mockResolvedValue(service)
    scheduleGet.mockResolvedValue(schedule)
    // Model the selected columns; assertions below verify these projections at the database boundary.
    serviceList.mockResolvedValue([publicService as typeof service])
    scheduleList.mockResolvedValue([publicSchedule as typeof schedule])
  })

  test("publishes only the company name, time zone, weekly hours, and service summaries without a session", async () => {
    sessionSpy.mockResolvedValue(null)
    const response = await request(path)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      company: {
        name: "Empresa",
        timeZone: "America/Sao_Paulo",
        schedules: [{ weekDay: 1, startTime: "09:00", endTime: "10:00" }],
        services: [publicService]
      }
    })
    expect(companyGet.mock.calls[0]?.[0]?.columns).toEqual({ name: true })
    expect(scheduleList.mock.calls[0]?.[0]?.columns).toEqual({ weekDay: true, startTime: true, endTime: true })
    expect(serviceList.mock.calls[0]?.[0]?.columns).toEqual({
      id: true,
      name: true,
      description: true,
      durationInMinutes: true,
      price: true
    })
    for (const query of [companyGet, serviceList, scheduleList]) {
      expect(dialect.sqlToQuery(query.mock.calls[0]?.[0]?.where as SQL).params).toEqual([userId])
    }
    expect(sessionSpy).not.toHaveBeenCalled()
    expect(appointmentList).not.toHaveBeenCalled()
  })

  test.each(["", `/availability?serviceId=${serviceId}&date=2030-01-07`])(
    "returns 404 for a missing company: %s",
    async (suffix) => {
      companyGet.mockResolvedValue(undefined)
      expect((await request(`${path}${suffix}`)).status).toBe(404)
      expect(scheduleList).not.toHaveBeenCalled()
      expect(serviceGet).not.toHaveBeenCalled()
    }
  )

  test("requires a service belonging to the URL company for availability", async () => {
    serviceGet.mockResolvedValue(undefined)
    expect((await request(availabilityPath)).status).toBe(404)
    expect(dialect.sqlToQuery(serviceGet.mock.calls[0]?.[0]?.where as SQL).params).toEqual([userId, serviceId])
    expect(appointmentList).not.toHaveBeenCalled()
  })

  test.each([
    `/public/companies/invalid`,
    `${path}/availability`,
    `${path}/availability?serviceId=${serviceId}&date=2030-02-30`,
    `${path}/availability?serviceId=invalid&date=2030-01-07`
  ])("validates public parameters before storage: %s", async (url) => {
    expect((await request(url)).status).toBe(422)
    expect(companyGet).not.toHaveBeenCalled()
    expect(appointmentList).not.toHaveBeenCalled()
  })

  test("returns future slots without a session and scopes busy intervals to the company, excluding cancelled reservations", async () => {
    sessionSpy.mockResolvedValue(null)
    const response = await request(availabilityPath)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      slots: [
        { startAt: "2030-01-07T12:00:00.000Z", endAt: "2030-01-07T12:30:00.000Z" },
        { startAt: "2030-01-07T12:15:00.000Z", endAt: "2030-01-07T12:45:00.000Z" },
        { startAt: "2030-01-07T12:30:00.000Z", endAt: "2030-01-07T13:00:00.000Z" }
      ]
    })
    expect(sessionSpy).not.toHaveBeenCalled()
    const query = appointmentList.mock.calls[0]?.[0]
    expect(query?.columns).toEqual({ startAt: true, endAt: true })
    const where = dialect.sqlToQuery(query?.where as SQL)
    expect(where.params).toEqual([userId, "cancelled", "2030-01-07T13:00:00.000Z", "2030-01-07T12:00:00.000Z"])
    expect(where.sql).toContain('"status" <>')
    expect(where.sql).toContain('"start_at" <')
    expect(where.sql).toContain('"end_at" >')
    expect(dialect.sqlToQuery(scheduleList.mock.calls[0]?.[0]?.where as SQL).params).toEqual([userId, 1])
  })

  test("removes occupied intervals across services while allowing adjacent bookings", async () => {
    appointmentList.mockResolvedValue([
      { ...currentAppointment, serviceId: appointmentId, startAt: new Date("2030-01-07T12:15:00Z") }
    ])
    const response = await request(availabilityPath)
    expect(await response.json()).toEqual({
      slots: [{ startAt: "2030-01-07T12:30:00.000Z", endAt: "2030-01-07T13:00:00.000Z" }]
    })
  })

  test("returns an empty list for a closed day", async () => {
    scheduleList.mockResolvedValue([])
    expect(await (await request(availabilityPath)).json()).toEqual({ slots: [] })
    expect(appointmentList).not.toHaveBeenCalled()
  })

  test("returns an empty list for past days and services longer than opening hours", async () => {
    expect(await (await request(availabilityPath.replace("2030-01-07", "2029-12-31"))).json()).toEqual({ slots: [] })
    serviceGet.mockResolvedValue({ ...service, durationInMinutes: 61 })
    expect(await (await request(availabilityPath)).json()).toEqual({ slots: [] })
    expect(appointmentList).not.toHaveBeenCalled()
  })

  test("returns an empty list when every slot is occupied", async () => {
    appointmentList.mockResolvedValue([{ ...currentAppointment, endAt: new Date("2030-01-07T13:00:00Z") }])
    expect(await (await request(availabilityPath)).json()).toEqual({ slots: [] })
  })

  test("returns 409 if a slot becomes occupied after consultation", async () => {
    const listed = await request(availabilityPath)
    expect(await listed.json()).toHaveProperty("slots.0.startAt", "2030-01-07T12:00:00.000Z")
    const fixture = transaction()
    fixture.tx.query.appointments.findFirst.mockResolvedValue({ id: "new-booking" })
    const response = await request(`${path}/appointments`, "POST", {
      serviceId,
      startAt: "2030-01-07T12:00:00Z",
      customerName: "Maria",
      customerEmail: "maria@example.com",
      customerPhone: "11987654321"
    })
    expect(response.status).toBe(409)
    expect(fixture.values).not.toHaveBeenCalled()
  })

  test("returns a fixed booking link for the authenticated company when configured", async () => {
    const response = await request("/booking-link")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: `http://localhost:3000/agendar/${userId}` })
    for (const query of [serviceGet, scheduleGet]) {
      expect(query.mock.calls[0]?.[0]?.columns).toEqual({ id: true })
      expect(dialect.sqlToQuery(query.mock.calls[0]?.[0]?.where as SQL).params).toEqual([userId])
    }
  })

  test.each(["services", "schedules", "both"])(
    "requires initial setup for booking links: missing %s",
    async (missing) => {
      if (missing !== "schedules") serviceGet.mockResolvedValue(undefined)
      if (missing !== "services") scheduleGet.mockResolvedValue(undefined)
      expect((await request("/booking-link")).status).toBe(422)
    }
  )
})
