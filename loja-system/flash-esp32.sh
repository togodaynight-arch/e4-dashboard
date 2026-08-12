#!/bin/bash
# Grava o firmware no ESP32 sem precisar do Arduino IDE
# Uso: bash flash-esp32.sh

set -e

echo "=== Flash ESP32 - Loja System ==="

# Instala esptool se necessario
if ! command -v esptool.py &> /dev/null && ! command -v esptool &> /dev/null; then
    echo "Instalando esptool..."
    pip3 install esptool || pip install esptool
fi

ESPTOOL=$(command -v esptool.py || command -v esptool || echo "")
if [ -z "$ESPTOOL" ]; then
    echo "ERRO: esptool nao encontrado. Instale manualmente: pip install esptool"
    exit 1
fi

# Detecta porta automaticamente
PORT=""
if [ "$(uname -s)" = "Darwin" ]; then
    PORT=$(ls /dev/cu.* 2>/dev/null | grep -i -E "usbserial|usbmodem|SLAB" | head -n1)
else
    PORT=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null | head -n1)
fi

if [ -z "$PORT" ]; then
    echo "ERRO: ESP32 nao detectado. Conecte o ESP32 via USB e tente novamente."
    exit 1
fi

echo "ESP32 detectado em: $PORT"

DIR="$(cd "$(dirname "$0")" && pwd)"
FW="$DIR/firmware/esp32-led-controller.ino.merged.bin"

echo "Gravando firmware completo..."
$ESPTOOL --chip esp32 --port "$PORT" --baud 921600 \
    --before default_reset --after hard_reset \
    write_flash -z --flash_mode dio --flash_freq 80m --flash_size 4MB \
    0x0 "$FW"

echo "=== Firmware gravado com sucesso! ==="
echo "Reinicie o ESP32 desplugando e plugando novamente se necessario."
echo "IP do ESP32: 192.168.0.200"
