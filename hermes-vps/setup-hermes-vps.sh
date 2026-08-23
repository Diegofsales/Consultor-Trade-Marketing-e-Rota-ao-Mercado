#!/usr/bin/env bash
# ============================================================================
# setup-hermes-vps.sh — Provisiona o Hermes Agent numa VPS Ubuntu/Debian
#
# Entrega o "Hermes Jarvis" acessível pelo iPhone via:
#   🎙️ Discord  — canal de voz (conversa contínua, hands-free)
#   💬 Telegram — áudios turno-a-turno (dia a dia, rua, reunião)
#
# Stack configurada:
#   STT  → Groq Whisper (whisper-large-v3-turbo, ~0.5s, tier gratuito)
#          [NÃO usa faster-whisper local — CPU de VPS adiciona latência feia]
#   TTS  → ElevenLabs (eleven_flash_v2_5: ~75ms, multilíngue/pt-BR,
#          teto de 40.000 chars por síntese)
#   FX   → voice_fx do Discord: ack falado ("Um momento.") + trilha ambiente
#          enquanto ferramentas rodam (estilo Grok voice mode)
#
# Idempotente: pode rodar de novo sem quebrar nada. Valores já presentes
# em ~/.hermes/.env não são pedidos de novo (exporte a variável antes de
# rodar para modo não-interativo, ex.: DISCORD_BOT_TOKEN=... ./setup...).
#
# Uso:  bash setup-hermes-vps.sh
# ============================================================================
set -euo pipefail

# ── Helpers ─────────────────────────────────────────────────────────────────
BOLD=$'\e[1m'; DIM=$'\e[2m'; GRN=$'\e[32m'; YLW=$'\e[33m'; RST=$'\e[0m'
say()  { printf '%s\n' "${GRN}==>${RST} ${BOLD}$*${RST}"; }
note() { printf '%s\n' "    ${DIM}$*${RST}"; }
warn() { printf '%s\n' "${YLW}AVISO:${RST} $*"; }

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ENV_FILE="$HERMES_HOME/.env"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || { warn "rode como root ou instale sudo"; exit 1; }
  SUDO="sudo"
fi

# Grava KEY=VALUE em ~/.hermes/.env (substitui se existir, senão adiciona)
upsert_env() {
  local key="$1" val="$2"
  mkdir -p "$HERMES_HOME"; touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# Lê valor: 1º env exportada, 2º já salvo no .env, 3º prompt interativo.
# ask VAR "descrição" [obrigatorio|opcional] [default]
ask() {
  local var="$1" desc="$2" mode="${3:-obrigatorio}" def="${4:-}" cur=""
  if [ -n "${!var:-}" ]; then upsert_env "$var" "${!var}"; note "$var: usando valor exportado"; return; fi
  cur="$(grep -s "^${var}=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  if [ -n "$cur" ]; then note "$var: já configurado em .env — mantendo"; return; fi
  local input=""
  read -r -p "  ${desc}${def:+ [padrão: $def]}: " input </dev/tty || true
  input="${input:-$def}"
  if [ -z "$input" ]; then
    if [ "$mode" = "obrigatorio" ]; then warn "$var é obrigatório."; exit 1; fi
    note "$var: pulado (opcional)"; return
  fi
  upsert_env "$var" "$input"
}

# ── 1. Dependências de sistema ──────────────────────────────────────────────
say "1/6 Instalando dependências de sistema (ffmpeg, libopus0)"
note "ffmpeg = conversão de áudio (TTS→Opus p/ voice bubbles) | libopus0 = codec de voz do Discord"
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq ffmpeg libopus0 curl git ca-certificates >/dev/null

# ── 2. Hermes Agent ─────────────────────────────────────────────────────────
export PATH="$HOME/.local/bin:$PATH"
if command -v hermes >/dev/null 2>&1; then
  say "2/6 Hermes já instalado — pulando installer"
else
  say "2/6 Instalando Hermes Agent (installer oficial da Nous Research)"
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
  command -v hermes >/dev/null || { warn "hermes não entrou no PATH — abra novo shell e rode o script de novo"; exit 1; }
fi

# ── 3. Extras Python ────────────────────────────────────────────────────────
# [messaging]   = discord.py[voice] (PyNaCl+opus) + python-telegram-bot + aiohttp
# [tts-premium] = elevenlabs
# NÃO instalamos [voice] (faster-whisper/sounddevice): VPS não tem microfone
# e o STT é Groq via API. NÃO instalamos --include-desktop: VPS não tem GUI.
say "3/6 Instalando extras Python [messaging] + [tts-premium]"
( cd "$HERMES_HOME/hermes-agent" && uv pip install -e ".[messaging,tts-premium]" )

# ── 4. Credenciais (~/.hermes/.env) ─────────────────────────────────────────
say "4/6 Credenciais — só pede o que ainda não existe no .env"
echo
note "── Discord (canal de voz) ── crie o bot em https://discord.com/developers/applications"
ask DISCORD_BOT_TOKEN     "Token do bot Discord"
ask DISCORD_ALLOWED_USERS "Seu Discord user ID (trava: SÓ você fala com o bot)"
note "── Telegram (áudios) ── crie o bot no @BotFather com /newbot"
ask TELEGRAM_BOT_TOKEN     "Token do bot Telegram"
ask TELEGRAM_ALLOWED_USERS "Seu Telegram user ID (descubra com o bot @userinfobot)"
note "── Voz ──"
ask GROQ_API_KEY       "Chave Groq p/ STT — grátis em https://console.groq.com/keys"
ask ELEVENLABS_API_KEY "Chave ElevenLabs p/ TTS"
# NOTA: ELEVENLABS_VOICE_ID NÃO é lida pelo Hermes — é variável auxiliar deste
# script (lembra sua escolha entre execuções). O Hermes lê o voice_id do
# config.yaml (tts.elevenlabs.voice_id), aplicado na etapa 5 abaixo.
# Para trocar a voz depois:  hermes config set tts.elevenlabs.voice_id <novo-id>
ask ELEVENLABS_VOICE_ID "Voice ID da ElevenLabs (a voz 'mordomo britânico' que escolher)" opcional "pNInz6obpgDQGcFmaJgB"
note "── LLM (o cérebro) ──"
ask OPENROUTER_API_KEY "Chave OpenRouter (Enter p/ pular e configurar depois com 'hermes model')" opcional

# Servidor privado de 1 pessoa: dispensa @menção nos canais de texto
upsert_env DISCORD_REQUIRE_MENTION false

# ── 5. config.yaml ──────────────────────────────────────────────────────────
say "5/6 Configurando voz (config.yaml via 'hermes config set')"
VOICE_ID="$(grep '^ELEVENLABS_VOICE_ID=' "$ENV_FILE" | cut -d= -f2- || true)"

hermes config set stt.provider groq
hermes config set stt.groq.language pt                    # dica pt-BR p/ Whisper
hermes config set tts.provider elevenlabs
hermes config set tts.elevenlabs.model_id eleven_flash_v2_5   # ~75ms, pt-BR, teto 40k chars
[ -n "$VOICE_ID" ] && hermes config set tts.elevenlabs.voice_id "$VOICE_ID"

# Call sob demanda: bot sai sozinho do canal após 10 min de silêncio.
# (0 = nunca sair — NÃO recomendado: mic aberto capta conversa alheia,
#  cada frase vira chamada de LLM e pode disparar ação indevida.)
hermes config set discord.voice_channel_inactivity_timeout_seconds 600

# voice_fx: ack falado + trilha "pensando" (mixer soma as camadas)
hermes config set discord.voice_fx.enabled true
hermes config set discord.voice_fx.ambient_enabled true
hermes config set discord.voice_fx.ack_enabled true

# ack_phrases é lista — YAML editado com o Python do venv do Hermes
PYBIN="$HERMES_HOME/hermes-agent/.venv/bin/python"
[ -x "$PYBIN" ] || PYBIN="$(command -v python3)"
"$PYBIN" - "$HERMES_HOME/config.yaml" <<'PYEOF'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    cfg = yaml.safe_load(f) or {}
fx = cfg.setdefault("discord", {}).setdefault("voice_fx", {})
fx["ack_phrases"] = ["Deixa eu ver isso.", "Um momento.", "Verificando agora."]
with open(path, "w") as f:
    yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)
