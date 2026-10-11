import { defineConfig } from "drizzle-kit"
import { env } from "@/env"

export default defineConfig({
  dialect: "postgresql",
  casing: "snake_case",
  out: "./src/db/migrations",
  schema: "./src/db/schema/**",
  dbCredentials: {
    url: env.DATABASE_URL
  }
})
