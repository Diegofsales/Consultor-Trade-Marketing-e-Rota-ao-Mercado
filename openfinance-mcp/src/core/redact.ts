/**
 * Mascaramento de dados sensíveis e sanitização de texto de terceiros.
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

// Classes de caracteres usadas em ataques de injeção modernos, com escapes
// explícitos (nunca caracteres literais invisíveis no fonte):
// ANSI CSI: ESC [ ... cmd — esconde/reescreve texto em terminais e logs.
const ANSI_CSI = /\u001B\[[0-?]*[ -\/]*[@-~]/g
// Controles C0 (tab/quebras viram espaço) e C1.
// eslint-disable-next-line no-control-regex
const CONTROLES = /[\u0000-\u001F\u007F-\u009F]/g
// Zero-width e marcas invisíveis: instruções ilegíveis a humanos, legíveis ao
// tokenizador do modelo. U+200B..200F, U+2060 (word joiner), U+FEFF (BOM).
const INVISIVEIS = /[\u200B-\u200F\u2060\uFEFF]/g
// Overrides bidirecionais (ataque "trojan source"): U+202A..202E, U+2066..2069.
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g
// Tags Unicode (U+E0000..E007F): canal conhecido de instrução oculta.
const TAGS = /[\u{E0000}-\u{E007F}]/gu

/**
 * Sanitização de texto de terceiros (descrições de transação, nomes de
 * estabelecimento). Qualquer pagador/recebedor controla esse texto, e ele será
 * lido por um modelo de IA — é o principal vetor de injeção de prompt deste
 * sistema.
 *
 * Normaliza para NFC e remove as classes acima. Aplicada na NORMALIZAÇÃO —
 * texto malicioso não chega nem ao SQLite, e nenhum caminho de saída depende
 * de alguém lembrar de sanitizar.
 */
export function sanitizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(ANSI_CSI, '')
    .replace(CONTROLES, ' ')
    .replace(INVISIVEIS, '')
    .replace(BIDI, '')
    .replace(TAGS, '')
}

/**
 * Trunca descrições longas — economiza tokens e limita quanto texto de
 * terceiros entra no contexto do modelo. Sempre sanitiza antes.
 * Corta por code point (não por unidade UTF-16), para nunca partir um emoji
 * ao meio e produzir texto inválido.
 */
export function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return ''
  const limpo = sanitizeText(text).replace(/\s+/g, ' ').trim()
  const pontos = [...limpo]
  return pontos.length <= max ? limpo : `${pontos.slice(0, max - 1).join('')}…`
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
