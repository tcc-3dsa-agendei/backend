import { relations, sql } from "drizzle-orm"
import { check, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { services } from "@/db/schema/services"
import { users } from "@/db/schema/users"

export const appointmentStatusEnum = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const

export type AppointmentStatus = (typeof appointmentStatusEnum)[number]

export const appointmentStatus = pgEnum("appointment_status", appointmentStatusEnum)

// Drizzle does not model EXCLUDE constraints. The overlap constraint is maintained
// as custom SQL in 0003_appointment-integrity.sql; keep it when changing migrations.
export const appointments = pgTable(
  "appointments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").notNull().default("scheduled"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  (table) => [
    index("appointment_user_id_idx").on(table.userId),
    index("appointment_service_id_idx").on(table.serviceId),
    index("appointment_start_at_idx").on(table.startAt),
    index("appointment_user_start_at_id_idx").on(
      table.userId,
      table.startAt.desc().nullsFirst(),
      table.id.desc().nullsFirst()
    ),
    check("appointment_time_order_check", sql`${table.endAt} > ${table.startAt}`)
  ]
).enableRLS()

export const appointmentRelations = relations(appointments, ({ one }) => ({
  user: one(users, {
    fields: [appointments.userId],
    references: [users.id]
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id]
  })
}))
