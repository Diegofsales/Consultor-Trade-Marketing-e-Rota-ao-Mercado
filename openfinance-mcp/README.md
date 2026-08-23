# openfinance-mcp

Servidor MCP **somente leitura** que conecta os dados bancários do Open Finance Brasil a assistentes de IA (ChatGPT e Hermes).

> **Estado atual:** Fase 1 (fundação) implementada e testada. Falta você executar a **Fase 0** abaixo — obter as credenciais — para o sistema ganhar vida.

---

## Fronteira de automação — o que um agente pode fazer por você

Objetivo do projeto: **nada de trabalho manual, exceto o que é impossível automatizar.** Onde essa linha cai:

| Etapa | Automatizável? | Por quê |
|---|---|---|
| Conectar bancos no Meu Pluggy | ❌ **Não** | Exige você se autenticar no **seu banco**, com senha e MFA. É um ato de consentimento legal do titular. |
| Autorização OAuth por banco | ❌ **Não** | Mesmo motivo: o fluxo termina numa tela do banco que só você pode aprovar. |
| Criar conta no Dashboard Pluggy | ⚠️ Parcial | Aceite de termos e verificação de e-mail estão atrelados à sua identidade. |
| Escrever o `.env` e gerar o token | ✅ **Sim** | `npm run setup` — inclusive em modo não-interativo. |
| Validar credenciais e conexões | ✅ **Sim** | `npm run check`. |
| Instalar, compilar, testar | ✅ **Sim** | `npm install && npm test`. |
| Provisionar o servidor e publicar | ✅ **Sim** | Script de provisionamento na Fase 5 (roda via SSH). |
| Comprar o VPS | ❌ **Não** | Pagamento com seu cartão. |
| Ligar o conector no ChatGPT | ❌ **Não** | Duas telas na interface do ChatGPT, ~2 minutos. |

**Por que os "não" são irredutíveis:** o Open Finance foi desenhado para que **só o titular** autorize o compartilhamento, autenticando-se na própria instituição. Qualquer ferramenta que "automatizasse" isso precisaria da senha do seu banco — exatamente o que este projeto existe para evitar. Não é limitação de engenharia; é a garantia de segurança funcionando.

**Saldo prático:** ~15 minutos de cliques seus, uma única vez. Todo o resto é script.

---

## Fase 0 — Obter acesso aos seus dados (≈ 15 minutos de cliques)

Os Passos 1 a 3 abaixo são os irredutíveis da tabela acima: envolvem sua identidade e seu login bancário. Em nenhum momento eu — ou o ChatGPT — devemos ver a senha do seu banco.

### Passo 1 — Conectar seus bancos no Meu Pluggy

1. Acesse **https://meu.pluggy.ai** e crie sua conta.
2. Clique no botão de conectar, procure cada banco e autorize via Open Finance.
3. Repita para: **Itaú, Nubank, Santander, BTG, Sicredi, Stone**.

> O Meu Pluggy é o caminho **gratuito** para uso pessoal. O plano comercial da Pluggy começa em outra faixa de preço — não é o que usaremos.

**Sobre a autorização:** você será levado ao app/site do seu próprio banco para consentir. Suas senhas ficam com o banco — nem o Meu Pluggy, nem este projeto, nem eu temos acesso a elas. O consentimento é revogável a qualquer momento no app do banco.

### Passo 2 — Criar a conta de desenvolvedor

1. Acesse **https://dashboard.pluggy.ai** e registre-se.
2. Nas configurações de conectores, **adicione o conector "MeuPluggy"** à sua lista.
3. Na página da sua Application, crie uma **Development Application**.
4. Anote o `client_id` e o `client_secret` gerados.

### Sobre o "trial de 15 dias" — leia antes de se assustar

Ao criar a conta no Dashboard, aparece um **trial de 15 dias**. Ele **não se aplica ao nosso caso**. O que separa grátis de pago na Pluggy não é o tempo, é **de quem são os dados**:

| Uso | Situação após os 15 dias |
|---|---|
| **Seus próprios dados** (nosso caso), via conector MeuPluggy | 🟢 Continua funcionando, sem custo |
| **Dados de clientes seus** (app comercial) | 🔴 Conexões pausam até ativar um plano pago |

O próprio README oficial do Meu Pluggy diz, literalmente:

> *"you will begin a 15 days trial (Don't worry you will be able to pull information after expires anyway)"*

E descreve o Meu Pluggy como *"a **free** consumer application"*.

**Ainda assim, confira uma coisa no painel** (leva 30 segundos): garanta que o conector que você adicionou é o **MeuPluggy** (também chamado de **Connector 200**) e não um conector direto do banco. É esse conector que carrega a gratuidade — ele reaproveita a conexão que já existe na sua conta do Meu Pluggy, em vez de abrir uma conexão comercial nova.

**Fio de alarme:** se em algum momento o painel exigir cartão de crédito para continuar puxando dados, pare e me avise. Trocar de agregador significa reescrever **um único arquivo** (`src/providers/pluggy.ts`) — todo o resto do sistema conversa com a interface `Provider`, não com a Pluggy.

### Passo 3 — Autorizar via OAuth (uma vez por banco)

1. Abra a Demo Application do Dashboard.
2. Use a autorização OAuth do **MeuPluggy** para vincular sua conta.
3. **Repita uma vez para cada banco conectado** (por banco, não por conta).
4. Anote o `itemId` gerado em cada autorização — serão 6, um por banco.

