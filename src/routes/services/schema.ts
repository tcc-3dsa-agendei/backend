import { z } from "zod"
import { hasDefinedFields } from "@/lib/validation"

export const serviceParamsSchema = z.strictObject({ serviceId: z.uuidv7() })

const serviceFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().nullish(),
  durationInMinutes: z.number().int().min(5).max(1440),
  price: z
    .number()
    .nonnegative()
    .max(99_999_999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: "O preço deve ter no máximo 2 casas decimais"
    })
    .nullish()
}

export const createServiceSchema = z.strictObject(serviceFields)

export const editServiceSchema = createServiceSchema.partial().refine(hasDefinedFields, {
  message: "Nenhum campo informado para atualização"
})
