#!/bin/sh
# Launch the Titan email MCP server.
#
# Credentials are read from ./.env by the server itself (src/env.ts), NOT sourced
# through the shell: `. .env` would expand $ inside a password and corrupt it.
set -e
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec node "$DIR/dist/index.js"
