#!/bin/bash
# Sistema de Boas-Vindas - Setup Automático
# Cole este comando no OpenCode do outro computador:
#
#   bash loja-system/setup.sh
#
# Isso vai:
#   1. Instalar o esptool (leve, só para gravar o ESP32)
#   2. Gravar o firmware já compilado no ESP32
#   3. Iniciar o monitor de boas-vindas
#   NÃO precisa instalar Arduino IDE!

set -e

echo "========================================"
echo "  SISTEMA DE BOAS-VINDAS - SETUP"
echo "========================================"
echo ""

OS="$(uname -s)"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "1. Instalando esptool (ferramenta para gravar ESP32)..."
if ! command -v esptool.py &> /dev/null && ! command -v esptool &> /dev/null; then
    if command -v pip3 &> /dev/null; then
        pip3 install esptool
    elif command -v pip &> /dev/null; then
        pip install esptool
    else
        echo "   AVISO: pip não encontrado. Instale Python + pip primeiro."
        echo "   Ou use o script flash-esp32.sh depois de instalar o esptool."
    fi
else
    echo "   esptool já instalado."
fi

echo ""
echo "2. Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "   Node.js não encontrado. Instalando..."
    if [ "$OS" = "Darwin" ]; then
        if ! command -v brew &> /dev/null; then
            echo "   Instalando Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node
    elif [ "$OS" = "Linux" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "   Por favor instale Node.js manualmente: https://nodejs.org"
        exit 1
    fi
else
    echo "   Node.js já instalado."
fi

echo ""
echo "3. Firmware do ESP32..."
echo "   O firmware já está compilado em: loja-system/firmware/"
echo "   Para gravar no ESP32, conecte o ESP32 via USB e rode:"
echo "     bash loja-system/flash-esp32.sh"
echo ""

echo "4. Instruções finais:"
echo "   - O ESP32 já está configurado para a rede: NETPARQUE-DIEGO"
echo "   - IP fixo do ESP32: 192.168.0.200"
echo "   - Abra welcome.html no navegador"
echo "   - Ou rode: node server-welcome.js"
echo "   - Acesse: http://localhost:3002"
echo "   - Painel de configuração: pressione C na página"
echo ""

echo "========================================"
echo "  SETUP PRONTO!"
echo "========================================"
