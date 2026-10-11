import { z } from "zod"

export const companyParamsSchema = z.strictObject({ companyId: z.uuidv7() })
export const availabilityQuerySchema = z.strictObject({ serviceId: z.uuidv7(), date: z.iso.date() })
