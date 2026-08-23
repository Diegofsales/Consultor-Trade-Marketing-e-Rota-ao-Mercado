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
    let cursor: string | undefined

    // Paginação por CURSOR, não por número de página: se uma transação entra
    // enquanto percorremos as páginas, a numeração desloca e uma transação pode
    // ser pulada ou duplicada. Cursor é estável — em dado financeiro isso não é
    // detalhe. (fetchTransactions por página está deprecated no SDK.)
    do {
      const resposta = await this.chamar(`fetchTransactionsCursor`, () =>
        this.client.fetchTransactionsCursor(contaId, {
          dateFrom: de,
          dateTo: ate,
          ...(cursor ? { after: cursor } : {}),
        }),
      )
      cursor = resposta.next ?? undefined

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
    } while (cursor)

    return transacoes
  }

  async listarFaturas(contaId: string): Promise<FaturaCartao[]> {
    const resposta = await this.chamar(`fetchCreditCardBills`, () =>
      this.client.fetchCreditCardBills(contaId),
    )

    return resposta.results
      .map((b) => {
        // "Paga" é DERIVADA dos pagamentos registrados na fatura, nunca
        // inferida de heurística: soma dos payments >= total da fatura.
        const pagoCents = b.payments?.reduce((soma, p) => soma + toCents(p.amount), 0) ?? 0
        const totalCents = toCents(b.totalAmount)
        return {
          id: b.id,
          contaId,
          vencimento: b.dueDate ? new Date(b.dueDate).toISOString().slice(0, 10) : '',
          fechamento: b.billClosingDate
            ? new Date(b.billClosingDate).toISOString().slice(0, 10)
            : null,
          totalCents,
          minimoCents: b.minimumPaymentAmount != null ? toCents(b.minimumPaymentAmount) : null,
          paga: totalCents > 0 && pagoCents >= totalCents,
        }
      })
      // Mais recente primeiro, por contrato — quem consome não deve depender
      // da ordem que a API escolher devolver.
      .sort((a, b) => b.vencimento.localeCompare(a.vencimento))
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
