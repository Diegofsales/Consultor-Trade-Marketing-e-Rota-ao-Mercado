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

## Avisos

- **Call aberta = microfone aberto.** No canal de voz não há wake word nem filtro
  de conteúdo: tudo que o mic captar (inclusive terceiros falando perto) vira
  mensagem sua para o agente. Em reunião ou rua, use o Telegram.
- `~/.hermes/.env` guarda todos os segredos (chmod 600). Não versionar.
- O Hermes na VPS **não alcança seu PC** — ferramentas executam na VPS
  (Gmail/web/arquivos da VPS ✅; arquivos/terminal do seu desktop ❌).
