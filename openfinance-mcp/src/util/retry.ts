import { log } from './logger.js'

export class TimeoutError extends Error {
  override readonly name = 'TimeoutError'
}

/** Aborta a operação se ela passar de `ms`. Evita que o cliente de IA fique pendurado. */
export async function withTimeout<T>(
  operacao: () => Promise<T>,
  ms: number,
  rotulo: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${rotulo}: timeout após ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([operacao(), limite])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Repete uma LEITURA que falhou, com espera crescente (500ms, 2s).
 *
 * Só use em operações idempotentes (GET). Nunca em algo que altere estado —
 * repetir uma escrita pode duplicar o efeito.
 */
export async function retry<T>(
  operacao: () => Promise<T>,
  opcoes: { tentativas?: number; rotulo: string; timeoutMs?: number } = { rotulo: 'operacao' },
): Promise<T> {
  const tentativas = opcoes.tentativas ?? 3
  const timeoutMs = opcoes.timeoutMs ?? 15_000
  const esperas = [500, 2_000]

  let ultimoErro: unknown
  for (let i = 0; i < tentativas; i++) {
    try {
      return await withTimeout(operacao, timeoutMs, opcoes.rotulo)
    } catch (erro) {
      ultimoErro = erro
      const ultima = i === tentativas - 1
      if (ultima) break
      const espera = esperas[i] ?? 2_000
      log.warn('tentativa falhou, repetindo', {
        op: opcoes.rotulo,
        attempt: i + 1,
        ms: espera,
        status: 'erro',
      })
      await new Promise((r) => setTimeout(r, espera))
    }
  }
  throw ultimoErro
}

/**
 * Circuit breaker: após `limite` falhas seguidas, para de tentar por `pausaMs`.
 *
 * Serve para não martelar uma API que já está fora do ar — e para responder
 * rápido com o cache local em vez de esperar timeout a cada chamada.
 */
export class CircuitBreaker {
  private falhas = 0
  private abertoAte = 0

  constructor(
    private readonly limite = 3,
    private readonly pausaMs = 60_000,
  ) {}

  get aberto(): boolean {
    return Date.now() < this.abertoAte
  }

  registrarSucesso(): void {
    this.falhas = 0
    this.abertoAte = 0
  }

  registrarFalha(): void {
    this.falhas++
    if (this.falhas >= this.limite) {
      this.abertoAte = Date.now() + this.pausaMs
      log.warn('circuito aberto: pausando chamadas externas', {
        op: 'breaker',
        count: this.falhas,
        ms: this.pausaMs,
      })
    }
  }

  async executar<T>(operacao: () => Promise<T>, rotulo: string): Promise<T> {
    if (this.aberto) {
      throw new Error(`PROVIDER_INDISPONIVEL: circuito aberto para ${rotulo}`)
    }
    try {
      const r = await operacao()
      this.registrarSucesso()
      return r
    } catch (erro) {
      this.registrarFalha()
      throw erro
    }
  }
}
