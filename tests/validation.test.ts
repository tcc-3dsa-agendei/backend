import { describe, expect, test } from "bun:test"
import { cnpjSchema } from "@/lib/cnpj"
import { paginate, paginationQuerySchema } from "@/lib/pagination"
import {
  createAppointmentSchema,
  editAppointmentSchema,
  getAppointmentsQuerySchema
} from "@/routes/appointments/schema"
import { availabilityQuerySchema } from "@/routes/public/schema"
import { createScheduleSchema, editScheduleSchema, serializeSchedule } from "@/routes/schedules/schema"
import { createServiceSchema, editServiceSchema } from "@/routes/services/schema"
import { inspectCnpjs } from "../scripts/normalize-cnpjs"

const appointment = {
  serviceId: "019c0000-0000-7000-8000-000000000001",
  customerName: "  Maria  ",
  customerEmail: "maria@example.com",
  customerPhone: "(11) 98765-4321",
  startAt: "2030-01-07T09:00:00-03:00"
}

describe("input validation", () => {
  test("normalizes customer data and converts the start to an instant", () => {
    expect(createAppointmentSchema.parse(appointment)).toEqual({
      ...appointment,
      customerName: "Maria",
      customerPhone: "11987654321",
      startAt: new Date("2030-01-07T12:00:00Z")
    })
  })

  test.each([
    { startAt: "2030-01-07T09:00:01-03:00" },
    { startAt: "2030-01-07T09:00:00.001-03:00" },
    { startAt: "2030-01-07T09:00:00" },
    { startAt: "2030-02-30T09:00:00Z" },
    { startAt: "2030-01-07T09:00:00+24:00" },
    { serviceId: "not-a-uuid" },
    { customerName: " " },
    { customerEmail: undefined },
    { customerEmail: null },
    { customerEmail: "invalid" },
    { customerEmail: `${"a".repeat(250)}@example.com` },
    { customerPhone: "123" },
    { notes: "a".repeat(2001) },
    { userId: "another-user" }
  ])("rejects invalid appointment fields: %j", (fields) => {
    expect(createAppointmentSchema.safeParse({ ...appointment, ...fields }).success).toBe(false)
  })

  test.each([createScheduleSchema, createServiceSchema, createAppointmentSchema])(
    "rejects an empty creation body",
    (schema) => expect(schema.safeParse({}).success).toBe(false)
  )

  test.each([editScheduleSchema, editServiceSchema, editAppointmentSchema])("rejects an empty edit body", (schema) =>
    expect(schema.safeParse({}).success).toBe(false)
  )

  test("distinguishes omitted nullable fields from explicit null", () => {
    expect(editServiceSchema.parse({ name: "Corte" })).not.toHaveProperty("price")
    expect(editServiceSchema.parse({ price: null, description: null })).toEqual({ price: null, description: null })
    expect(editAppointmentSchema.parse({ notes: null })).toEqual({ notes: null })
    expect(editAppointmentSchema.safeParse({ customerName: null }).success).toBe(false)
    expect(editAppointmentSchema.safeParse({ customerEmail: null }).success).toBe(false)
    expect(editAppointmentSchema.safeParse({ customerEmail: "invalid" }).success).toBe(false)
    expect(editAppointmentSchema.parse({ customerEmail: "ana@example.com" })).toEqual({
      customerEmail: "ana@example.com"
    })
  })

  test.each(["2030-02-30", "2030-1-7", "2030-01-07T00:00:00Z", "not-a-date"])(
    "rejects invalid booking dates: %s",
    (date) => {
      expect(availabilityQuerySchema.safeParse({ serviceId: appointment.serviceId, date }).success).toBe(false)
    }
  )

  test.each([
    { weekDay: -1 },
    { weekDay: 7 },
    { weekDay: 1.5 },
    { startTime: "9:00" },
    { startTime: "09:00:00" },
    { endTime: "09:00" },
    { endTime: "08:59" },
    { endTime: "24:00" }
  ])("rejects invalid schedules: %j", (fields) => {
    expect(
      createScheduleSchema.safeParse({ weekDay: 1, startTime: "09:00", endTime: "18:00", ...fields }).success
    ).toBe(false)
  })

  test("accepts opening hours and strips database seconds in responses", () => {
    expect(createScheduleSchema.parse({ weekDay: 0, startTime: "00:00", endTime: "23:59" }).weekDay).toBe(0)
    expect(serializeSchedule({ id: "schedule", startTime: "09:00:00", endTime: "18:00:00" })).toEqual({
      id: "schedule",
      startTime: "09:00",
      endTime: "18:00"
    })
  })

  test.each([-1, 1.001, 100_000_000])("rejects invalid service prices: %s", (price) => {
    expect(createServiceSchema.safeParse({ name: "Corte", durationInMinutes: 30, price }).success).toBe(false)
  })

  test.each([0, 0.1 + 0.2, 12.34, 99_999_999.99])("accepts valid service prices: %s", (price) => {
    expect(createServiceSchema.safeParse({ name: "Corte", durationInMinutes: 30, price }).success).toBe(true)
  })

  test.each([4, 1441, 5.5])("rejects invalid service durations: %s", (durationInMinutes) => {
    expect(createServiceSchema.safeParse({ name: "Corte", durationInMinutes }).success).toBe(false)
  })
})

