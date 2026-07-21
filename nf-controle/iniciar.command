#!/bin/bash
cd "$(dirname "$0")"

echo "🧾 Controle NF & Boletos"
echo "========================"
echo ""

# Mata o servidor anterior se existir
kill $(lsof -t -i :3002) 2>/dev/null

# Inicia o servidor
node server.js &
sleep 2

echo "✅ Servidor rodando!"
echo "👉 Abrindo http://localhost:3002"
open http://localhost:3002

echo ""
echo "Pressione ENTER para parar o servidor..."
read

kill $(lsof -t -i :3002) 2>/dev/null
echo "🛑 Servidor parado."
