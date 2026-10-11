import { isValidPhone, parsePhone } from "@brazilian-utils/brazilian-utils"
import { z } from "zod"
import { appointmentStatusEnum } from "@/db/schema/appointments"
import { hasSafePaginationOffset, paginationFields } from "@/lib/pagination"
import { hasDefinedFields } from "@/lib/validation"

export const appointmentParamsSchema = z.strictObject({ appointmentId: z.uuidv7() })

const instantSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value))

const startAtSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => /T\d{2}:\d{2}(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value), {
    message: "O horário de início deve ter precisão de minutos"
  })
  .transform((value) => new Date(value))
  .meta({
    description: "Instante ISO 8601 com offset; segundos e frações devem ser zero. Validado no fuso configurado da API."
  })

const appointmentFields = {
  serviceId: z.uuidv7(),
  customerName: z.string().trim().min(1).max(150),
  customerEmail: z.email().max(254),
  customerPhone: z
    .string()
    .refine((value) => isValidPhone(value, { version: 2 }), { message: "Telefone inválido" })
    .transform((value) => parsePhone(value)),
  startAt: startAtSchema,
  notes: z.string().trim().max(2000).nullish()
}

export const createAppointmentSchema = z.strictObject(appointmentFields)
export const editAppointmentSchema = createAppointmentSchema.partial().refine(hasDefinedFields, {
  message: "Nenhum campo informado para atualização"
})
export const updateStatusAppointmentSchema = z.strictObject({ status: z.enum(appointmentStatusEnum) })

export const getAppointmentsQuerySchema = z
  .strictObject({
    ...paginationFields,
    from: instantSchema.optional().meta({ description: "Limite inclusivo para startAt, em ISO 8601 com offset." }),
    to: instantSchema
      .optional()
      .meta({ description: "Limite exclusivo para startAt, em ISO 8601 com offset; deve ser posterior a from." })
  })
  .refine(({ from, to }) => !from || !to || from < to, {
    path: ["to"],
    message: "O limite final deve ser posterior ao limite inicial"
  })
  .refine(hasSafePaginationOffset, {
    path: ["page"],
    message: "Página fora do intervalo permitido"
  })
