/**
 * Contrato de um provedor de dados bancários.
 *
 * SEGURANÇA POR CONSTRUÇÃO: esta interface declara APENAS leitura. Não existe
 * método de transferência, pagamento ou alteração cadastral — logo, não existe
 * caminho no código capaz de movimentar dinheiro, nem por engano, nem se um
 * modelo de IA for induzido a tentar.
 *
 * Trocar de agregador (Pluggy -> Belvo, Klavi...) significa escrever outra
 * implementação desta interface. Nada mais no sistema precisa mudar.
 */

export type TipoConta = 'CORRENTE' | 'POUPANCA' | 'CARTAO_CREDITO'

export type ContaCanonica = {
  id: string
  itemId: string
  apelido: string
  tipo: TipoConta
  instituicao: string
  /** Já mascarado: "•••• 1234". O número completo nunca chega ao disco. */
  numeroMascarado: string
  saldoCents: number
  moeda: string
  /** Só para cartão de crédito. */
  limiteCents?: number
  vencimentoFatura?: string
}

export type TransacaoCanonica = {
  id: string
  contaId: string
  data: string
  descricao: string
  /** Negativo = saída. SEMPRE inteiro em centavos. */
  valorCents: number
  categoria: string | null
  estabelecimento: string | null
  /**
   * Presente quando a transação foi o pagamento de um boleto.
   * Atenção: são boletos JÁ PAGOS. O Open Finance não expõe boletos a vencer
   * (DDA) — veja a seção "Boletos e DDA" no README.
   */
  boleto?: {
    jurosCents: number
    multaCents: number
    descontoCents: number
  }
}

export type FaturaCartao = {
  id: string
  contaId: string
  vencimento: string
  fechamento: string | null
  totalCents: number
  minimoCents: number | null
  paga: boolean
}

export type InvestimentoCanonico = {
  id: string
  itemId: string
  nome: string
  tipo: string
  saldoCents: number
  rentabilidade: number | null
}

export type StatusConexao = {
  itemId: string
  instituicao: string
  situacao: string
  ultimaAtualizacao: string | null
  /** Data de expiração do consentimento do Open Finance, se disponível. */
  consentimentoExpiraEm: string | null
  /** Dias restantes até o consentimento vencer. Negativo = já venceu. */
  consentimentoDiasRestantes: number | null
}

export interface Provider {
  readonly nome: string
  listarStatus(itemIds: readonly string[]): Promise<StatusConexao[]>
  listarContas(itemIds: readonly string[]): Promise<ContaCanonica[]>
  listarTransacoes(contaId: string, de: string, ate: string): Promise<TransacaoCanonica[]>
  listarFaturas(contaId: string): Promise<FaturaCartao[]>
  listarInvestimentos(itemIds: readonly string[]): Promise<InvestimentoCanonico[]>
}
