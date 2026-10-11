import { APIError } from "better-auth"

export class DomainError extends Error {
  constructor(
    public readonly statusCode: 401 | 404 | 409 | 422,
    message: string
  ) {
    super(message)
  }
}

export const getDatabaseError = (error: unknown): { code: string; constraint: string } | undefined => {
  let current = error
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== "object") return undefined
    if (
      "code" in current &&
      "constraint" in current &&
      typeof current.code === "string" &&
      typeof current.constraint === "string"
    ) {
      return { code: current.code, constraint: current.constraint }
    }
    current = "cause" in current ? current.cause : undefined
  }
  return undefined
}

const databaseErrors = new Map<string, { statusCode: 409 | 422; message: string }>([
  [
    "23505:schedule_user_week_day_unique",
    { statusCode: 409, message: "Já existe uma agenda cadastrada para este dia da semana" }
  ],
  ["23505:users_cnpj_unique", { statusCode: 409, message: "CNPJ já cadastrado" }],
  ["23505:users_cnpj_normalized_unique", { statusCode: 409, message: "CNPJ já cadastrado" }],
  [
    "23503:appointments_service_id_services_id_fk",
    { statusCode: 409, message: "O serviço possui agendamentos vinculados e não pode ser excluído" }
  ],
  ["23P01:appointment_user_time_exclusion", { statusCode: 409, message: "Já existe um agendamento neste horário" }],
  [
    "23514:schedule_time_order_check",
    { statusCode: 422, message: "O horário final deve ser posterior ao horário inicial" }
  ],
  [
    "23514:appointment_time_order_check",
    { statusCode: 422, message: "O horário final deve ser posterior ao horário inicial" }
  ],
  ["23514:schedule_week_day_check", { statusCode: 422, message: "Dia da semana inválido" }]
])

export const resolveApiError = (error: unknown, code?: string): { statusCode: number; message: string } => {
  if (error instanceof DomainError) return { statusCode: error.statusCode, message: error.message }
  const databaseError = getDatabaseError(error)
  const mapped = databaseError && databaseErrors.get(`${databaseError.code}:${databaseError.constraint}`)
  if (mapped) return mapped
  if (error instanceof APIError && error.statusCode < 500)
    return { statusCode: error.statusCode, message: error.message }
  if (code === "VALIDATION" || code === "PARSE" || code === "INVALID_FILE_TYPE")
    return { statusCode: 422, message: "Dados inválidos" }
  if (code === "INVALID_COOKIE_SIGNATURE") return { statusCode: 401, message: "Acesso negado" }
  if (code === "NOT_FOUND") return { statusCode: 404, message: "Não encontrado" }
  return { statusCode: 500, message: "Erro interno do servidor" }
}
