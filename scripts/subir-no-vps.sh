#!/usr/bin/env bash
# Instala a sede num VPS Ubuntu novo, do zero. Ver docs/hospedar-na-hostinger.md.
#
# Roda como root, e roda de novo sem medo: cada passo confere antes de fazer.
# Rodar de novo e a forma normal de ATUALIZAR a sede.
#
#   bash subir-no-vps.sh --dominio escritorio.admsolucoes.com.br --email voce@admsolucoes.com.br
#
# Pra VENDER sedes (varios clientes na mesma maquina, cada um isolado):
#   bash subir-no-vps.sh --varias      (so a base; os clientes vem do scripts/sedes.sh)
#
# O que ele NAO faz, de proposito:
#   - nao escreve senha, chave nem token em lugar nenhum: ele cria o .env com as
#     linhas em branco e manda voce preencher;
#   - nao mexe no site da ADM (o WordPress fica onde esta - a sede e um
#     subdominio, um servidor separado);
#   - nao pede certificado se o dominio ainda nao estiver apontando pra ca. Ele
#     avisa e segue: HTTPS depois, quando o DNS propagar.
set -euo pipefail

DOMINIO=""
EMAIL=""
REPO="https://github.com/adm-solucoes/escritorio-virtual.git"
PORTA=3500
VARIAS=0
RAIZ=/opt/sede
APP="$RAIZ/app"
DADOS="$RAIZ/dados"

while [ $# -gt 0 ]; do
  case "$1" in
    --dominio) DOMINIO="${2:-}"; shift 2 ;;
    --email)   EMAIL="${2:-}"; shift 2 ;;
    --repo)    REPO="${2:-}"; shift 2 ;;
    --porta)   PORTA="${2:-}"; shift 2 ;;
    --varias)  VARIAS=1; shift ;;
    *) echo "Opcao que eu nao conheco: $1"; exit 1 ;;
  esac
done

passo() { echo; echo "==> $*"; }
aviso() { echo "    ! $*"; }

[ "$(id -u)" = "0" ] || { echo "Roda como root (sudo -i)."; exit 1; }
[ -n "$DOMINIO" ] || [ "$VARIAS" = "1" ] || { echo "Falta --dominio (ex.: --dominio escritorio.admsolucoes.com.br)"; exit 1; }

