import { z } from "zod"
import { parseTimeToMinutes } from "@/lib/schedule-time"
import { hasDefinedFields } from "@/lib/validation"

export const scheduleParamsSchema = z.strictObject({ scheduleId: z.uuidv7() })

const scheduleFields = {
  weekDay: z.number().int().min(0).max(6),
  startTime: z.iso.time({ precision: -1 }),
  endTime: z.iso.time({ precision: -1 })
}

export const hasValidScheduleHours = ({ startTime, endTime }: { startTime: string; endTime: string }) =>
  parseTimeToMinutes(endTime) > parseTimeToMinutes(startTime)

export const createScheduleSchema = z.strictObject(scheduleFields).refine(hasValidScheduleHours, {
  path: ["endTime"],
  message: "O horário final deve ser posterior ao horário inicial"
})

export const editScheduleSchema = z
  .strictObject(scheduleFields)
  .partial()
  .refine(hasDefinedFields, { message: "Nenhum campo informado para atualização" })

export const serializeSchedule = <T extends { startTime: string; endTime: string }>(schedule: T) => ({
  ...schedule,
  startTime: schedule.startTime.slice(0, 5),
  endTime: schedule.endTime.slice(0, 5)
})
