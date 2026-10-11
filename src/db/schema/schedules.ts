import { relations, sql } from "drizzle-orm"
import { check, integer, pgTable, text, time, timestamp, unique } from "drizzle-orm/pg-core"
import { users } from "@/db/schema/users"

export const schedules = pgTable(
  "schedules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekDay: integer("week_day").notNull(), // 0-6
    startTime: time("start_time").notNull(), // "09:00"
    endTime: time("end_time").notNull(), // "18:00"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  (table) => [
    unique("schedule_user_week_day_unique").on(table.userId, table.weekDay),
    check("schedule_week_day_check", sql`${table.weekDay} between 0 and 6`),
    check("schedule_time_order_check", sql`${table.endTime} > ${table.startTime}`)
  ]
).enableRLS()

export const scheduleRelations = relations(schedules, ({ one }) => ({
  user: one(users, {
    fields: [schedules.userId],
    references: [users.id]
  })
}))
