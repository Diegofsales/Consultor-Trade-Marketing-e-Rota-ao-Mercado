import { PluggyClient } from 'pluggy-sdk'
import type {
  ContaCanonica,
  FaturaCartao,
  InvestimentoCanonico,
  Provider,
  StatusConexao,
  TipoConta,
  TransacaoCanonica,
} from './provider.js'
import { toCents } from '../core/money.js'
import { maskNumber, truncate } from '../core/redact.js'
import { CircuitBreaker, retry } from '../util/retry.js'

/**
 * Implementação do Provider usando o SDK oficial da Pluggy (pluggy-sdk).
 *
 * Todos os métodos usados aqui foram verificados contra as definições de tipo
 * do pluggy-sdk 0.90.0: fetchItem, fetchAccounts, fetchTransactions,
 * fetchCreditCardBills, fetchInvestments, fetchConsents.
 */
export class PluggyProvider implements Provider {
  readonly nome = 'pluggy'
  private readonly client: PluggyClient
  private readonly breaker = new CircuitBreaker()

  constructor(clientId: string, clientSecret: string) {
    // O SDK cuida sozinho da renovação da API key (validade ~2h).
    this.client = new PluggyClient({ clientId, clientSecret })
  }

  private chamar<T>(rotulo: string, operacao: () => Promise<T>): Promise<T> {
    return this.breaker.executar(() => retry(operacao, { rotulo }), rotulo)
  }

  async listarStatus(itemIds: readonly string[]): Promise<StatusConexao[]> {
    const resultados: StatusConexao[] = []

    for (const itemId of itemIds) {
      const item = await this.chamar(`fetchItem`, () => this.client.fetchItem(itemId))

      // O consentimento do Open Finance expira e precisa ser renovado pelo
      // titular no app do banco. Monitoramos para avisar antes de quebrar.
      let expiraEm: string | null = null
      let diasRestantes: number | null = null
      try {
        const consents = await this.chamar(`fetchConsents`, () =>
          this.client.fetchConsents(itemId),
        )
        const ativo = consents.results.find((c) => !c.revokedAt && c.expiresAt)
        if (ativo?.expiresAt) {
          const data = new Date(ativo.expiresAt)
          expiraEm = data.toISOString().slice(0, 10)
          diasRestantes = Math.ceil((data.getTime() - Date.now()) / 86_400_000)
        }
      } catch {
        // Conector de acesso direto (não-Open Finance) não tem consentimento.
        // Ausência não é erro — seguimos sem essa informação.
      }

      resultados.push({
        itemId,
        instituicao: item.connector?.name ?? 'desconhecida',
        situacao: item.status ?? 'DESCONHECIDO',
        ultimaAtualizacao: item.lastUpdatedAt ? new Date(item.lastUpdatedAt).toISOString() : null,
        consentimentoExpiraEm: expiraEm,
        consentimentoDiasRestantes: diasRestantes,
      })
    }

    return resultados
  }

  async listarContas(itemIds: readonly string[]): Promise<ContaCanonica[]> {
    const contas: ContaCanonica[] = []

    for (const itemId of itemIds) {
      const item = await this.chamar(`fetchItem`, () => this.client.fetchItem(itemId))
      const instituicao = item.connector?.name ?? 'desconhecida'

      const página = await this.chamar(`fetchAccounts`, () => this.client.fetchAccounts(itemId))

      for (const c of página.results) {
        const tipo = mapearTipo(c.subtype)
        const conta: ContaCanonica = {
          id: c.id,
          itemId,
          apelido: truncate(c.marketingName ?? c.name, 40),
          tipo,
          instituicao,
          // Mascarado JÁ NA ENTRADA: o número completo não é persistido.
          numeroMascarado: maskNumber(c.number),
          saldoCents: toCents(c.balance),
          moeda: c.currencyCode ?? 'BRL',
        }

        if (c.creditData) {
          conta.limiteCents = toCents(c.creditData.creditLimit)
          if (c.creditData.balanceDueDate) {
            conta.vencimentoFatura = new Date(c.creditData.balanceDueDate)
              .toISOString()
              .slice(0, 10)
          }
        }

        contas.push(conta)
      }
    }

    return contas
  }

  async listarTransacoes(contaId: string, de: string, ate: string): Promise<TransacaoCanonica[]> {
    const transacoes: TransacaoCanonica[] = []
    let page = 1
    let totalPaginas = 1

    // Paginamos até o fim: o sync roda 1x/dia, então vale buscar tudo do período
    // uma vez e responder do cache local depois.
    do {
      const resposta = await this.chamar(`fetchTransactions`, () =>
        this.client.fetchTransactions(contaId, { from: de, to: ate, page, pageSize: 500 }),
      )
      totalPaginas = resposta.totalPages ?? 1

      for (const t of resposta.results) {
        const transacao: TransacaoCanonica = {
          id: t.id,
          contaId,
          data: new Date(t.date).toISOString().slice(0, 10),
          descricao: truncate(t.description, 120),
          valorCents: toCents(t.amount),
          categoria: t.category ?? null,
          estabelecimento: t.merchant?.name ? truncate(t.merchant.name, 60) : null,
        }

        // Boleto JÁ PAGO — a API não expõe boletos a vencer (DDA).
        const bm = t.paymentData?.boletoMetadata
        if (bm) {
          transacao.boleto = {
            jurosCents: toCents(bm.interestAmount),
            multaCents: toCents(bm.penaltyAmount),
            descontoCents: toCents(bm.discountAmount),
          }
        }

        transacoes.push(transacao)
      }
      page++
    } while (page <= totalPaginas)

    return transacoes
  }

  async listarFaturas(contaId: string): Promise<FaturaCartao[]> {
    const resposta = await this.chamar(`fetchCreditCardBills`, () =>
      this.client.fetchCreditCardBills(contaId),
    )

    return resposta.results.map((b) => ({
      id: b.id,
      contaId,
      vencimento: b.dueDate ? new Date(b.dueDate).toISOString().slice(0, 10) : '',
      fechamento: null,
      totalCents: toCents(b.totalAmount),
      minimoCents: b.minimumPaymentAmount != null ? toCents(b.minimumPaymentAmount) : null,
      paga: Boolean(b.allowsInstallments === false && b.totalAmount === 0),
    }))
  }

  async listarInvestimentos(itemIds: readonly string[]): Promise<InvestimentoCanonico[]> {
    const investimentos: InvestimentoCanonico[] = []

    for (const itemId of itemIds) {
      const resposta = await this.chamar(`fetchInvestments`, () =>
        this.client.fetchInvestments(itemId),
      )
      for (const i of resposta.results) {
        investimentos.push({
          id: i.id,
          itemId,
          nome: truncate(i.name, 60),
          tipo: i.type ?? 'OUTRO',
          saldoCents: toCents(i.balance),
          rentabilidade: i.annualRate ?? null,
        })
      }
    }

    return investimentos
  }
}

function mapearTipo(subtype: string | null | undefined): TipoConta {
  switch (subtype) {
    case 'CREDIT_CARD':
      return 'CARTAO_CREDITO'
    case 'SAVINGS_ACCOUNT':
      return 'POUPANCA'
    default:
      return 'CORRENTE'
  }
}
