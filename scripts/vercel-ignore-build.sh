#!/bin/bash
# Vercel "Ignored Build Step" (vercel.json -> ignoreCommand).
#
# Exit 0 = skip this build, exit 1 = build.
#
# Same-commit redeploys always build, so environment-variable changes can be
# applied (a redeploy of the same commit, via the dashboard or the API, has
# nothing to diff, and skipping it would leave the new variables unused).
#
# Fails OPEN: it skips only when it positively knows that every changed path
# is in the ignored set (briefs/, docs/, supabase/, mobile/, test/, .github/
# and Markdown files). Anything else -- unknown previous commit, missing
# commit, a git error -- builds.

set -u

sha="${VERCEL_GIT_COMMIT_SHA:-}"
base="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$base" ]; then
  echo "ignore-build: no previous deployed commit known; building."
  exit 1
fi

head_sha="$(git rev-parse --verify -q HEAD 2>/dev/null)" || {
  echo "ignore-build: cannot resolve HEAD; building."
  exit 1
}

if [ "$base" = "$sha" ] || [ "$base" = "$head_sha" ]; then
  echo "ignore-build: same commit as the previous deployment (redeploy); building."
  exit 1
fi

if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "ignore-build: previous commit not available; building."
  exit 1
fi

git diff --quiet "$base" HEAD -- . \
  ':(exclude)briefs' \
  ':(exclude)docs' \
  ':(exclude)supabase' \
  ':(exclude)mobile' \
  ':(exclude)test' \
  ':(exclude).github' \
  ':(exclude,glob)**/*.md'
rc=$?

if [ "$rc" -eq 0 ]; then
  echo "ignore-build: only briefs/docs/supabase/mobile/test/.github/markdown changed; skipping the build."
  exit 0
fi

# rc 1 = app files changed; anything else = git failed. Both build.
echo "ignore-build: app files changed (or diff failed); building."
exit 1
