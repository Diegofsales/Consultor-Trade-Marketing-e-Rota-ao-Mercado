# Hermes Jarvis na VPS — Discord (voz) + Telegram (áudios)

Provisionamento do [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research)
numa VPS Ubuntu/Debian, acessível pelo iPhone:

| Canal | Experiência | Quando usar |
|---|---|---|
| 🎙️ **Discord** (canal de voz) | Conversa contínua hands-free — fala livre, resposta em voz, com ack falado e trilha ambiente enquanto pensa | Sessões de trabalho com o agente |
| 💬 **Telegram** | Áudio turno-a-turno — segura, fala, solta; resposta em voice bubble | Dia a dia, rua, reunião |

Ambos rodam no **mesmo gateway** e carregam o **agente completo** (toolsets
`hermes-discord` / `hermes-telegram` ≡ CLI, com `clarify` preservado — por isso
não usamos a API server/Atalhos, que derruba o `clarify`).

## Antes de rodar

Crie e tenha em mãos:

1. **Bot Discord** — [Developer Portal](https://discord.com/developers/applications) → New Application → Bot → copie o **token**. Em *Bot → Privileged Gateway Intents*, ligue **Message Content Intent**.
2. **Seu Discord user ID** — Discord → Configurações → Avançado → Modo desenvolvedor ON → clique no seu nome → *Copiar ID do usuário*.
3. **Bot Telegram** — fale com [@BotFather](https://t.me/BotFather) → `/newbot` → copie o token.
4. **Seu Telegram user ID** — fale com `@userinfobot`.
5. **Chave Groq** (STT, grátis) — [console.groq.com/keys](https://console.groq.com/keys).
6. **Chave ElevenLabs** (TTS) + o **voice_id** da voz que quiser (a "mordomo britânico" fica na sua Voice Library).
7. **Chave de LLM** — OpenRouter recomendado; ou pule e rode `hermes model` depois.

## Rodar

```bash
scp setup-hermes-vps.sh usuario@sua-vps:~
ssh usuario@sua-vps
bash setup-hermes-vps.sh
```

Idempotente — pode rodar de novo. Valores já salvos em `~/.hermes/.env` não são
pedidos de novo. Para modo não-interativo, exporte as variáveis antes
(`DISCORD_BOT_TOKEN=... bash setup-hermes-vps.sh`).

## O que o script decide por você (e por quê)

| Decisão | Motivo |
|---|---|
| STT = **Groq** `whisper-large-v3-turbo`, não faster-whisper local | CPU de VPS adiciona segundos por turno; Groq responde em ~0,5s no tier grátis |
| TTS = ElevenLabs **`eleven_flash_v2_5`** | ~75ms de latência, suporta pt-BR, teto de 40.000 chars (vs 10.000 do multilingual_v2) |
| `voice_channel_inactivity_timeout_seconds: 600` | Call **sob demanda**: o bot sai sozinho após 10 min de silêncio. Call aberta o dia todo = mic aberto captando conversa alheia (vira prompt, custa LLM e pode disparar ação indevida) |
| `voice_fx` ligado, acks em pt-BR | "Um momento." falado + trilha ambiente enquanto ferramentas rodam |
| `DISCORD_REQUIRE_MENTION=false` | Servidor privado de 1 pessoa — dispensa @menção no texto |
| Sem `--include-desktop`, sem extra `[voice]` | VPS não tem GUI nem microfone; wake word não roda no gateway (limitação documentada) |
| Allowlists obrigatórias | Só os IDs em `DISCORD_ALLOWED_USERS`/`TELEGRAM_ALLOWED_USERS` falam com o bot |

## Depois do script

1. **Convidar o bot** (troque `SEU_APP_ID`):
   `https://discord.com/oauth2/authorize?client_id=SEU_APP_ID&scope=bot+applications.commands&permissions=309240908864`
2. **iPhone / Discord**: entre no canal de voz → `/voice join` no canal de texto → fale.
   Bloqueie o telefone — a call segue em background (AirPods = Jarvis no ouvido).
3. **iPhone / Telegram**: mande um áudio ao bot.
4. **Gmail/Agenda**: mande no chat *"configure o acesso ao meu Gmail e Calendar"* —
   a skill `google-workspace` (bundled) conduz o OAuth pelo próprio chat, headless.

## Operação

```bash
hermes gateway status              # estado do serviço
hermes gateway restart             # após mudar .env/config.yaml
tail -f ~/.hermes/logs/gateway.log # diagnóstico
hermes model                       # trocar provedor/modelo de LLM
```

## Segurança — modelo de ameaças e mitigações

Este deployment reúne a "tríade letal" de prompt injection: **dados privados**
(Gmail/Agenda) + **conteúdo não confiável** (corpo de emails, páginas web,
transcrições de voz — inclusive de terceiros perto do microfone) + **canais de
saída** (web, envio de email, terminal). Um email que o agente apenas *leia*
pode conter instruções maliciosas. Defesa em camadas aplicada pelo script:

| Camada | Controle | O que bloqueia |
|---|---|---|
| Identidade | Allowlists por ID numérico (Discord/Telegram) | Estranhos comandando o bot |
| Instrução | Baseline no `SOUL.md`: email/web/voz = **dado**, não instrução; ação destrutiva/outbound exige clarify; fala ambígua no mic → perguntar | Injeção seguida cegamente; comando captado de terceiros |
| Execução | `approvals.mode: smart` — comando perigoso pede aprovação no chat ("yes"/"no"); `cron_mode: deny` — agendados **nunca** auto-aprovam | Ação destrutiva originada de conteúdo injetado |
| Rede | `ufw` entrada negada (gateway é 100% outbound); porta SSH da sessão detectada antes do enable | Superfície de ataque de entrada = zero |
| SO | `unattended-upgrades` | CVEs conhecidos sem patch |
| Segredos | `umask 077`, `.env` 600, `read -rs` (nada em tela/scrollback), validação de chaves sem token em argv (`-H @<(...)`) | Vazamento por arquivo, shoulder-surfing, `ps` |

**Camada avançada (opcional):** `hermes egress setup` ativa o iron-proxy —
egress default-deny com allowlist de hosts, bloqueio de IPs de metadados de
nuvem e proteção a DNS-rebinding. Fecha exfiltração para hosts arbitrários;
exige manter a allowlist. Combine com `terminal.backend: docker` para isolar a
execução de comandos (atenção: skills que rodam CLIs no host, como
`google-workspace`, precisam das credenciais dentro do container).

**Higiene contínua:** rode `hermes skills audit` antes de instalar skills de
terceiros; não rode `/reload-mcp` à toa (invalida o prompt cache — a próxima
mensagem repaga todos os tokens de schema); revise `~/.hermes/logs/gateway.log`
ocasionalmente.

## Registro de auditoria (v2)

Revisão dev: corrigidos `sed` injetável no upsert de segredos (metacaracteres
corrompiam o `.env`), aborto do provisionamento por falha cosmética no patcher
YAML e por `gateway start` sem guarda em VPS sem systemd, `start`→`restart`
(re-execução aplica config nova), fallback quando `uv` ausente, validação viva
das 4 credenciais contra as APIs reais (mata a fricção do token com typo
descoberto dias depois), validação de formato dos IDs de allowlist, guardas
`set -e`/`set -u` (`[ -n ] &&` em nível de script, `SSH_CONNECTION` ausente).
Revisão de segurança: itens da tabela acima. Testes: sintaxe, upsert com
segredos hostis (`| & \` aspas), process substitution através de função,
patcher com `config.yaml` inexistente, detecção de porta SSH — todos verdes.

## Avisos

- **Call aberta = microfone aberto.** No canal de voz não há wake word nem filtro
  de conteúdo: tudo que o mic captar (inclusive terceiros falando perto) vira
  mensagem sua para o agente. Em reunião ou rua, use o Telegram.
- `~/.hermes/.env` guarda todos os segredos (chmod 600). Não versionar.
- O Hermes na VPS **não alcança seu PC** — ferramentas executam na VPS
  (Gmail/web/arquivos da VPS ✅; arquivos/terminal do seu desktop ❌).
