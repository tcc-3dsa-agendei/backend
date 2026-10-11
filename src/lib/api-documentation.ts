import type { DocumentDecoration } from "elysia"

type ResponseObject = Exclude<NonNullable<DocumentDecoration["responses"]>[string], { $ref: string }>
type Schema = NonNullable<NonNullable<ResponseObject["content"]>[string]["schema"]>

const uuid: Schema = { type: "string", format: "uuid" }
const dateTime: Schema = { type: "string", format: "date-time" }
const nullableText: Schema = { type: "string", nullable: true }
const timestamps = { createdAt: dateTime, updatedAt: dateTime }
const scheduleHours = {
  weekDay: { type: "integer", minimum: 0, maximum: 6 },
  startTime: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", example: "09:00" },
  endTime: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", example: "18:00" }
} satisfies Record<string, Schema>
const schedule: Schema = {
  type: "object",
  required: ["id", "userId", "weekDay", "startTime", "endTime", "createdAt", "updatedAt"],
  properties: {
    id: uuid,
    userId: uuid,
    ...scheduleHours,
    ...timestamps
  }
}
const serviceSummary: Schema = {
  type: "object",
  required: ["id", "name", "description", "durationInMinutes", "price"],
  properties: {
    id: uuid,
    name: { type: "string", maxLength: 100 },
    description: nullableText,
    durationInMinutes: { type: "integer", minimum: 5, maximum: 1440 },
    price: { type: "number", minimum: 0, maximum: 99999999.99, nullable: true }
  }
}
const service: Schema = {
  allOf: [
    serviceSummary,
    { type: "object", required: ["userId", "createdAt", "updatedAt"], properties: { userId: uuid, ...timestamps } }
  ]
}
const appointment: Schema = {
  type: "object",
  required: [
    "id",
    "userId",
    "serviceId",
    "customerName",
    "customerEmail",
    "customerPhone",
    "startAt",
    "endAt",
    "status",
    "notes",
    "createdAt",
    "updatedAt"
  ],
  properties: {
    id: uuid,
    userId: uuid,
    serviceId: uuid,
    customerName: { type: "string", maxLength: 150 },
    customerEmail: { type: "string", format: "email", nullable: true },
    customerPhone: { type: "string" },
    startAt: dateTime,
    endAt: dateTime,
    status: { type: "string", enum: ["scheduled", "confirmed", "completed", "cancelled", "no_show"] },
    notes: nullableText,
    ...timestamps
  }
}
const pagination: Schema = {
  type: "object",
  required: ["page", "pageSize", "hasNext"],
  properties: {
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
    hasNext: { type: "boolean" }
  }
}
export const apiSchemas: Record<string, Schema> = {
  Schedule: schedule,
  Service: service,
  ServiceSummary: serviceSummary,
  Appointment: appointment,
  Pagination: pagination,
  BookingLink: {
    type: "object",
    required: ["url"],
    properties: { url: { type: "string", format: "uri" } }
  },
  PublicCompanyResponse: {
    type: "object",
    required: ["company"],
    properties: {
      company: {
        type: "object",
        required: ["name", "timeZone", "schedules", "services"],
        properties: {
          name: { type: "string" },
          timeZone: { type: "string", example: "America/Sao_Paulo" },
          schedules: {
            type: "array",
            maxItems: 7,
            items: {
              type: "object",
              required: ["weekDay", "startTime", "endTime"],
              properties: scheduleHours
            }
          },
          services: { type: "array", items: { $ref: "#/components/schemas/ServiceSummary" } }
        }
      }
    }
  },
  Availability: {
    type: "object",
    required: ["slots"],
    properties: {
      slots: {
        type: "array",
        items: { type: "object", required: ["startAt", "endAt"], properties: { startAt: dateTime, endAt: dateTime } }
      }
    }
  },
  PublicAppointmentResponse: {
    type: "object",
    required: ["appointment"],
    properties: {
      appointment: {
        type: "object",
        required: ["id", "serviceId", "startAt", "endAt", "status"],
        properties: {
          id: uuid,
          serviceId: uuid,
          startAt: dateTime,
          endAt: dateTime,
          status: { type: "string", enum: ["scheduled"] }
        }
      }
    }
  },
  AppointmentWithService: {
    allOf: [appointment, { type: "object", required: ["service"], properties: { service: serviceSummary } }]
  },
  Error: { type: "object", required: ["message"], properties: { message: { type: "string" } } }
}

export const apiDetail = (
  operationId: string,
  resource: "schedules" | "services" | "appointments",
  statusCode: 200 | 201 | 204,
  list = false,
  errors: number[] = [401, 404, 409, 422, 500]
): DocumentDecoration => {
  const singular = { schedules: "schedule", services: "service", appointments: "appointment" }[resource]
  const model = { schedules: "Schedule", services: "Service", appointments: "Appointment" }[resource]
  const schema: Schema = {
    type: "object",
    required: list && resource !== "schedules" ? [resource, "pagination"] : [list ? resource : singular],
    properties: list
      ? {
          [resource]: {
            type: "array",
            items: { $ref: `#/components/schemas/${resource === "appointments" ? "AppointmentWithService" : model}` },
            ...(resource === "schedules" ? { maxItems: 7 } : {})
          },
          ...(resource !== "schedules" ? { pagination: { $ref: "#/components/schemas/Pagination" } } : {})
        }
      : { [singular]: { $ref: `#/components/schemas/${model}` } }
  }
  const responses: Record<string, ResponseObject> = {
    ...errorResponses(errors),
    [statusCode]:
      statusCode === 204
        ? { description: "Excluído; resposta sem corpo" }
        : { description: "Operação concluída", content: { "application/json": { schema } } }
  }
  return { operationId, tags: [resource], security: [{ sessionCookie: [] }], responses }
}

const errorResponses = (errors: number[]): Record<string, ResponseObject> =>
  Object.fromEntries(
    errors.map((code) => [
      code,
      {
        description:
          {
            401: "Sessão inválida",
            404: "Recurso não encontrado",
            409: "Conflito",
            422: "Dados ou regra de negócio inválidos",
            500: "Erro interno"
          }[code] ?? "Erro",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
      }
    ])
  )

export const bookingDetail = (
  operationId: string,
  model: "BookingLink" | "PublicCompanyResponse" | "Availability" | "PublicAppointmentResponse",
  statusCode: 200 | 201,
  authenticated = false
): DocumentDecoration => ({
  operationId,
  tags: ["booking"],
  security: authenticated ? [{ sessionCookie: [] }] : [],
  responses: {
    ...errorResponses(authenticated ? [401, 422, 500] : statusCode === 201 ? [404, 409, 422, 500] : [404, 422, 500]),
    [statusCode]: {
      description: "Operação concluída",
      content: { "application/json": { schema: { $ref: `#/components/schemas/${model}` } } }
    }
  }
})
