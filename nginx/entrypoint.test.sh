#!/bin/sh
set -eu

ENV_JS_PATH="/usr/share/nginx/html-test/env.js"
NGINX_CONF_PATH="/etc/nginx/conf.d/default.conf"
SMARTOLT_GET_ODBS_URL="${SMARTOLT_GET_ODBS_URL:-https://geonet-cl.smartolt.com/api/system/get_odbs}"
SMARTOLT_X_TOKEN="${SMARTOLT_X_TOKEN:-}"

escape_for_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

SMARTOLT_GET_ODBS_URL_ESCAPED="$(escape_for_sed "$SMARTOLT_GET_ODBS_URL")"
SMARTOLT_X_TOKEN_ESCAPED="$(escape_for_sed "$SMARTOLT_X_TOKEN")"

sed -i "s|__SMARTOLT_GET_ODBS_URL__|${SMARTOLT_GET_ODBS_URL_ESCAPED}|g" "$NGINX_CONF_PATH"
sed -i "s|__SMARTOLT_X_TOKEN__|${SMARTOLT_X_TOKEN_ESCAPED}|g" "$NGINX_CONF_PATH"

# Generate runtime env file for the frontend (test path)
{
  echo "window.__ENV__ = window.__ENV__ || {};"
  echo "window.__ENV__.VITE_GOOGLE_MAPS_API_KEY = \"${VITE_GOOGLE_MAPS_API_KEY:-}\";"
} > "$ENV_JS_PATH"

exec nginx -g "daemon off;"
