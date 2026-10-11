import { and, eq, gt, lt, ne } from "drizzle-orm"
import { appointments } from "@/db/schema/appointments"
import { schedules } from "@/db/schema/schedules"
import { DomainError } from "@/lib/errors"
import {
  appointmentFitsSchedule,
  getLocalScheduleTime,
  isSameScheduleDay,
  parseTimeToMinutes
} from "@/lib/schedule-time"
import type { SchedulingTransaction } from "@/lib/scheduling"

export const lockAppointment = async (tx: SchedulingTransaction, userId: string, appointmentId: string) => {
  const [appointment] = await tx
    .select()
    .from(appointments)
    .where(and(eq(appointments.userId, userId), eq(appointments.id, appointmentId)))
    .for("update")

  if (!appointment) throw new DomainError(404, "Agendamento não encontrado")

  return appointment
}

export const ensureAppointmentAvailability = async (
  tx: SchedulingTransaction,
  userId: string,
  interval: { startAt: Date; endAt: Date },
  options: { excludeAppointmentId?: string; bookingGrid?: boolean } = {}
) => {
  // Check after acquiring locks: a request may have waited past its requested start.
  if (interval.startAt.getTime() <= Date.now()) {
    throw new DomainError(422, "A data do agendamento não pode estar no passado")
  }
  if (interval.endAt <= interval.startAt) {
    throw new DomainError(422, "O horário final deve ser posterior ao horário inicial")
  }
  if (!isSameScheduleDay(interval.startAt, interval.endAt)) {
    throw new DomainError(422, "O agendamento não pode terminar no dia seguinte")
  }

  const windows = await tx.query.schedules.findMany({
    where: and(eq(schedules.userId, userId), eq(schedules.weekDay, getLocalScheduleTime(interval.startAt).weekDay))
  })
  if (windows.length === 0) {
    throw new DomainError(422, "Não há agenda cadastrada para este dia")
  }
  if (
    !windows.some(
      (window) =>
        appointmentFitsSchedule(interval, window) &&
        (!options.bookingGrid ||
          (getLocalScheduleTime(interval.startAt).minutes - parseTimeToMinutes(window.startTime)) % 15 === 0)
    )
  ) {
    throw new DomainError(422, "O agendamento está fora do horário de funcionamento")
  }

  const conflict = await tx.query.appointments.findFirst({
    columns: { id: true },
    where: and(
      eq(appointments.userId, userId),
      options.excludeAppointmentId ? ne(appointments.id, options.excludeAppointmentId) : undefined,
      ne(appointments.status, "cancelled"),
      lt(appointments.startAt, interval.endAt),
      gt(appointments.endAt, interval.startAt)
    )
  })
  if (conflict) throw new DomainError(409, "Já existe um agendamento neste horário")
}
