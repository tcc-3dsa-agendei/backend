import { app } from "@/app"
import { env } from "@/env"

app.listen(env.PORT, ({ url }) => {
  console.log(`Servidor iniciado: ${url.origin}`)
  console.log(`Documentação da API: ${url.origin}/docs`)
})
