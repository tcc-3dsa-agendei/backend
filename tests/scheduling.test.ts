import { afterEach, beforeEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { ensureAppointmentAvailability, lockAppointment } from "@/lib/appointment-availability"
import {
  appointmentFitsSchedule,
  getBookingSlots,
  getLocalScheduleTime,
  isSameScheduleDay,
  parseTimeToMinutes
} from "@/lib/schedule-time"
import { type SchedulingTransaction, withSchedulingLock } from "@/lib/scheduling"

const dialect = new PgDialect()
const userId = "019c0000-0000-7000-8000-000000000001"
const window = { weekDay: 1, startTime: "09:00", endTime: "18:00" }
const interval = { startAt: new Date("2030-01-07T12:00:00Z"), endAt: new Date("2030-01-07T12:30:00Z") }
const windows = mock(async (_options: { where: SQL }) => [window])
const conflict = mock(async (_options: { where: SQL }): Promise<{ id: string } | undefined> => undefined)
const tx = {
  query: { schedules: { findMany: windows }, appointments: { findFirst: conflict } }
} as unknown as SchedulingTransaction

beforeEach(() => {
  setSystemTime(new Date("2030-01-01T12:00:00Z"))
  windows.mockReset().mockResolvedValue([window])
  conflict.mockReset().mockResolvedValue(undefined)
})
afterEach(() => setSystemTime())

describe("business time zone", () => {
  test("uses São Paulo's date even when the UTC date differs", () => {
    expect(getLocalScheduleTime(new Date("2030-01-08T01:30:00Z"))).toEqual({
      day: "2030-01-07",
      weekDay: 1,
      minutes: 22 * 60 + 30
    })
    expect(parseTimeToMinutes("09:30:30")).toBe(570.5)
  })

  test("accepts the exact opening and closing boundaries", () => {
    expect(
      appointmentFitsSchedule({ startAt: interval.startAt, endAt: new Date("2030-01-07T21:00:00Z") }, window)
    ).toBe(true)
  })

  test.each([
    { startAt: new Date("2030-01-07T11:59:00Z"), endAt: interval.endAt },
    { startAt: interval.startAt, endAt: new Date("2030-01-07T21:01:00Z") },
    { startAt: interval.startAt, endAt: interval.startAt },
    { startAt: new Date("2030-01-08T12:00:00Z"), endAt: new Date("2030-01-08T12:30:00Z") }
  ])("rejects intervals outside the schedule: %j", (candidate) => {
    expect(appointmentFitsSchedule(candidate, window)).toBe(false)
  })

  test("detects crossing midnight in the business time zone", () => {
    expect(isSameScheduleDay(new Date("2030-01-08T02:59:00Z"), new Date("2030-01-08T03:00:00Z"))).toBe(false)
  })
})

describe("availability", () => {
  test("checks the owner, weekday, and overlap using exclusive interval ends", async () => {
    await ensureAppointmentAvailability(tx, userId, interval, { excludeAppointmentId: "current-appointment" })
    const scheduleOptions = windows.mock.calls[0]?.[0] as unknown as { where: import("drizzle-orm").SQL }
    const conflictOptions = conflict.mock.calls[0]?.[0] as unknown as { where: import("drizzle-orm").SQL }
    expect(dialect.sqlToQuery(scheduleOptions.where).params).toEqual([userId, 1])
    const query = dialect.sqlToQuery(conflictOptions.where)
    expect(query.params).toEqual([
      userId,
      "current-appointment",
      "cancelled",
      interval.endAt.toISOString(),
      interval.startAt.toISOString()
    ])
    expect(query.sql).toContain('"start_at" <')
    expect(query.sql).toContain('"end_at" >')
  })

  test.each([
    { startAt: new Date("2030-01-01T12:00:00Z"), endAt: interval.endAt },
    { startAt: interval.startAt, endAt: interval.startAt },
    { startAt: interval.startAt, endAt: new Date("2030-01-08T12:00:00Z") }
  ])("rejects invalid intervals before querying: %j", async (candidate) => {
    await expect(ensureAppointmentAvailability(tx, userId, candidate)).rejects.toMatchObject({ statusCode: 422 })
    expect(windows).not.toHaveBeenCalled()
    expect(conflict).not.toHaveBeenCalled()
  })

  test("rejects days without opening hours", async () => {
    windows.mockResolvedValue([])
    await expect(ensureAppointmentAvailability(tx, userId, interval)).rejects.toMatchObject({ statusCode: 422 })
    expect(conflict).not.toHaveBeenCalled()
  })

  test("rejects appointments outside opening hours", async () => {
    windows.mockResolvedValue([{ ...window, startTime: "10:00" }])
    await expect(ensureAppointmentAvailability(tx, userId, interval)).rejects.toMatchObject({ statusCode: 422 })
    expect(conflict).not.toHaveBeenCalled()
  })

  test("returns a conflict for an occupied interval", async () => {
    conflict.mockResolvedValue({ id: "other-appointment" })
    await expect(ensureAppointmentAvailability(tx, userId, interval)).rejects.toMatchObject({ statusCode: 409 })
  })

  test("locks appointments using both their ID and owner", async () => {
    const lock = mock(async (_mode: string) => [])
    const where = mock((_condition: SQL) => ({ for: lock }))
    const transaction = { select: () => ({ from: () => ({ where }) }) } as unknown as SchedulingTransaction
    await expect(lockAppointment(transaction, userId, "another-account-id")).rejects.toMatchObject({ statusCode: 404 })
    expect(lock).toHaveBeenCalledWith("update")
    expect(dialect.sqlToQuery(where.mock.calls[0]?.[0] as unknown as import("drizzle-orm").SQL).params).toEqual([
      userId,
      "another-account-id"
    ])
  })
})

describe("public booking slots", () => {
  test("uses 15-minute starts from opening and fits the entire duration", () => {
    const slots = getBookingSlots("2030-01-07", 20, { ...window, startTime: "09:07", endTime: "10:07" })
    expect(slots.map(({ startAt, endAt }) => [startAt.toISOString(), endAt.toISOString()])).toEqual([
      ["2030-01-07T12:07:00.000Z", "2030-01-07T12:27:00.000Z"],
      ["2030-01-07T12:22:00.000Z", "2030-01-07T12:42:00.000Z"],
      ["2030-01-07T12:37:00.000Z", "2030-01-07T12:57:00.000Z"]
    ])
  })

  test("includes the exact closing boundary and excludes past or current starts", () => {
    setSystemTime(new Date("2030-01-07T12:15:00Z"))
    expect(getBookingSlots("2030-01-07", 30, { ...window, endTime: "10:00" })).toEqual([
      { startAt: new Date("2030-01-07T12:30:00Z"), endAt: new Date("2030-01-07T13:00:00Z") }
    ])
    expect(getBookingSlots("2029-12-31", 30, window)).toEqual([])
    expect(getBookingSlots("2030-01-07", 1440, window)).toEqual([])
    expect(getBookingSlots("2030-01-08", 30, window)).toEqual([])
  })

  test("uses the requested local date when instants fall on the following UTC day", () => {
    const slots = getBookingSlots("2030-01-07", 30, { ...window, startTime: "22:00", endTime: "23:00" })
    expect(slots[0]?.startAt.toISOString()).toBe("2030-01-08T01:00:00.000Z")
    expect(slots.at(-1)?.endAt.toISOString()).toBe("2030-01-08T02:00:00.000Z")
  })

  test("skips nonexistent local times when daylight saving starts", () => {
    setSystemTime(new Date("2018-11-01T00:00:00Z"))
    const slots = getBookingSlots("2018-11-04", 30, { weekDay: 0, startTime: "00:00", endTime: "02:00" })
    expect(slots.map(({ startAt }) => startAt.toISOString())).toEqual([
      "2018-11-04T03:00:00.000Z",
      "2018-11-04T03:15:00.000Z",
      "2018-11-04T03:30:00.000Z"
    ])
  })

  test("includes both occurrences of repeated local times, ordered by instant", () => {
    setSystemTime(new Date("2019-02-01T00:00:00Z"))
    const slots = getBookingSlots("2019-02-16", 15, { weekDay: 6, startTime: "23:00", endTime: "23:59" })
    expect(slots.map(({ startAt }) => startAt.toISOString())).toEqual([
      "2019-02-17T01:00:00.000Z",
      "2019-02-17T01:15:00.000Z",
      "2019-02-17T01:30:00.000Z",
      "2019-02-17T01:45:00.000Z",
      "2019-02-17T02:00:00.000Z",
      "2019-02-17T02:15:00.000Z",
      "2019-02-17T02:30:00.000Z"
    ])
  })
})

describe("per-account transaction lock", () => {
  test("waits for the user lock before checking or writing availability", async () => {
    let release: (rows: { id: string }[]) => void = () => {}
    const acquired = new Promise<{ id: string }[]>((resolve) => {
      release = resolve
    })
    const lock = mock(() => acquired)
    const transaction = {
      select: () => ({ from: () => ({ where: () => ({ for: lock }) }) })
    } as unknown as SchedulingTransaction
    const transactionSpy = spyOn(db, "transaction").mockImplementation(async (operation) => operation(transaction))
    const operation = mock(async () => "saved")
    try {
      const result = withSchedulingLock(userId, operation)
      expect(operation).not.toHaveBeenCalled()
      expect(lock).toHaveBeenCalledWith("update")
      release([{ id: userId }])
      expect(await result).toBe("saved")
      expect(operation).toHaveBeenCalledWith(transaction)
      expect(transactionSpy.mock.calls[0]?.[1]).toEqual({ isolationLevel: "read committed" })
    } finally {
      release([])
      transactionSpy.mockRestore()
    }
  })

  test("does not execute the write if the session owner no longer exists", async () => {
    const transaction = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => [] }) }) })
    } as unknown as SchedulingTransaction
    const transactionSpy = spyOn(db, "transaction").mockImplementation(async (operation) => operation(transaction))
    const operation = mock(async () => "saved")
    try {
      await expect(withSchedulingLock(userId, operation)).rejects.toMatchObject({ statusCode: 401 })
      expect(operation).not.toHaveBeenCalled()
    } finally {
      transactionSpy.mockRestore()
    }
  })
})
