import { and, eq, gt, inArray } from "drizzle-orm"
import { db } from "@/db"
import { appointments } from "@/db/schema/appointments"
import { users } from "@/db/schema/users"
import { DomainError } from "@/lib/errors"
import { getLocalScheduleTime } from "@/lib/schedule-time"

export type SchedulingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// All API writes that change availability must acquire this lock before reading it.
// READ COMMITTED ensures queries after a waiting lock see the preceding writer's commit.
export const withSchedulingLock = <T>(
  userId: string,
  operation: (tx: SchedulingTransaction) => Promise<T>,
  missingOwnerStatus: 401 | 404 = 401
) =>
  db.transaction(
    async (tx) => {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update")

      if (!user) {
        throw new DomainError(
          missingOwnerStatus,
          missingOwnerStatus === 404 ? "Empresa não encontrada" : "Acesso negado"
        )
      }

      return operation(tx)
    },
    { isolationLevel: "read committed" }
  )

export const getFutureActiveAppointments = async (tx: SchedulingTransaction, userId: string, weekDay: number) => {
  const result = await tx.query.appointments.findMany({
    columns: { startAt: true, endAt: true },
    where: and(
      eq(appointments.userId, userId),
      inArray(appointments.status, ["scheduled", "confirmed"]),
      gt(appointments.startAt, new Date())
    )
  })

  return result.filter(({ startAt }) => getLocalScheduleTime(startAt).weekDay === weekDay)
}
