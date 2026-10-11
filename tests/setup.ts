import { spyOn } from "bun:test"

// Override local credentials before importing the application; tests never use the real database.
Object.assign(process.env, {
  NODE_ENV: "test",
  BETTER_AUTH_URL: "http://localhost:3333",
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
  DATABASE_URL: "postgres://test:test@127.0.0.1:1/agendei_test",
  PORT: "3333",
  FRONTEND_URL: "http://localhost:3000",
  SCHEDULING_TIME_ZONE: "America/Sao_Paulo"
})

const { db } = await import("@/db")
spyOn(db.$client, "query").mockImplementation(() => {
  throw new Error("Database access must be mocked in this test")
})
spyOn(db.$client, "connect").mockImplementation(() => {
  throw new Error("Database transactions must be mocked in this test")
})
