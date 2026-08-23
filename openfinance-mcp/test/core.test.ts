import { describe, expect, it } from 'vitest'
import { formatBRL, pctOf, sumCents, toCents } from '../src/core/money.js'
import { maskNumber, maskSecret, truncate } from '../src/core/redact.js'
import { loadConfig, resetConfigCache } from '../src/config.js'

describe('money — dinheiro em centavos inteiros', () => {
  it('converte decimais da API para centavos', () => {
    expect(toCents(1234.56)).toBe(123456)
    expect(toCents(-89.9)).toBe(-8990)
    expect(toCents(0)).toBe(0)
  })

  it('trata valores ausentes ou inválidos como zero', () => {
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
    expect(toCents(Number.NaN)).toBe(0)
  })

  it('não perde centavos onde o float perderia', () => {
    // 0.1 + 0.2 !== 0.3 em ponto flutuante. Em centavos, é exato.
    expect(sumCents([toCents(0.1), toCents(0.2)])).toBe(toCents(0.3))
  })

  it('soma milhares de transações sem desvio', () => {
    // 10.000 x R$ 19,99 = R$ 199.900,00 = 19.990.000 centavos, exato.
    const valores = Array.from({ length: 10_000 }, () => toCents(19.99))
    expect(sumCents(valores)).toBe(19_990_000)
    expect(formatBRL(sumCents(valores))).toBe('R$ 199.900,00')
  })

  it('formata no padrão brasileiro', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
    expect(formatBRL(-8990)).toBe('-R$ 89,90')
    expect(formatBRL(5)).toBe('R$ 0,05')
    expect(formatBRL(0)).toBe('R$ 0,00')
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00')
  })

  it('calcula percentual com 1 casa e sem dividir por zero', () => {
    expect(pctOf(2500, 10000)).toBe(25)
    expect(pctOf(-2130, -8412)).toBe(25.3)
    expect(pctOf(100, 0)).toBe(0)
  })
})

describe('redact — nada sensível sai do servidor', () => {
  it('mostra apenas os 4 últimos dígitos', () => {
    expect(maskNumber('123456789')).toBe('•••• 6789')
    expect(maskNumber('1234-5678')).toBe('•••• 5678')
  })

  it('não vaza nada quando a entrada é curta ou vazia', () => {
    expect(maskNumber('12')).toBe('••••')
    expect(maskNumber('')).toBe('••••')
    expect(maskNumber(null)).toBe('••••')
  })

  it('trunca descrições longas e normaliza espaços', () => {
    expect(truncate('  pagamento    boleto  ', 60)).toBe('pagamento boleto')
    const longa = 'x'.repeat(100)
    expect(truncate(longa, 20)).toHaveLength(20)
    expect(truncate(longa, 20).endsWith('…')).toBe(true)
  })

  it('mascara segredos em log', () => {
    expect(maskSecret('abcd1234efgh')).toBe('abcd••••')
    expect(maskSecret('ab')).toBe('••••')
  })
})

describe('config — falha cedo se faltar credencial', () => {
  const validEnv = {
    PLUGGY_CLIENT_ID: 'id-teste',
    PLUGGY_CLIENT_SECRET: 'secret-teste',
    PLUGGY_ITEM_IDS: 'item-1, item-2 ,',
  }

  it('aceita config válida e limpa a lista de itemIds', () => {
    resetConfigCache()
    const c = loadConfig(validEnv as NodeJS.ProcessEnv)
    expect(c.itemIds).toEqual(['item-1', 'item-2'])
    expect(c.PORT).toBe(3000)
    expect(c.TZ).toBe('America/Sao_Paulo')
  })

  it('recusa subir sem client secret', () => {
    resetConfigCache()
    const semSecret = { ...validEnv, PLUGGY_CLIENT_SECRET: '' }
    expect(() => loadConfig(semSecret as NodeJS.ProcessEnv)).toThrow(/Configuração inválida/)
  })

  it('recusa token de caminho fraco', () => {
    resetConfigCache()
    const tokenCurto = { ...validEnv, MCP_PATH_TOKEN: 'curto-demais' }
    expect(() => loadConfig(tokenCurto as NodeJS.ProcessEnv)).toThrow(/48 caracteres/)
  })
})
