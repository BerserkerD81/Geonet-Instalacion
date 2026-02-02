#!/bin/sh
set -eu

ENV_JS_PATH="/usr/share/nginx/html/env.js"

# Generate runtime env file for the frontend
# (Vite env vars are build-time; this lets Docker inject at runtime)
{
  echo "window.__ENV__ = window.__ENV__ || {};"
  echo "window.__ENV__.VITE_GOOGLE_MAPS_API_KEY = \"${VITE_GOOGLE_MAPS_API_KEY:-}\";"
} > "$ENV_JS_PATH"

exec nginx -g "daemon off;"
