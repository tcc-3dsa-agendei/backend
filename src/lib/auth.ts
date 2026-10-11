import { APIError } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth } from "better-auth/minimal"
import { openAPI } from "better-auth/plugins"
import { and, eq, ne, sql } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { env } from "@/env"
import { cnpjSchema } from "@/lib/cnpj"

const ensureCnpjAvailable = async (cnpj: string, excludeUserId?: string) => {
  const user = await db.query.users.findFirst({
    columns: { id: true },
    where: and(
      eq(sql`regexp_replace(${users.cnpj}, '[^0-9]', '', 'g')`, cnpj),
      excludeUserId ? ne(users.id, excludeUserId) : undefined
    )
  })
  if (user) throw APIError.from("CONFLICT", { code: "CNPJ_ALREADY_REGISTERED", message: "CNPJ já cadastrado" })
}

export const auth = betterAuth({
  appName: "Agendei",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.FRONTEND_URL],
  onAPIError: { throw: true },
  logger: {
    level: "warn",
    log: (level) => {
      // Better Auth messages and arguments may contain credentials or personal data.
      const entry = { operation: "auth", result: "failure", level }
      if (level === "error") console.error(entry)
      else console.warn(entry)
    }
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    transaction: true,
    usePlural: true
  }),
  advanced: {
    database: {
      generateId: () => Bun.randomUUIDv7(),
      joins: true
    }
  },
  user: {
    additionalFields: {
      cnpj: {
        type: "string",
        input: true,
        required: true,
        unique: true,
        validator: {
          input: cnpjSchema
        }
      }
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const cnpj = cnpjSchema.parse(user.cnpj)
          await ensureCnpjAvailable(cnpj)
          return { data: { ...user, cnpj } }
        }
      },
      update: {
        before: async (user, context) => {
          if (user.cnpj === undefined) return
          const cnpj = cnpjSchema.parse(user.cnpj)
          await ensureCnpjAvailable(cnpj, context?.context.session?.user.id)
          return { data: { ...user, cnpj } }
        }
      }
    }
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    password: {
      hash: (password: string) => Bun.password.hash(password),
      verify: ({ password, hash }) => Bun.password.verify(password, hash)
    }
  },
  plugins: [openAPI()]
})
