#!/usr/bin/env bash
set -euo pipefail

base=/opt/pmrfp/canonical
releases="$base/releases"
compose="$base/canonical-google-rehearsal.compose.yaml"
service=pmrfp-native-auth-candidate-1

if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ (main|master)\ ([a-f0-9]{40})$ ]]; then
  echo 'Expected a deployment command for a production branch.' >&2
  exit 2
fi
branch=${BASH_REMATCH[1]}
revision=${BASH_REMATCH[2]}

exec 9>"$base/.github-deploy.lock"
flock -w 300 9
github_head=$(timeout 20 git ls-remote --symref https://github.com/talkerstein/pmrfp.git HEAD)
default_ref=$(awk '$1=="ref:" && $3=="HEAD" { print $2 }' <<< "$github_head")
default_sha=$(awk '$2=="HEAD" && $1!="ref:" { print $1 }' <<< "$github_head")
[[ "$default_ref" == "refs/heads/$branch" && "$default_sha" == "$revision" ]] || {
  echo 'Deployment is no longer the GitHub default branch head.' >&2
  exit 1
}

previous=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}' "$service")
[[ "$previous" == "$releases/"* && -f "$previous/server.js" ]]
if [[ "$previous" == "$releases/gh-$revision-"* ]]; then
  echo "Release $revision is already deployed."
  exit 0
fi
[[ $(df -Pm "$releases" | awk 'NR==2 {print $4}') -ge 1200 ]] || {
  echo 'At least 1.2 GB of free space is needed for a new release.' >&2
  exit 1
}

release=$(mktemp -d "$releases/gh-$revision-XXXXXX")
candidate="pmrfp-gh-check-${revision:0:12}"
remove_candidate() {
  docker rm -f "$candidate" >/dev/null 2>&1 || true
}
cleanup() {
  remove_candidate
  active=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}' "$service") || return 0
  if [[ "$active" != "$release" ]]; then
    rm -rf -- "$release"
  fi
}
trap cleanup EXIT
chmod 755 "$release"
chown nobody "$release"
timeout 240 runuser -u nobody -- tar -xzf - --no-same-owner --no-same-permissions -C "$release"
chown -hR root:root "$release"
mkdir -p "$release/.next/cache"
[[ -f "$release/server.js" && -d "$release/.next/static" && -d "$release/public" ]]

deploy() {
  PMRFP_NATIVE_RELEASE="$1" docker compose -f "$compose" up -d --no-deps --wait --wait-timeout 75 candidate
}
PMRFP_NATIVE_RELEASE="$release" docker compose -f "$compose" run --no-deps -d --name "$candidate" candidate
for attempt in {1..20}; do
  if docker exec "$candidate" node -e 'fetch("http://127.0.0.1:4323/sign-in",{signal:AbortSignal.timeout(4000),headers:{host:"pmrfp.com","x-forwarded-proto":"https","x-forwarded-host":"pmrfp.com","x-forwarded-port":"443"}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'; then
    break
  fi
  [[ "$attempt" -lt 20 ]] || exit 1
  sleep 2
done
remove_candidate

if ! deploy "$release" || ! curl --fail --silent --show-error --retry 3 --max-time 10 https://pmrfp.com/sign-in -o /dev/null; then
  echo "Health check failed. Restoring $previous." >&2
  deploy "$previous"
  exit 1
fi
printf 'Deployed %s\n' "$revision"
