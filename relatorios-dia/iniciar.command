#!/bin/bash
cd "$(dirname "$0")"
echo "Iniciando Relatorios Diarios..."
node server.js &
sleep 2
echo "Abrindo http://localhost:3003"
open http://localhost:3003
echo ""
echo "Pressione ENTER para parar..."
read
kill $(lsof -t -i :3003) 2>/dev/null
echo "Servidor parado."
