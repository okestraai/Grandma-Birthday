#!/bin/sh
# Finishes the static-site build for hosts that serve apps/web/dist as plain files
# (Render static sites, Netlify, Cloudflare Pages...).
#
# The production Node server (apps/web/server/index.mjs) replaces __SITE_URL__ in robots.txt
# with SITE_URL as it serves the file. A static host serves the file untouched, so the
# Sitemap directive would read "__SITE_URL__/sitemap.xml" and no crawler would follow it.
# This script does that substitution once, at build time.
set -eu

DIST="${DIST:-apps/web/dist}"
SITE_URL="${VITE_SITE_URL:-${SITE_URL:-}}"

if [ -z "$SITE_URL" ]; then
  echo "render-static-postbuild: VITE_SITE_URL is not set; leaving robots.txt untouched." >&2
  echo "render-static-postbuild: set it to the site's public origin, e.g. https://your-domain" >&2
  exit 0
fi

# Strip any trailing slash so the result is "https://host/sitemap.xml", not "https://host//sitemap.xml".
SITE_URL=$(printf '%s' "$SITE_URL" | sed 's#/*$##')

ROBOTS="$DIST/robots.txt"
if [ ! -f "$ROBOTS" ]; then
  echo "render-static-postbuild: $ROBOTS not found; did the build run?" >&2
  exit 1
fi

# Use a delimiter that cannot appear in a URL scheme, and write via a temp file so a
# failed sed cannot leave robots.txt truncated.
sed "s|__SITE_URL__|$SITE_URL|g" "$ROBOTS" > "$ROBOTS.tmp"
mv "$ROBOTS.tmp" "$ROBOTS"

if grep -q '__SITE_URL__' "$ROBOTS"; then
  echo "render-static-postbuild: __SITE_URL__ still present in robots.txt" >&2
  exit 1
fi

echo "render-static-postbuild: robots.txt sitemap set to $SITE_URL/sitemap.xml"
