/**
 * Mascaramento de dados sensíveis.
 *
 * Regra do projeto: número completo de conta/cartão NUNCA é gravado no banco
 * local nem devolvido ao modelo de IA. Mascaramos na normalização — ou seja,
 * na entrada — de modo que o dado completo sequer chega ao disco.
 */

/** "12345678" -> "•••• 5678". Entrada vazia/curta vira "••••". */
export function maskNumber(value: string | null | undefined): string {
  if (!value) return '••••'
  const apenasDigitos = value.replace(/\D/g, '')
  if (apenasDigitos.length < 4) return '••••'
  return `•••• ${apenasDigitos.slice(-4)}`
}

/** Trunca descrições longas — economiza tokens e evita despejar texto de terceiros. */
export function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return ''
  const limpo = text.replace(/\s+/g, ' ').trim()
  return limpo.length <= max ? limpo : `${limpo.slice(0, max - 1)}…`
}

/**
 * Mascara um segredo para aparecer em log: mostra só os 4 primeiros caracteres.
 * Usado para o token de caminho e para o client_id — nunca para o client_secret,
 * que jamais deve ser logado, nem parcialmente.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return '(vazio)'
  if (value.length <= 4) return '••••'
  return `${value.slice(0, 4)}••••`
}