### Passo 4 — Configurar (automatizado)

Não edite arquivo nenhum à mão. Rode:

```bash
cd openfinance-mcp
npm install
npm run setup
```

O script pede as três credenciais, **gera o token do servidor sozinho** (32 bytes aleatórios), escreve o `.env` com permissão `600` (só você lê) e confere se cada valor tem cara de válido.

**Para um agente rodar sem interação** (ChatGPT/Codex, script de deploy):

```bash
PLUGGY_CLIENT_ID=xxx PLUGGY_CLIENT_SECRET=yyy PLUGGY_ITEM_IDS=a,b npm run setup
```

Sem terminal interativo e sem essas variáveis, o script **falha com instrução clara** em vez de travar esperando digitação.

### Passo 5 — Validar

```bash
npm install
npm run check
```

Saída esperada — situação das conexões, contas mascaradas, saldos, contagem de transações e faturas de cartão:

```
── Conexões ──────────────────────────────
✅ Itaú                     UPDATED
   consentimento expira em 2027-02-14 (175 dias)
✅ Nubank                   UPDATED

── Contas ────────────────────────────────
   Itaú · Conta Corrente        •••• 1234   CORRENTE          R$ 12.480,33
   Nubank · Cartão              •••• 5678   CARTAO_CREDITO    -R$ 3.201,90
```

✅ **Fase 0 concluída** quando `npm run check` roda sem erro e mostra seus bancos.

---

## Boletos e DDA — o que é possível e o que não é

Você pediu boletos DDA na primeira versão. Verifiquei diretamente no SDK oficial (`pluggy-sdk` 0.90.0) e a conclusão é definitiva:

| O que | Disponível? | Como |
|---|---|---|
| Boletos **já pagos**, com juros, multa e desconto | ✅ Sim | Vêm como transação, em `paymentData.boletoMetadata`. Já implementado no provider. |
| Faturas de **cartão de crédito** (valor, vencimento, mínimo) | ✅ Sim | `fetchCreditCardBills`. Já implementado. |
| **DDA** — boletos a vencer, ainda não pagos | ❌ **Não** | Não existe no Open Finance Brasil nem no SDK. |

**Por que o DDA não está disponível:** o DDA é um serviço da Febraban/CIP, e **não faz parte do escopo de dados que o Open Finance Brasil compartilha**. A regulação cobre extrato, cartão e operações de crédito — boletos a vencer ficaram de fora. Não é limitação da Pluggy: nenhum agregador entrega isso via Open Finance.

**Alternativas reais, se o DDA for essencial:**
1. **Provedor especializado** (ex.: TecnoSpeed PlugBank) que acessa o DDA por outro canal — é integração paga e separada. Fica como decisão de v2.
2. **Derivar da fatura do cartão + transações recorrentes** — conseguimos prever contas fixas que se repetem todo mês. Cobre boa parte da necessidade prática ("o que vou pagar este mês") sem o DDA.

Recomendo a opção 2 na v1 e revisitar a 1 quando o resto estiver no ar.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run check` | Valida credenciais e conexões (Fase 0) |
| `npm test` | Roda os testes |
| `npm run typecheck` | Verifica tipos sem gerar build |
| `npm run build` | Compila para `dist/` |
| `npm run wipe` | **Apaga** todo o banco de dados local |

---

## Segurança

- **Somente leitura por construção.** A interface `Provider` (`src/providers/provider.ts`) declara apenas métodos de leitura. Não existe caminho no código capaz de movimentar dinheiro.
- **Mascaramento na entrada.** Números de conta são reduzidos a `•••• 1234` antes de serem gravados — o número completo nunca toca o disco.
- **Dinheiro em centavos inteiros.** Nunca `float`, para não acumular erro de arredondamento em somas.
- **Logs sem dados pessoais.** Nunca registramos descrição, valor, estabelecimento ou número de conta.
- **Segredos só em `.env`**, que está no `.gitignore` — junto com `data/` e qualquer `*.db`.
- **Descrições de transação são texto de terceiros — e são sanitizadas na entrada.** Qualquer pessoa que te envia um Pix ou emite um boleto escolhe o texto que aparece no seu extrato; esse texto será lido por um modelo de IA, o que o torna o principal vetor de injeção de prompt do sistema. `sanitizeText` remove, antes de qualquer gravação: caracteres de controle e sequências ANSI, caracteres invisíveis (zero-width), overrides bidirecionais ("trojan source") e tags Unicode — cada classe coberta por teste com um ataque real. Além disso, tudo volta como *dado* dentro de JSON, truncado, nunca concatenado em instruções.

### Conectando o Hermes com segurança

O Hermes executa comandos de shell e se automodifica — é o cliente mais exposto a injeção. Regras:

1. **Sempre no modo remoto** (URL HTTPS), nunca stdio na mesma máquina do servidor — em stdio, o Hermes alcança o `.env` e a credencial-mestre da Pluggy.
2. **Mantenha o modo de aprovação de comandos shell ativo** no Hermes. Não rode como root.
3. **Regra de ouro operacional:** se uma resposta baseada em dados bancários "sugerir" uma ação (instalar algo, acessar uma URL, transferir dinheiro), trate como ataque — instrução legítima nunca vem de dentro de uma descrição de transação.
- **LGPD.** Os dados ficam no seu servidor. `npm run wipe` apaga tudo; o consentimento é revogável no app do banco.
