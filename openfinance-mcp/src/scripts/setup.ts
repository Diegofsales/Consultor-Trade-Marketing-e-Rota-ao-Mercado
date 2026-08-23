/**
 * `npm run setup` — configuração assistida.
 *
 * Automatiza tudo o que é automatizável na Fase 0: gera o token do servidor,
 * coleta as credenciais, escreve o .env com permissão restrita e valida na hora.
 *
 * O que este script NÃO faz (e nenhum script pode): logar no seu banco e dar o
 * consentimento do Open Finance. Isso exige a sua autenticação na instituição —
 * é assim por desenho regulatório. Veja "Fronteira de automação" no README.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync, chmodSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

// fileURLToPath, não .pathname: pathname devolve caminho percent-encoded e
// quebra em diretórios com espaço (e no Windows).
const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url))

type Campo = {
  chave: string
  pergunta: string
  ajuda: string
  validar: (v: string) => string | null
}

const CAMPOS: Campo[] = [
  {
    chave: 'PLUGGY_CLIENT_ID',
    pergunta: 'Client ID da Pluggy',
    ajuda: 'dashboard.pluggy.ai → sua Application → Development',
    validar: (v) => (v.length < 8 ? 'parece curto demais para um client_id' : null),
  },
  {
    chave: 'PLUGGY_CLIENT_SECRET',
    pergunta: 'Client Secret da Pluggy',
    ajuda: 'mesma tela do Client ID — este valor é secreto',
    validar: (v) => (v.length < 8 ? 'parece curto demais para um client_secret' : null),
  },
  {
    chave: 'PLUGGY_ITEM_IDS',
    pergunta: 'itemIds (separados por vírgula, um por banco)',
    ajuda: 'gerados na autorização OAuth do MeuPluggy, um por banco conectado',
    validar: (v) =>
      v.split(',').filter((s) => s.trim()).length === 0 ? 'informe ao menos um itemId' : null,
  },
]

async function main(): Promise<void> {
  console.log('\n⚙️  Configuração do openfinance-mcp\n')

  if (existsSync(ENV_PATH)) {
    console.log('⚠️  Já existe um arquivo .env. Este script não vai sobrescrevê-lo.')
    console.log('   Para recomeçar, apague o .env manualmente e rode de novo.\n')
    process.exit(1)
  }

  const valores: Record<string, string> = {}
  const faltando: Campo[] = []

  // Modo não-interativo: valores vindos do ambiente. Permite que um agente
  // (ChatGPT/Codex) rode o setup sem ninguém digitando.
  for (const campo of CAMPOS) {
    const doAmbiente = process.env[campo.chave]?.trim()
    if (doAmbiente && !campo.validar(doAmbiente)) {
      valores[campo.chave] = doAmbiente
    } else {
      faltando.push(campo)
    }
  }

  if (faltando.length > 0) {
    const interativo = stdin.isTTY === true

    if (!interativo) {
      // Sem terminal e sem variáveis: falhar com instrução clara, nunca travar
      // esperando uma entrada que jamais virá.
      console.error('\n❌ Faltam valores e não há terminal interativo.\n')
      console.error('   Forneça as credenciais como variáveis de ambiente:\n')
      for (const c of faltando) console.error(`   ${c.chave}=...   # ${c.ajuda}`)
      console.error('\n   Exemplo:')
      console.error(
        '   PLUGGY_CLIENT_ID=xxx PLUGGY_CLIENT_SECRET=yyy PLUGGY_ITEM_IDS=a,b npm run setup\n',
      )
      process.exit(1)
    }

    const rl = createInterface({ input: stdin, output: stdout })
    try {
      for (const campo of faltando) {
        console.log(`\n   ${campo.ajuda}`)
        let valor = ''
        for (;;) {
          valor = (await rl.question(`   ${campo.pergunta}: `)).trim()
          const erro = campo.validar(valor)
          if (!erro) break
          console.log(`   ⚠️  ${erro}`)
        }
        valores[campo.chave] = valor
      }
    } finally {
      rl.close()
    }
  }

  // Token do servidor: gerado aqui, nunca digitado por humano.
  const token = randomBytes(32).toString('hex')

  const conteudo = [
    '# Gerado por `npm run setup`. NÃO commite este arquivo.',
    `PLUGGY_CLIENT_ID=${valores.PLUGGY_CLIENT_ID}`,
    `PLUGGY_CLIENT_SECRET=${valores.PLUGGY_CLIENT_SECRET}`,
    `PLUGGY_ITEM_IDS=${valores.PLUGGY_ITEM_IDS}`,
    `MCP_PATH_TOKEN=${token}`,
    'PORT=3000',
    'DB_PATH=./data/finance.db',
    'SYNC_CRON=0 7 * * *',
    'TZ=America/Sao_Paulo',
    '',
  ].join('\n')

  writeFileSync(ENV_PATH, conteudo, { encoding: 'utf8', mode: 0o600 })
  chmodSync(ENV_PATH, 0o600) // só o dono lê

  console.log('\n✅ .env criado com permissão 600 (somente você lê).')
  console.log(`   Token do servidor gerado automaticamente (${token.length} caracteres).`)
  console.log('\n   Próximo passo: npm run check\n')
}

main().catch((erro: unknown) => {
  console.error(`\n❌ Falhou: ${erro instanceof Error ? erro.message : String(erro)}\n`)
  process.exit(1)
})
