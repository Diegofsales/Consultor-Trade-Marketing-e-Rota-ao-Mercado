import { z } from 'zod'

/**
 * Configuração do servidor, validada na inicialização.
 * Se algo obrigatório faltar, o processo NÃO sobe — falhamos cedo e alto,
 * em vez de descobrir a credencial faltando no meio de uma consulta.
 */
const schema = z.object({
  PLUGGY_CLIENT_ID: z.string().min(1, 'PLUGGY_CLIENT_ID ausente (veja o README, Fase 0)'),
  PLUGGY_CLIENT_SECRET: z.string().min(1, 'PLUGGY_CLIENT_SECRET ausente (veja o README, Fase 0)'),
  PLUGGY_ITEM_IDS: z
    .string()
    .min(1, 'PLUGGY_ITEM_IDS ausente — conecte ao menos um banco (veja o README, Fase 0)'),
  MCP_PATH_TOKEN: z.string().min(48, 'MCP_PATH_TOKEN deve ter >= 48 caracteres').optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().default('./data/finance.db'),
  SYNC_CRON: z.string().default('0 7 * * *'),
  TZ: z.string().default('America/Sao_Paulo'),
})

export type Config = Omit<z.infer<typeof schema>, 'PLUGGY_ITEM_IDS'> & {
  /** itemIds já divididos e limpos. Um itemId = uma conexão com um banco. */
  itemIds: string[]
}

let cached: Config | null = null

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached

  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const problemas = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Configuração inválida:\n${problemas.join('\n')}`)
  }

  const { PLUGGY_ITEM_IDS, ...resto } = parsed.data
  const itemIds = PLUGGY_ITEM_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (itemIds.length === 0) {
    throw new Error('Configuração inválida: PLUGGY_ITEM_IDS não contém nenhum id válido.')
  }

  cached = { ...resto, itemIds }
  return cached
}

/** Só para testes: descarta a config memorizada. */
export function resetConfigCache(): void {
  cached = null
}