# ---------------------------------------------------------------- 1. sistema
passo "Programas do sistema"
# Node 20.12 e o minimo REAL: o codigo usa process.loadEnvFile, que nao existe
# antes disso - e em versao antiga ele nao da erro, so ignora o .env e todas as
# integracoes somem caladas. Por isso a versao e conferida, e nao suposta.
precisa_node=1
if command -v node >/dev/null 2>&1; then
  atual=$(node -p "process.versions.node")
  if node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>20||(a===20&&b>=12)?0:1)"; then
    echo "    Node $atual ja serve."
    precisa_node=0
  else
    aviso "Node $atual e velho demais (precisa 20.12+). Vou instalar o 22."
  fi
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
if [ "$precisa_node" = "1" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y nginx git ufw

# ------------------------------------------------------------------ 2. conta
passo "Usuario e pastas"
# Usuario de sistema, sem senha e sem shell: se um dia alguem entrar pela sede,
# entra como um usuario que nao pode fazer nada no servidor.
id sede >/dev/null 2>&1 || adduser --system --group --home "$RAIZ" --no-create-home sede
mkdir -p "$DADOS"

# ------------------------------------------------------------------ 3. codigo
passo "Codigo da sede"
if [ -d "$APP/.git" ]; then
  git -C "$APP" pull --ff-only
else
  git clone --depth 1 "$REPO" "$APP"
fi
# --omit=dev: o servidor nao precisa das ferramentas de desenvolvimento.
(cd "$APP" && npm ci --omit=dev)

# ------------------------------------------------ modo VARIOS CLIENTES (--varias)
# Pra vender sedes: aqui a maquina fica so com a BASE (Node, nginx, firewall,
# certbot e o codigo). Nenhuma sede e criada - cada cliente vem depois pelo
# scripts/sedes.sh, com usuario, pasta, porta e segredos proprios. E NADA de
# .env na pasta do codigo: ele seria o mesmo pra todos os clientes (ver
# server/ambiente.js).
if [ "$VARIAS" = "1" ]; then
  chown -R root:root "$APP"
  chmod -R go-w "$APP"
  if [ -f "$APP/.env" ]; then
    aviso "Tem um .env em $APP - no modo varios clientes ele NAO e usado (cada sede roda com ARQUIVO_ENV=nenhum)."
  fi
  passo "Firewall"
  ufw allow OpenSSH >/dev/null
  ufw allow 'Nginx Full' >/dev/null
  ufw --force enable >/dev/null
  apt-get install -y certbot python3-certbot-nginx
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  passo "Base pronta. Agora:"
  echo "  1. No DNS, UM registro pra todos os clientes:   *.<dominio-base>  A  <IP deste servidor>"
  echo "  2. bash $APP/scripts/sedes.sh configurar --dominio-base <dominio-base> --email <seu e-mail>"
  echo "  3. bash $APP/scripts/sedes.sh criar <cliente> --nome \"Nome da empresa\" --email-dominio empresa.com.br"
  exit 0
fi

# --------------------------------------------------------------- 4. variaveis
passo "Arquivo de variaveis (.env)"
# A pasta de dados fica FORA do codigo: `git pull` nunca encosta nela, e um
# `rm -rf` na pasta do app nao leva as contas junto.
if [ -f "$APP/.env" ]; then
  echo "    Ja existe - nao vou mexer (suas chaves continuam onde estao)."
else
  cat > "$APP/.env" <<FIM
NODE_ENV=production
PORT=$PORTA
DATA_DIR=$DADOS

# Quem entra com o Google e ja vira diretoria (separados por virgula).
DIRETORIA_EMAILS=

# Entrar com o Google + Agenda. Google Cloud > Credenciais > ID do cliente OAuth.
# No cliente, cadastre o endereco de volta:
#   https://$DOMINIO/api/google/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# O resto (Trello, Drive, TURN, backup) esta em .env.example.
FIM
  aviso "PREENCHA $APP/.env antes de chamar o pessoal (ver .env.example)."
fi
chown -R sede:sede "$RAIZ"
chmod 600 "$APP/.env"

# ----------------------------------------------------------------- 5. servico
passo "Servico (systemd)"
# ExecStart e o iniciar.js, NAO o index.js: ele restaura o backup ANTES de a
# sede ler as contas do disco. Com index.js, um servidor novo (pasta vazia)
# subiria zerado e o backup ficaria sem ninguem pra ler.
cat > /etc/systemd/system/sede.service <<FIM
[Unit]
Description=Escritorio Virtual ADM Solucoes
After=network.target

[Service]
Type=simple
User=sede
WorkingDirectory=$APP
ExecStart=/usr/bin/node server/iniciar.js
Restart=always
RestartSec=5
# A sede nao precisa enxergar o resto do servidor.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DADOS

[Install]
WantedBy=multi-user.target
FIM
systemctl daemon-reload
systemctl enable sede >/dev/null
systemctl restart sede

# ------------------------------------------------------------------- 6. nginx
passo "nginx"
if [ -f /etc/nginx/sites-available/sede ] && grep -q "Certbot" /etc/nginx/sites-available/sede; then
  echo "    Ja configurado e com HTTPS - nao vou sobrescrever."
else
  cat > /etc/nginx/sites-available/sede <<FIM
server {
  listen 80;
  server_name $DOMINIO;

  location / {
    proxy_pass http://127.0.0.1:$PORTA;
    proxy_http_version 1.1;

    # ESTAS DUAS LINHAS SAO O PONTO INTEIRO. Sem elas o site abre, a tela
    # carrega e o mapa fica MORTO: ninguem aparece, ninguem conversa, a chamada
    # nao abre. E o erro classico de por Node atras de nginx - e o sintoma nao
    # parece rede, parece bug do app.
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host \$host;
    # o freio de forca bruta do login depende do IP de verdade (trust proxy)
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    # chamada e chat sao conexoes longas: ociosidade nao pode cortar
    proxy_read_timeout 3600s;
  }
}
FIM
  ln -sf /etc/nginx/sites-available/sede /etc/nginx/sites-enabled/sede
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
fi

# ---------------------------------------------------------------- 7. firewall
passo "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
echo "    Aberto: SSH, 80 e 443. A porta $PORTA fica fechada pra fora (so o nginx fala com ela)."

# ------------------------------------------------------------------- 8. HTTPS
passo "Certificado (HTTPS)"
meu_ip=$(curl -fsS --max-time 10 https://api.ipify.org || echo "")
ip_do_dominio=$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1 || echo "")
if [ -z "$ip_do_dominio" ]; then
  aviso "$DOMINIO ainda nao aponta pra lugar nenhum."
  aviso "No hPanel: Dominios > Zona DNS > registro A -> ${meu_ip:-o IP deste servidor}."
  aviso "Depois que propagar, rode:  certbot --nginx -d $DOMINIO"
elif [ -n "$meu_ip" ] && [ "$ip_do_dominio" != "$meu_ip" ]; then
  aviso "$DOMINIO aponta pra $ip_do_dominio, e este servidor e $meu_ip."
  aviso "Ajuste o DNS e rode:  certbot --nginx -d $DOMINIO"
else
  apt-get install -y certbot python3-certbot-nginx
  if [ -n "$EMAIL" ]; then
    certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m "$EMAIL" --redirect
  else
    aviso "Sem --email eu nao peco o certificado sozinho. Rode: certbot --nginx -d $DOMINIO"
  fi
fi

# -------------------------------------------------------------------- 9. fim
passo "Pronto"
systemctl is-active --quiet sede && echo "    A sede esta de pe." || {
  echo "    A sede NAO subiu. Veja o motivo:  journalctl -u sede -n 40 --no-pager"; exit 1; }

echo
echo "  ABRA AGORA:  https://$DOMINIO/diagnostico.html"
echo "  (ou http:// enquanto o certificado nao sair)"
echo
echo "  Essa pagina responde o que so falha fora do seu computador: versao do Node,"
echo "  se a pasta de dados aceita escrita, se a conexao do chat passou, se os"
echo "  cabecalhos de seguranca chegaram e se o servidor enxerga o IP de cada pessoa."
echo
echo "  Depois: preencher $APP/.env (Google e DIRETORIA_EMAILS) e reiniciar:"
echo "    systemctl restart sede"
echo
echo "  Copiar os livros:  scp -r 'server/data/livros' root@$DOMINIO:$DADOS/"
echo "  Atualizar a sede:  bash $APP/scripts/subir-no-vps.sh --dominio $DOMINIO"
