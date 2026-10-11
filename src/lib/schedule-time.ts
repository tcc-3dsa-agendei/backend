import { env } from "@/env"

const localTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: env.SCHEDULING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
})

export const parseTimeToMinutes = (time: string) => {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number)

  return hours * 60 + minutes + seconds / 60
}

export const getLocalScheduleTime = (date: Date) => {
  const parts = Object.fromEntries(localTimeFormatter.formatToParts(date).map(({ type, value }) => [type, value]))
  const day = `${parts.year}-${parts.month}-${parts.day}`

  return {
    day,
    weekDay: new Date(`${day}T00:00:00Z`).getUTCDay(),
    minutes:
      Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60 + date.getUTCMilliseconds() / 60_000
  }
}

export const isSameScheduleDay = (startAt: Date, endAt: Date) =>
  getLocalScheduleTime(startAt).day === getLocalScheduleTime(endAt).day

export const appointmentFitsSchedule = (
  appointment: { startAt: Date; endAt: Date },
  schedule: { weekDay: number; startTime: string; endTime: string }
) => {
  const start = getLocalScheduleTime(appointment.startAt)
  const end = getLocalScheduleTime(appointment.endAt)

  return (
    appointment.endAt > appointment.startAt &&
    start.day === end.day &&
    start.weekDay === schedule.weekDay &&
    start.minutes >= parseTimeToMinutes(schedule.startTime) &&
    end.minutes <= parseTimeToMinutes(schedule.endTime)
  )
}

export const getBookingSlots = (
  day: string,
  durationInMinutes: number,
  schedule: { weekDay: number; startTime: string; endTime: string }
) => {
  const now = Date.now()
  if (day < getLocalScheduleTime(new Date(now)).day) return []
  const midnight = Date.parse(`${day}T00:00:00Z`)
  // Sample both sides of a time-zone transition; round trips discard nonexistent local times.
  const offsets = new Set(
    [-1, 0, 1, 2].map((days) => {
      const instant = midnight + days * 86_400_000
      const local = getLocalScheduleTime(new Date(instant))
      return Date.parse(`${local.day}T00:00:00Z`) + local.minutes * 60_000 - instant
    })
  )
  const slots: { startAt: Date; endAt: Date }[] = []
  for (
    let minutes = parseTimeToMinutes(schedule.startTime);
    minutes < parseTimeToMinutes(schedule.endTime);
    minutes += 15
  ) {
    for (const offset of offsets) {
      const startAt = new Date(midnight + minutes * 60_000 - offset)
      if (startAt.getTime() <= now) continue
      const local = getLocalScheduleTime(startAt)
      const slot = { startAt, endAt: new Date(startAt.getTime() + durationInMinutes * 60_000) }
      if (local.day === day && local.minutes === minutes && appointmentFitsSchedule(slot, schedule)) slots.push(slot)
    }
  }
  return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
}