describe("pagination and date filters", () => {
  test("applies defaults and parses query strings", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
    expect(paginationQuerySchema.parse({ page: "2", pageSize: "100" })).toEqual({ page: 2, pageSize: 100 })
  })

  test.each([{ page: 0 }, { page: 1.5 }, { pageSize: 101 }, { pageSize: 0 }, { page: 1e15, pageSize: 100 }])(
    "rejects invalid pagination: %j",
    (query) => expect(paginationQuerySchema.safeParse(query).success).toBe(false)
  )

  test("uses the extra row only to calculate hasNext", () => {
    expect(paginate([1, 2, 3], 2, 2)).toEqual({ items: [1, 2], pagination: { page: 2, pageSize: 2, hasNext: true } })
    expect(paginate([1, 2], 1, 2).pagination.hasNext).toBe(false)
    expect(paginate([], 1, 20).items).toEqual([])
  })

  test("requires an increasing date range but allows either bound alone", () => {
    const from = "2030-01-07T12:00:00Z"
    expect(getAppointmentsQuerySchema.safeParse({ from }).success).toBe(true)
    expect(getAppointmentsQuerySchema.safeParse({ to: from }).success).toBe(true)
    expect(getAppointmentsQuerySchema.safeParse({ from, to: from }).success).toBe(false)
    expect(getAppointmentsQuerySchema.safeParse({ from, to: "2030-01-06T12:00:00Z" }).success).toBe(false)
    expect(getAppointmentsQuerySchema.parse({ from, to: "2030-01-08T12:00:00Z" }).from).toEqual(new Date(from))
  })
})

describe("CNPJ inventory", () => {
  test("normalizes formatted numeric CNPJs and rejects invalid check digits", () => {
    expect(cnpjSchema.parse(" 04.252.011/0001-10 ")).toBe("04252011000110")
    expect(cnpjSchema.safeParse("04252011000111").success).toBe(false)
  })

  test("reports collisions and invalid IDs without silently merging accounts", () => {
    expect(
      inspectCnpjs([
        { id: "masked", cnpj: "04.252.011/0001-10" },
        { id: "normalized", cnpj: "04252011000110" },
        { id: "invalid", cnpj: "123" }
      ])
    ).toEqual({
      changes: [{ id: "masked", cnpj: "04252011000110" }],
      invalidUserIds: ["invalid"],
      collisions: [["masked", "normalized"]]
    })
    expect(inspectCnpjs([])).toEqual({ changes: [], invalidUserIds: [], collisions: [] })
  })

  test.failing("accepts the official alphanumeric CNPJ format (known audit defect)", () => {
    expect(cnpjSchema.parse("00.000.000/E08G-12")).toBe("00000000E08G12")
  })
})
