/**
 * Dinheiro SEMPRE em centavos inteiros.
 *
 * Motivo: números decimais em ponto flutuante não representam centavos com
 * exatidão (0.1 + 0.2 !== 0.3). Somando milhares de transações, o erro aparece
 * no total. Convertemos para inteiro na borda de entrada e nunca mais voltamos
 * para float — toda soma acontece em centavos.
 */

/** Converte um valor decimal vindo da API (ex.: 1234.56) para centavos (123456). */
export function toCents(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

/** Formata centavos como moeda brasileira: 123456 -> "R$ 1.234,56" */
export function formatBRL(cents: number): string {
  const negativo = cents < 0
  const abs = Math.abs(Math.trunc(cents))
  const reais = Math.trunc(abs / 100)
  const centavos = abs % 100

  const reaisFormatado = reais.toLocaleString('pt-BR')
  const centavosFormatado = String(centavos).padStart(2, '0')

  return `${negativo ? '-' : ''}R$ ${reaisFormatado},${centavosFormatado}`
}

/** Soma segura de uma lista de valores em centavos. */
export function sumCents(values: readonly number[]): number {
  let total = 0
  for (const v of values) total += Math.trunc(v)
  return total
}

/** Percentual de `part` sobre `whole`, com 1 casa decimal. Retorna 0 se whole = 0. */
export function pctOf(part: number, whole: number): number {
  if (whole === 0) return 0
  return Math.round((Math.abs(part) / Math.abs(whole)) * 1000) / 10
}
