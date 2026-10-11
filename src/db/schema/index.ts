import { accounts, accountsRelations } from "@/db/schema/accounts"
import { appointmentRelations, appointments } from "@/db/schema/appointments"
import { scheduleRelations, schedules } from "@/db/schema/schedules"
import { serviceRelations, services } from "@/db/schema/services"
import { sessions, sessionsRelations } from "@/db/schema/sessions"
import { users, usersRelations } from "@/db/schema/users"
import { verifications } from "@/db/schema/verifications"

export const schema = {
  users,
  accounts,
  verifications,
  sessions,
  appointments,
  schedules,
  services,
  usersRelations,
  accountsRelations,
  sessionsRelations,
  appointmentRelations,
  scheduleRelations,
  serviceRelations
}
