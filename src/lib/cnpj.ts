import { isValidCnpj, parseCnpj } from "@brazilian-utils/brazilian-utils"
import { z } from "zod"

export const cnpjSchema = z
  .string()
  .trim()
  .refine(isValidCnpj, { message: "CNPJ inválido" })
  .transform((value) => parseCnpj(value))
