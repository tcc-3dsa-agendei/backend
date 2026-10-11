import { relations, sql } from "drizzle-orm"
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { accounts } from "@/db/schema/accounts"
import { sessions } from "@/db/schema/sessions"

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    cnpj: text("cnpj").notNull().unique()
  },
  (table) => [uniqueIndex("users_cnpj_normalized_unique").on(sql`regexp_replace(${table.cnpj}, '[^0-9]', '', 'g')`)]
)

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts)
}))
