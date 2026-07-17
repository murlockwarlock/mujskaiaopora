#!/usr/bin/env bash
set -euo pipefail

host="${1:?Укажите SSH-хост}"
revision="${2:?Укажите SHA коммита}"
remote_path="${DEPLOY_PATH:-/opt/mujskaiaopora/current}"
ssh_port="${DEPLOY_PORT:-22}"

ssh -p "$ssh_port" "$host" "bash -s" -- "$remote_path" "$revision" <<'REMOTE'
set -euo pipefail

remote_path="$1"
revision="$2"
compose_file="infra/production/docker-compose.yml"
environment_file="infra/production/.env"

cd "$remote_path"
test -f "$environment_file"
git fetch origin main
git cat-file -e "${revision}^{commit}"
git checkout --detach "$revision"
printf '%s\n' "$revision" > REVISION

if grep -q '^APP_REVISION=' "$environment_file"; then
  sed -i "s/^APP_REVISION=.*/APP_REVISION=$revision/" "$environment_file"
else
  printf 'APP_REVISION=%s\n' "$revision" >> "$environment_file"
fi

docker compose -f "$compose_file" build api
docker compose -f "$compose_file" up -d --no-build
test "$(cat REVISION)" = "$revision"
docker compose -f "$compose_file" ps
REMOTE
