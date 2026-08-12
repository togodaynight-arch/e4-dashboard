# Sistema de Boas-Vindas - Loja

Este pacote contém tudo pronto para rodar o sistema de boas-vindas com LED na loja.

## O que já está pronto

- Firmware do ESP32 já compilado (`firmware/`)
- Código fonte do ESP32 (`esp32-led-controller.ino`)
- Script para gravar o ESP32 sem Arduino IDE (`flash-esp32.sh`)
- Monitor de boas-vindas (`welcome.html`)
- Servidor local (`server-welcome.js`)

## Configuração do ESP32

O ESP32 já está configurado para:
- Rede WiFi: `NETPARQUE-DIEGO`
- Senha: `NPQ274950`
- IP fixo: `192.168.0.200`
- LED: GPIO 4, 240 LEDs, RGBW (fitas com branco)

## Como gravar o ESP32 no outro computador

1. Conecte o ESP32 via USB no computador
2. No OpenCode, rode:
   ```bash
   bash loja-system/flash-esp32.sh
   ```
3. Pronto! Não precisa instalar Arduino IDE.

O script vai instalar automaticamente o `esptool` (ferramenta leve) e gravar o firmware.

## Como iniciar o monitor

1. No OpenCode, rode:
   ```bash
   node loja-system/server-welcome.js
   ```
2. Abra no navegador: `http://localhost:3002`
3. Pressione `C` para abrir o painel de configuração
4. O IP do ESP32 já está configurado como `192.168.0.200`
5. Na aba **🎨 Controle Manual do LED** você pode:
   - Escolher qualquer cor
   - Aplicar efeitos (sólido, pulso, perseguição, arco-íris, confete, onda)
   - Ajustar brilho e velocidade
   - Desligar as fitas
   - Ver o status atual do ESP32

## Ligações do ESP32

- GPIO 4 → Data da fita LED WS2812B
- GND do ESP32 → GND da fonte LED (GND comum)
- 5V da fita LED → Fonte externa 5V (NÃO usar 5V do ESP32)
