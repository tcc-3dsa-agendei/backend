import { relations } from "drizzle-orm"
import { index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { appointments } from "@/db/schema/appointments"
import { users } from "@/db/schema/users"

export const services = pgTable(
  "services",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationInMinutes: integer("duration_in_minutes").notNull(),
    price: numeric("price", { precision: 10, scale: 2, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  (table) => [index("service_user_id_idx").on(table.userId)]
).enableRLS()

export const serviceRelations = relations(services, ({ one, many }) => ({
  user: one(users, {
    fields: [services.userId],
    references: [users.id]
  }),
  appointments: many(appointments)
}))
