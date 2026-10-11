import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { cnpjSchema } from "@/lib/cnpj"

export const inspectCnpjs = (rows: { id: string; cnpj: string }[]) => {
  const normalized = new Map<string, string[]>()
  const invalidUserIds: string[] = []
  const changes: { id: string; cnpj: string }[] = []
  for (const row of rows) {
    const result = cnpjSchema.safeParse(row.cnpj)
    if (!result.success) {
      invalidUserIds.push(row.id)
      continue
    }
    const ids = normalized.get(result.data) ?? []
    ids.push(row.id)
    normalized.set(result.data, ids)
    if (row.cnpj !== result.data) changes.push({ id: row.id, cnpj: result.data })
  }
  return { changes, invalidUserIds, collisions: [...normalized.values()].filter((ids) => ids.length > 1) }
}

const main = async () => {
  const apply = Bun.argv.includes("--apply")
  try {
    const report = await db.transaction(async (tx) => {
      // Serialize the audit and writes with account creation/update when explicitly applying.
      if (apply) await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`)
      const rows = await tx.select({ id: users.id, cnpj: users.cnpj }).from(users)
      const inspection = inspectCnpjs(rows)
      const report = {
        mode: apply ? "apply" : "audit",
        total: rows.length,
        changes: inspection.changes.length,
        invalidUserIds: inspection.invalidUserIds,
        collisions: inspection.collisions
      }
      if (apply) {
        if (inspection.invalidUserIds.length || inspection.collisions.length) {
          console.error(report)
          throw new Error("Normalização bloqueada: resolva CNPJs inválidos e colisões antes de aplicar")
        }
        for (const row of inspection.changes) await tx.update(users).set({ cnpj: row.cnpj }).where(eq(users.id, row.id))
      }
      return report
    })
    // Reports contain counts and user IDs, without CNPJs, emails or credentials.
    console.info(report)
  } catch {
    console.error({ operation: "cnpj.normalize", result: "failure" })
    process.exitCode = 1
  } finally {
    await db.$client.end()
  }
}

if (import.meta.main) await main()
