export const hasDefinedFields = (body: Record<string, unknown>) =>
  Object.values(body).some((value) => value !== undefined)
