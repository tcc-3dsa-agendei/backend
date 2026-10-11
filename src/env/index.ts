import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3333),
  FRONTEND_URL: z.url(),
  SCHEDULING_TIME_ZONE: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value })
        return true
      } catch {
        return false
      }
    }, "Fuso horário inválido")
    .default("America/Sao_Paulo")
})

const { success, data } = envSchema.safeParse(Bun.env)

if (!success) {
  console.error("Variáveis de ambiente inválidas")
  process.exit(1)
}

export const env = data
