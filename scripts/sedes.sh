#!/usr/bin/env bash
# Varias sedes no mesmo servidor - uma por cliente, e nada liga uma a outra.
# Ver docs/varias-sedes.md.
#
#   bash sedes.sh configurar --dominio-base sedes.admsolucoes.com.br --email voce@admsolucoes.com.br
#   bash sedes.sh criar acme --nome "Acme Consultoria" --email-dominio acme.com.br [--sigla Acme] [--diretoria ana@acme.com.br] [--sem-google]
#   bash sedes.sh listar
#   bash sedes.sh atualizar
#   bash sedes.sh remover acme
#
# COMO O ISOLAMENTO E FEITO (e por que nao depende de o codigo estar certo):
#   - cada cliente e um PROGRAMA separado (servico sede@<cliente>), com a propria
#     porta. Um cair nao derruba os outros;
#   - cada um roda com o PROPRIO usuario do sistema (sede-<cliente>), e a pasta de
#     dados dele e 700: um programa nao consegue nem LER a pasta do outro;
#   - as configuracoes de cada um ficam em /etc/sedes/<cliente>.env, arquivo so do
#     root: o systemd le e entrega as variaveis ao programa, que nem consegue abrir
#     o proprio arquivo (e muito menos o dos outros);
#   - ARQUIVO_ENV=nenhum: o programa nao le o .env da pasta do codigo, que seria o
#     MESMO pra todos (ver server/ambiente.js);
#   - segredo de sessao e chave de backup sorteados por cliente.
# testes/isolamento.js prova, com duas sedes de verdade lado a lado, que a conta,
# o cookie, o chat e a presenca de uma nao aparecem na outra.
#
# O codigo e UM so (/opt/sede/app, instalado pelo subir-no-vps.sh): atualizar e
# um `git pull` pra todos. Os dados sao um por cliente.
#
# SEDES_SIMULAR=1 roda sem systemd/nginx/certbot/useradd - so escreve os arquivos
# de configuracao, em pastas que voce escolher (SEDES_ETC, SEDES_DADOS...). Serve
# pra conferir o script fora do VPS.
set -euo pipefail

APP="${SEDES_APP:-/opt/sede/app}"
ETC="${SEDES_ETC:-/etc/sedes}"
DADOS="${SEDES_DADOS:-/var/lib/sedes}"
BACKUPS="${SEDES_BACKUPS:-/var/backups/sedes}"
NGINX="${SEDES_NGINX:-/etc/nginx}"
UNIDADE="${SEDES_UNIDADE:-/etc/systemd/system/sede@.service}"
SIMULAR="${SEDES_SIMULAR:-0}"
PORTA_INICIAL=4001
RESERVADOS=" www api admin padrao mail smtp ftp sede sedes "

passo() { echo; echo "==> $*"; }
aviso() { echo "    ! $*"; }
erro() { echo "ERRO: $*" >&2; exit 1; }

# Comandos que mexem no sistema passam por aqui: na simulacao so aparecem.
sistema() {
  if [ "$SIMULAR" = "1" ]; then echo "    (simulado) $*"; else "$@"; fi
}

