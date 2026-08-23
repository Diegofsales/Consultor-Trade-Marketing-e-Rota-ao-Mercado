# openfinance-mcp

Servidor MCP **somente leitura** que conecta os dados bancários do Open Finance Brasil a assistentes de IA (ChatGPT e Hermes).

> **Estado atual:** Fase 1 (fundação) implementada e testada. Falta você executar a **Fase 0** abaixo — obter as credenciais — para o sistema ganhar vida.

---

## Fase 0 — Obter acesso aos seus dados (≈ 30 minutos)

Esta é a única parte que **precisa ser feita por você**: envolve sua identidade, seu login bancário e o consentimento formal do Open Finance. Eu não posso (nem devo) fazer isso no seu lugar — em nenhum momento eu devo ver a senha do seu banco.

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

### Passo 4 — Preencher o `.env`

```bash
cd openfinance-mcp
cp .env.example .env
# edite o .env e preencha PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_IDS
```

Gere também o token que protegerá a URL do servidor:

```bash
openssl rand -hex 32   # cole o resultado em MCP_PATH_TOKEN
```

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
- **Descrições de transação são texto de terceiros.** Qualquer estabelecimento escolhe o que escrever ali. Elas sempre voltam como *dado* dentro de JSON, nunca concatenadas em instruções para o modelo.
- **LGPD.** Os dados ficam no seu servidor. `npm run wipe` apaga tudo; o consentimento é revogável no app do banco.
