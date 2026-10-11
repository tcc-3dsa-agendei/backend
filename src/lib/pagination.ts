import { z } from "zod"

export const paginationFields = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
}

export const hasSafePaginationOffset = ({ page, pageSize }: { page: number; pageSize: number }) =>
  Number.isSafeInteger((page - 1) * pageSize)

export const paginationQuerySchema = z.strictObject(paginationFields).refine(hasSafePaginationOffset, {
  path: ["page"],
  message: "Página fora do intervalo permitido"
})

export const paginate = <T>(rows: T[], page: number, pageSize: number) => ({
  items: rows.slice(0, pageSize),
  pagination: { page, pageSize, hasNext: rows.length > pageSize }
})
