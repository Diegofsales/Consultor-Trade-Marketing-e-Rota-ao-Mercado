/**
 * Log estruturado SEM dados pessoais.
 *
 * Proibido logar: descrição de transação, valores, nome de estabelecimento,
 * número de conta, nome do titular, CPF/CNPJ. Logamos apenas o que é preciso
 * para diagnosticar: o que rodou, quanto demorou, deu certo ou não.
 */

type Nivel = 'info' | 'warn' | 'error'

/** Campos permitidos em log. Qualquer coisa fora disso não entra. */
export type LogFields = {
  op?: string
  ms?: number
  status?: 'ok' | 'erro' | 'stale'
  code?: string
  count?: number
  attempt?: number
}

function emit(nivel: Nivel, msg: string, fields: LogFields = {}): void {
  const linha = JSON.stringify({ t: new Date().toISOString(), nivel, msg, ...fields })
  // stderr: em transporte stdio, stdout é o canal do protocolo MCP e não pode
  // receber nada além das mensagens do protocolo.
  process.stderr.write(`${linha}\n`)
}

export const log = {
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
}
