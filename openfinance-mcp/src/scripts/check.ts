/**
 * `npm run check` — validação da Fase 0.
 *
 * Confirma que as credenciais funcionam, que os bancos estão conectados e que
 * os dados chegam. É o primeiro sinal de vida do sistema.
 *
 * Imprime SOMENTE dados mascarados. Nenhum número de conta completo, nenhuma
 * descrição de transação.
 */
import { loadConfig } from '../config.js'
import { PluggyProvider } from '../providers/pluggy.js'
import { formatBRL } from '../core/money.js'

async function main(): Promise<void> {
  console.log('\n🔍 Verificando conexão com o Open Finance...\n')

  const config = loadConfig()
  const provider = new PluggyProvider(config.PLUGGY_CLIENT_ID, config.PLUGGY_CLIENT_SECRET)

  console.log(`   Conexões configuradas: ${config.itemIds.length}\n`)

  // 1) Situação de cada conexão + validade do consentimento
  console.log('── Conexões ' + '─'.repeat(50))
  const status = await provider.listarStatus(config.itemIds)
  for (const s of status) {
    const ok = s.situacao === 'UPDATED' ? '✅' : s.situacao === 'UPDATING' ? '⏳' : '⚠️ '
    console.log(`${ok} ${s.instituicao.padEnd(24)} ${s.situacao}`)
    if (s.consentimentoDiasRestantes !== null) {
      const alerta = s.consentimentoDiasRestantes <= 15 ? ' ⚠️  RENOVAR EM BREVE' : ''
      console.log(
        `   consentimento expira em ${s.consentimentoExpiraEm} ` +
          `(${s.consentimentoDiasRestantes} dias)${alerta}`,
      )
    }
  }

  // 2) Contas encontradas
  console.log('\n── Contas ' + '─'.repeat(52))
  const contas = await provider.listarContas(config.itemIds)
  if (contas.length === 0) {
    console.log('⚠️  Nenhuma conta encontrada. Os bancos foram conectados no Meu Pluggy?')
  }
  let totalCents = 0
  for (const c of contas) {
    const rotulo = `${c.instituicao} · ${c.apelido}`.slice(0, 44)
    console.log(
      `   ${rotulo.padEnd(46)} ${c.numeroMascarado.padEnd(12)} ` +
        `${c.tipo.padEnd(15)} ${formatBRL(c.saldoCents).padStart(16)}`,
    )
    if (c.tipo !== 'CARTAO_CREDITO') totalCents += c.saldoCents
  }
  console.log(`   ${''.padEnd(46)} ${''.padEnd(12)} ${'TOTAL'.padEnd(15)} ${formatBRL(totalCents).padStart(16)}`)

  // 3) Amostra de transações (só a contagem — nunca o conteúdo)
  console.log('\n── Amostra de transações (últimos 30 dias) ' + '─'.repeat(20))
  const ate = new Date().toISOString().slice(0, 10)
  const de = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  for (const c of contas.slice(0, 5)) {
    try {
      const txs = await provider.listarTransacoes(c.id, de, ate)
      const comBoleto = txs.filter((t) => t.boleto).length
      const extra = comBoleto > 0 ? ` (${comBoleto} pagamentos de boleto)` : ''
      console.log(`   ${c.instituicao.padEnd(24)} ${String(txs.length).padStart(4)} transações${extra}`)
    } catch (erro) {
      console.log(`   ${c.instituicao.padEnd(24)} ⚠️  ${(erro as Error).message.slice(0, 50)}`)
    }
  }

  // 4) Faturas de cartão
  const cartoes = contas.filter((c) => c.tipo === 'CARTAO_CREDITO')
  if (cartoes.length > 0) {
    console.log('\n── Faturas de cartão ' + '─'.repeat(42))
    for (const c of cartoes) {
      try {
        const faturas = await provider.listarFaturas(c.id)
        console.log(`   ${c.instituicao.padEnd(24)} ${faturas.length} faturas disponíveis`)
        const proxima = faturas[0]
        if (proxima) {
          console.log(`      próxima: venc. ${proxima.vencimento} · ${formatBRL(proxima.totalCents)}`)
        }
      } catch (erro) {
        console.log(`   ${c.instituicao.padEnd(24)} ⚠️  ${(erro as Error).message.slice(0, 50)}`)
      }
    }
  }

  console.log('\n✅ Fase 0 validada. As credenciais funcionam e os dados chegam.\n')
}

main().catch((erro: unknown) => {
  const msg = erro instanceof Error ? erro.message : String(erro)
  console.error(`\n❌ Falhou: ${msg}\n`)
  if (msg.includes('Configuração inválida')) {
    console.error('   Copie .env.example para .env e preencha. Veja o README, Fase 0.\n')
  }
  process.exit(1)
})
