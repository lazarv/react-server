#!/usr/bin/env bash
set -euo pipefail

node -p "Object.entries(require('react')).filter(([key, value]) => typeof value === 'function').map(([key]) => key).sort().join('\n')" > react-exports.txt
node --conditions=react-server -p "Object.entries(require('react')).filter(([key, value]) => typeof value === 'function').map(([key]) => key).sort().join('\n')" > react-server-exports.txt

client_file=${1:-react-exports.txt}
server_file=${2:-react-server-exports.txt}

sort "$client_file" -o "$client_file"
sort "$server_file" -o "$server_file"

echo "["
comm -23 "$client_file" "$server_file" | while read -r spec; do
  [[ -z "$spec" ]] && continue
  echo "  \"$spec\","
done
echo "];"

rm react-exports.txt react-server-exports.txt