print("    ack_phrases em pt-BR gravadas.")
PYEOF

# ── 6. Serviço systemd (24/7, sobe no boot, reinicia se cair) ───────────────
say "6/6 Registrando gateway como serviço systemd"
hermes gateway install || warn "install do serviço falhou — rode 'hermes gateway run' dentro de tmux como alternativa"

if grep -qE '^(OPENROUTER|ANTHROPIC|OPENAI|XAI|GEMINI|DEEPSEEK)_API_KEY=.' "$ENV_FILE"; then
  hermes gateway start
  hermes gateway status || true
else
  warn "Nenhum provedor de LLM configurado ainda — o bot conectaria mas não pensaria."
  note "Rode:  hermes model   (escolha o provedor)   e depois:  hermes gateway start"
fi

# ── Resumo ──────────────────────────────────────────────────────────────────
APP_HINT="SEU_APP_ID (Developer Portal → General Information → Application ID)"
cat <<RESUMO

${GRN}${BOLD}════════════════ PRONTO — PRÓXIMOS PASSOS ════════════════${RST}

${BOLD}1. Convide o bot ao seu servidor privado do Discord${RST} (texto+voz):
   https://discord.com/oauth2/authorize?client_id=${APP_HINT}&scope=bot+applications.commands&permissions=309240908864
   ${DIM}No Developer Portal → Bot → ligue "Message Content Intent".${RST}

${BOLD}2. Teste no iPhone:${RST}
   Discord  → entre no canal de voz → digite /voice join no canal de texto → FALE.
             ${DIM}Bloqueie o telefone: a call segue em background (AirPods = Jarvis no ouvido).
             Sessão encerrada? Ele sai sozinho após 10 min de silêncio.${RST}
   Telegram → segure o microfone, fale, solte. Resposta volta em voice bubble.

${BOLD}3. Gmail/Agenda por voz${RST} (skill google-workspace, já vem instalada):
   Mande no chat: "configure o acesso ao meu Gmail e Calendar"
   ${DIM}Ele te guia pelo OAuth no próprio chat — funciona headless, sem navegador na VPS.${RST}

${BOLD}4. Sanidade:${RST}  hermes gateway status   |   tail -f ~/.hermes/logs/gateway.log

${YLW}Lembretes de segurança:${RST}
 • Allowlists ativas: só os IDs em DISCORD_ALLOWED_USERS / TELEGRAM_ALLOWED_USERS falam com ele.
 • Call aberta = mic aberto: em reunião/rua, prefira o Telegram (você controla o que ele ouve).
 • ~/.hermes/.env está chmod 600. Não versione esse arquivo.
RESUMO