segredo() { # hex com N bytes de acaso
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

valor_de() { # valor_de ARQUIVO CHAVE
  sed -n "s/^$2=//p" "$1" | tail -1
}

ler_config() {
  [ -f "$ETC/.config" ] || erro "rode primeiro: bash sedes.sh configurar --dominio-base ... --email ..."
  DOMINIO_BASE=$(valor_de "$ETC/.config" DOMINIO_BASE)
  EMAIL_CERT=$(valor_de "$ETC/.config" EMAIL)
  [ -n "$DOMINIO_BASE" ] || erro "DOMINIO_BASE vazio em $ETC/.config"
}

validar_nome() {
  local c="$1"
  [[ "$c" =~ ^[a-z0-9][a-z0-9-]{1,26}$ ]] || erro "nome de cliente invalido: '$c' (so a-z, 0-9 e hifen; 2 a 27 letras; comeca com letra ou numero)"
  [[ "$RESERVADOS" != *" $c "* ]] || erro "'$c' e reservado"
}

clientes() { # lista os clientes existentes, um por linha
  [ -d "$ETC" ] || return 0
  for f in "$ETC"/*.env; do
    [ -e "$f" ] || continue
    local n; n=$(basename "$f" .env)
    [ "$n" = "padrao" ] && continue
    echo "$n"
  done
}

proxima_porta() {
  local maior=$((PORTA_INICIAL - 1)) p
  for c in $(clientes); do
    p=$(valor_de "$ETC/$c.env" PORT)
    [ -n "$p" ] && [ "$p" -gt "$maior" ] && maior=$p
  done
  echo $((maior + 1))
}

escrever_unidade() {
  # Um molde de servico pra todos os clientes: sede@acme, sede@beta...
  local conteudo
  conteudo=$(cat <<FIM
[Unit]
Description=Sede %i (escritorio virtual)
After=network.target

[Service]
Type=simple
User=sede-%i
Group=sede-%i
WorkingDirectory=$APP
# Nao ler o .env da pasta do codigo: ele seria o MESMO pra todos os clientes.
Environment=ARQUIVO_ENV=nenhum
# Primeiro o que vale pra todos (infraestrutura), depois o do cliente, que ganha.
EnvironmentFile=-$ETC/padrao.env
EnvironmentFile=$ETC/%i.env
ExecStart=/usr/bin/node server/iniciar.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DADOS/%i
# Um cliente com problema nao pode tomar a maquina dos outros.
MemoryMax=400M
CPUQuota=60%

[Install]
WantedBy=multi-user.target
FIM
)
  if [ "$SIMULAR" = "1" ]; then
    mkdir -p "$(dirname "$UNIDADE")"
    printf '%s\n' "$conteudo" > "$UNIDADE"
    echo "    (simulado) escrevi $UNIDADE"
  else
    printf '%s\n' "$conteudo" > "$UNIDADE"
    systemctl daemon-reload
  fi
}

# ------------------------------------------------------------------ configurar
cmd_configurar() {
  local base="" email=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --dominio-base) base="${2:-}"; shift 2 ;;
      --email) email="${2:-}"; shift 2 ;;
      *) erro "opcao desconhecida: $1" ;;
    esac
  done
  [ -n "$base" ] || erro "falta --dominio-base (ex.: sedes.admsolucoes.com.br)"
  [ -d "$APP/.git" ] || [ "$SIMULAR" = "1" ] || erro "codigo nao encontrado em $APP - rode antes o subir-no-vps.sh"

  passo "Configuracao geral"
  (umask 077; mkdir -p "$ETC"; printf 'DOMINIO_BASE=%s\nEMAIL=%s\n' "$base" "$email" > "$ETC/.config")
  if [ ! -f "$ETC/padrao.env" ]; then
    (umask 077; cat > "$ETC/padrao.env" <<'FIM'
# Valores que valem pra TODAS as sedes deste servidor: so infraestrutura.
#
# NUNCA ponha aqui nada que identifique um cliente - DOMINIOS_SEDE,
# DIRETORIA_EMAILS, CODIGO_SEDE, ADMIN_CODE, SESSION_SECRET, BACKUP_*: isso
# valeria pra todos ao mesmo tempo. O sedes.sh escreve esses no arquivo de cada
# cliente (mesmo vazios), e o do cliente ganha deste.
#
# Google (Entrar com o Google e Agenda): um cliente OAuth serve pra todas as
# sedes, mas o endereco de volta de CADA uma tem que estar cadastrado nele
# (https://<cliente>.<dominio-base>/api/google/callback).
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Chamada de video em rede fechada (Cloudflare TURN) - cobra por volume.
CLOUDFLARE_TURN_KEY_ID=
CLOUDFLARE_TURN_TOKEN=

# E-mail (confirmar cadastro e "esqueci minha senha") - docs/email.md. Uma conta
# no provedor serve pra todas as sedes: o NOME que aparece como remetente e o de
# cada cliente (NOME_SEDE). Pra um cliente mandar do dominio dele, ponha
# EMAIL_REMETENTE no arquivo DELE - o do cliente ganha deste.
EMAIL_PROVEDOR=
EMAIL_CHAVE=
EMAIL_REMETENTE=
FIM
)
    echo "    Criei $ETC/padrao.env (em branco) - preencha o Google e o TURN se for usar."
  fi
  escrever_unidade
  mkdir -p "$DADOS" "$BACKUPS"
  chmod 700 "$BACKUPS" 2>/dev/null || true
  echo "    Dominio base: $base"
  echo "    No DNS, UM registro so pra todos os clientes:"
  echo "      *.$base   A   <IP deste servidor>"
}

# ------------------------------------------------------------------------ criar
cmd_criar() {
  local c="${1:-}"; shift || true
  local nome="" sigla="" dominio="" diretoria="" sem_google=0 tem_dominio=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --nome) nome="${2:-}"; shift 2 ;;
      --sigla) sigla="${2:-}"; shift 2 ;;
      --email-dominio) dominio="${2:-}"; tem_dominio=1; shift 2 ;;
      --diretoria) diretoria="${2:-}"; shift 2 ;;
      --sem-google) sem_google=1; shift ;;
      *) erro "opcao desconhecida: $1" ;;
    esac
  done
  [ -n "$c" ] || erro "uso: sedes.sh criar <cliente> --nome \"Nome\" --email-dominio empresa.com.br"
  validar_nome "$c"
  ler_config
  # Aspas, barra e quebra de linha estragariam o arquivo de configuracao.
  nome=$(printf '%s' "$nome" | tr -d '"\\\r\n')
  sigla=$(printf '%s' "$sigla" | tr -d '"\\\r\n')
  [ -n "$nome" ] || erro "falta --nome (o nome da empresa, como aparece pra ela)"
  # Obrigatorio de proposito: sem dominio, ninguem cria conta por e-mail - e e
  # facil esquecer. Quem nao quer cadastro por e-mail passa --email-dominio "".
  [ "$tem_dominio" = "1" ] || erro "falta --email-dominio (ou --email-dominio \"\" pra ninguem entrar por e-mail)"
  dominio=$(printf '%s' "$dominio" | tr 'A-Z' 'a-z')
  [[ -z "$dominio" || "$dominio" =~ ^[a-z0-9.-]+(,[a-z0-9.-]+)*$ ]] || erro "--email-dominio invalido: '$dominio'"
  diretoria=$(printf '%s' "$diretoria" | tr 'A-Z' 'a-z')
  [[ -z "$diretoria" || "$diretoria" =~ ^[^[:space:]\"\\]+$ ]] || erro "--diretoria invalida (e-mails separados por virgula, sem espaco)"
  [ ! -f "$ETC/$c.env" ] || erro "o cliente '$c' ja existe"

  local porta endereco admin
  porta=$(proxima_porta)
  endereco="$c.$DOMINIO_BASE"
  admin=$(segredo 5)

  passo "Cliente $c ($nome) - porta $porta - https://$endereco"
  (umask 077; {
    echo "# Sede \"$nome\" ($c) - criada em $(date '+%d/%m/%Y %H:%M') por scripts/sedes.sh."
    echo "# Arquivo so do root: a sede recebe estas variaveis do systemd, sem conseguir"
    echo "# ler este arquivo (nem o de nenhum outro cliente)."
    echo "NODE_ENV=production"
    echo "PORT=$porta"
    echo "DATA_DIR=$DADOS/$c"
    echo "SITE_URL=https://$endereco"
    echo "# A marca que aparece pra quem entra (server/marca.js)."
    echo "NOME_SEDE=$nome"
    echo "SIGLA_SEDE=${sigla:-$nome}"
    echo "SUBTITULO_SEDE=Escritorio virtual"
    echo "# O acervo fisico e o da sala da ADM: cliente nao tem (a aba some da estante)."
    echo "ACERVO_FISICO=nenhum"
    echo "SESSION_SECRET=$(segredo 32)"
    echo "# Quem pode criar conta: e-mail deste dominio. Vazio = ninguem por e-mail."
    echo "DOMINIOS_SEDE=$dominio"
    echo "# Quem vira diretoria entrando com o Google."
    echo "DIRETORIA_EMAILS=$diretoria"
    echo "# Codigo de diretoria no cadastro com senha - entregar ao responsavel do cliente."
    echo "ADMIN_CODE=$admin"
    echo "# Codigo pra e-mail de FORA do dominio. Vazio = fechado."
    echo "CODIGO_SEDE="
    echo "# Backup: chave PROPRIA (o backup de um cliente nao abre com a chave de outro)."
    echo "BACKUP_CHAVE=$(segredo 32)"
    echo "BACKUP_DRIVE_PASTA="
    echo "# Integracoes do proprio cliente (vazias = desligadas)."
    echo "TRELLO_API_KEY="
    echo "TRELLO_TOKEN="
    echo "TRELLO_QUADROS="
    echo "TRELLO_BOARD_ID="
    echo "GOOGLE_DRIVE_PASTA="
    echo "GOOGLE_CONTA_SERVICO="
    if [ "$sem_google" = "1" ]; then
      echo "# --sem-google: desliga o Google so pra este cliente."
      echo "GOOGLE_CLIENT_ID="
      echo "GOOGLE_CLIENT_SECRET="
    fi
  } > "$ETC/$c.env")
  echo "    Configuracao: $ETC/$c.env (so root)"

  # Usuario proprio e pasta 700: o programa de um cliente nao le a pasta do outro.
  if ! id "sede-$c" >/dev/null 2>&1; then
    sistema useradd --system --no-create-home --shell /usr/sbin/nologin "sede-$c"
  fi
  mkdir -p "$DADOS/$c"
  sistema chown "sede-$c:sede-$c" "$DADOS/$c"
  chmod 700 "$DADOS/$c"

  [ -f "$UNIDADE" ] || escrever_unidade
  sistema systemctl enable --now "sede@$c"

  if [ "$SIMULAR" != "1" ]; then
    local ok=0
    for _ in $(seq 1 40); do
      if curl -fsS "http://127.0.0.1:$porta/api/saude" >/dev/null 2>&1; then ok=1; break; fi
      sleep 0.5
    done
    [ "$ok" = "1" ] || erro "a sede nao subiu. Veja: journalctl -u sede@$c -n 40 --no-pager"
    echo "    A sede esta de pe."
  fi

  passo "nginx"
  local site="$NGINX/sites-available/sede-$c"
  mkdir -p "$NGINX/sites-available" "$NGINX/sites-enabled"
  cat > "$site" <<FIM
server {
  listen 80;
  server_name $endereco;

  location / {
    proxy_pass http://127.0.0.1:$porta;
    proxy_http_version 1.1;
    # Sem estas duas linhas o site abre e o mapa fica MORTO (sem WebSocket).
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 3600s;
  }
}
FIM
  ln -sf "$site" "$NGINX/sites-enabled/sede-$c"
  sistema nginx -t
  sistema systemctl reload nginx

  passo "Certificado"
  if [ "$SIMULAR" = "1" ]; then
    echo "    (simulado) certbot --nginx -d $endereco"
  elif ! getent hosts "$endereco" >/dev/null 2>&1; then
    aviso "$endereco ainda nao resolve. Crie no DNS: *.$DOMINIO_BASE A <IP deste servidor>"
    aviso "Depois: certbot --nginx -d $endereco"
  elif [ -n "$EMAIL_CERT" ]; then
    certbot --nginx -d "$endereco" --non-interactive --agree-tos -m "$EMAIL_CERT" --redirect
  else
    aviso "Sem e-mail em $ETC/.config: rode  certbot --nginx -d $endereco"
  fi

  passo "Pronto: https://$endereco"
  echo "    Codigo de diretoria (guarde e entregue ao responsavel; aparece so agora):"
  echo "      $admin"
  if [ "$sem_google" != "1" ]; then
    echo "    Pra 'Entrar com o Google' funcionar, cadastre no cliente OAuth do Google Cloud:"
    echo "      https://$endereco/api/google/callback"
  fi
  echo "    Confira tudo em: https://$endereco/diagnostico.html"
}

# ----------------------------------------------------------------------- listar
cmd_listar() {
  local algum=0
  printf '%-16s %-6s %-9s %-7s %s\n' CLIENTE PORTA ESTADO CONTAS NOME
  for c in $(clientes); do
    algum=1
    local porta nome estado contas
    porta=$(valor_de "$ETC/$c.env" PORT)
    nome=$(valor_de "$ETC/$c.env" NOME_SEDE)
    if [ "$SIMULAR" = "1" ]; then estado="simulado"; contas="-"
    else
      estado=$(systemctl is-active "sede@$c" 2>/dev/null || true)
      contas=$(curl -fsS --max-time 3 "http://127.0.0.1:$porta/api/saude" 2>/dev/null | sed -n 's/.*"contas":\([0-9]*\).*/\1/p')
    fi
    printf '%-16s %-6s %-9s %-7s %s\n' "$c" "$porta" "${estado:-?}" "${contas:--}" "$nome"
  done
  [ "$algum" = "1" ] || echo "(nenhum cliente ainda)"
}

# -------------------------------------------------------------------- atualizar
cmd_atualizar() {
  passo "Codigo novo (um so pra todos os clientes)"
  sistema git -C "$APP" pull --ff-only
  if [ "$SIMULAR" = "1" ]; then echo "    (simulado) npm ci --omit=dev"; else (cd "$APP" && npm ci --omit=dev); fi
  passo "Reiniciando um cliente de cada vez"
  for c in $(clientes); do
    local porta; porta=$(valor_de "$ETC/$c.env" PORT)
    sistema systemctl restart "sede@$c"
    if [ "$SIMULAR" != "1" ]; then
      local ok=0
      for _ in $(seq 1 40); do
        if curl -fsS "http://127.0.0.1:$porta/api/saude" >/dev/null 2>&1; then ok=1; break; fi
        sleep 0.5
      done
      [ "$ok" = "1" ] && echo "    $c: de pe" || aviso "$c NAO voltou - journalctl -u sede@$c -n 40 --no-pager"
    fi
  done
}

# ---------------------------------------------------------------------- remover
cmd_remover() {
  local c="${1:-}"; shift || true
  local sim=0
  [ "${1:-}" = "--sim" ] && sim=1
  [ -n "$c" ] || erro "uso: sedes.sh remover <cliente>"
  validar_nome "$c"
  ler_config
  [ -f "$ETC/$c.env" ] || erro "o cliente '$c' nao existe"

  if [ "$sim" != "1" ]; then
    echo "Isto APAGA a sede '$c': contas, chat, mesas, decoracao."
    echo "Antes, uma copia final vai pra $BACKUPS (so root)."
    printf "Digite o nome do cliente pra confirmar: "
    local conf; read -r conf
    [ "$conf" = "$c" ] || erro "nao confirmado - nada foi apagado"
  fi

  passo "Copia final (LGPD: guarde so pelo tempo que o contrato disser, e depois apague)"
  mkdir -p "$BACKUPS"
  local arq; arq="$BACKUPS/$c-$(date '+%Y%m%d-%H%M').tar.gz"
  (umask 077; tar -czf "$arq" -C "$DADOS" "$c" -C "$ETC" "$c.env")
  echo "    $arq"

  passo "Desligando e apagando"
  sistema systemctl disable --now "sede@$c"
  rm -f "$NGINX/sites-enabled/sede-$c" "$NGINX/sites-available/sede-$c"
  sistema systemctl reload nginx
  sistema certbot delete --cert-name "$c.$DOMINIO_BASE" --non-interactive
  rm -f "$ETC/$c.env"
  rm -rf "${DADOS:?}/$c"
  sistema userdel "sede-$c"
  echo "    Cliente '$c' removido."
}

case "${1:-}" in
  configurar) shift; cmd_configurar "$@" ;;
  criar) shift; cmd_criar "$@" ;;
  listar) cmd_listar ;;
  atualizar) cmd_atualizar ;;
  remover) shift; cmd_remover "$@" ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
