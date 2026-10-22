#!/bin/bash
# Vercel "Ignored Build Step" (vercel.json -> ignoreCommand).
#
# Exit 0 = skip this build, exit 1 = build. Skips a deploy only when NOTHING
# that can change the website changed: briefs/, docs/, supabase/ (database
# migrations have their own GitHub workflow), mobile/ (a separate Expo app),
# test/, .github/ and Markdown files. When in doubt it builds.
#
# What it compares against:
#   - VERCEL_GIT_PREVIOUS_SHA (the last deployed commit on this branch) if
#     Vercel has it and the commit is available;
#   - otherwise, on the production branch only, the commit's first parent
#     (the previous master);
#   - otherwise (a brand-new preview branch) it builds.

set -u

branch="${VERCEL_GIT_COMMIT_REF:-}"
base="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  if [ "$branch" = "master" ] || [ "$branch" = "main" ]; then
    base="HEAD^"
  else
    echo "ignore-build: no comparison commit on '$branch'; building."
    exit 1
  fi
fi

if ! git rev-parse --verify -q "${base}^{commit}" >/dev/null 2>&1; then
  echo "ignore-build: comparison commit not available; building."
  exit 1
fi

if git diff --quiet "$base" HEAD -- . \
  ':(exclude)briefs' \
  ':(exclude)docs' \
  ':(exclude)supabase' \
  ':(exclude)mobile' \
  ':(exclude)test' \
  ':(exclude).github' \
  ':(exclude,glob)**/*.md'; then
  echo "ignore-build: only briefs/docs/supabase/mobile/test/.github/markdown changed; skipping the build."
  exit 0
fi

echo "ignore-build: app files changed; building."
exit 1
