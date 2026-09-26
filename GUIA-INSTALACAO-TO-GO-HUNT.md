# GUIA DE INSTALAÇÃO — TO GO HUNT (V1)

Guia para uma pessoa **sem conhecimento de programação** instalar o sistema completo em **uma** prateleira de **uma** loja.

---

## 1. Materiais

| Item | Quantidade | Observação |
| --- | --- | --- |
| ESP32 (DevKit V1 / 38 pinos) | 1 | Placa controladora |
| Fita LED WS2811 12V endereçável | 1 trecho de ~20 cm | 60 LED/m → ±12 LEDs |
| Fonte 12V | 1 | Pode ser 12V 1A (trecho curto) |
| Cabo USB (dados) | 1 | Para gravar o ESP32 |
| Cabos / conectores | conforme | Para ligar fonte → fita |
| Caixa / proteção | 1 | Para guardar o ESP32 |
| Monitor / TV | 1 | Tela do cliente |
| Mini PC / notebook | 1 | Opcional — para abrir o monitor, ou use a própria TV/box |
| QR Code impresso | 1 | Gerado no painel admin |
| Suporte / fita dupla-face | conforme | Para fixar a fita na prateleira |

> **Atenção:** NUNCA ligue os 12V diretamente no ESP32. A fita recebe 12V da fonte. O ESP32 só envia o sinal de DADOS (DATA) e compartilha o GND (aterramento).

---

## 2. Diagrama elétrico

```
        FONTE 12V
            │
      ┌─────┴─────┐
      │  +12V  GND │
      └─────┬─────┘
            │
   ┌────────┼────────────────────────────┐
   │        │                            │
   ▼        ▼                            │
 FITA WS2811                          ESP32
 [ +12V ]                          ┌──────────┐
 [ GND  ]──────────────────────────┤ GND      │
 [ DATA ]◄────────── GPIO 4 ───────┤ GPIO 4   │
                                   │ 5V (não usar) │
                                   └──────────┘
```

Regras:
- **+12V** da fonte → **+12V** da fita.
- **GND** da fonte → **GND** da fita **E** → **GND** do ESP32 (GND comum obrigatório).
- **DATA** da fita → **GPIO 4** do ESP32 (pino configurável no firmware).
- **NÃO** ligar o 12V no ESP32 (queima).
- **NÃO** alimentar a fita pelo USB do ESP32.
- Se a fita piscar errado ou ficar azulada, troque `NEO_RBG` por `NEO_RGB` no firmware (ordem de cor).

---

## 3. Diagrama de rede

```
ESP32 ──(Wi-Fi)──▶ Roteador ──▶ Internet ──▶ Servidor (Render)
                                              │
                                        TO GO HUNT (API + banco Firebase)
                                              │
Monitor/TV ──(Wi-Fi/Ethernet)──▶ navegador abre a página da campanha
```

- O **ESP32** fica na rede local e faz *polling* no servidor (não precisa de IP público).
- O **Monitor** abre a URL da campanha no navegador.
- O **celular do cliente** escaneia o QR Code, que aponta para a URL pública do servidor.

---

## 4. Instalação da fita

1. **Onde colocar:** na borda da prateleira escolhida, voltada para o corredor, onde o cliente consiga ver a luz.
2. **Como fixar:** fita dupla-face ou suporte em U. Limpe a superfície antes.
3. **Direção do LED:** a fita tem setas (`DATA IN` → `DATA OUT`). Ligue o **DATA IN** no ESP32.
4. **DATA IN / DATA OUT:** o fio de dados entra no início (DATA IN). O final (DATA OUT) não é usado em trecho curto.
5. **Alimentação:** +12V e GND entram na fita. Junte o GND da fita com o GND do ESP32.
6. **Proteção:** guarde o ESP32 numa caixinha para não pegar poeira/umidade.

---

## 5. Configuração do ESP32

1. Instale o **Arduino IDE** (ou use o `arduino-cli` já presente em `tools/bin`).
2. Abra o arquivo `togo-hunt/esp32/esp32.ino`.
3. No topo do arquivo, altere **somente**:
   - `WIFI_SSID` e `WIFI_PASS` (rede da loja);
   - `SERVER_URL` (URL do servidor no Render, ex. `https://togo-hunt.onrender.com`);
   - `DEVICE_ID` (ex. `esp32-1`) e `STORE_ID` (ex. `store1`);
   - `LED_PIN` (pino do DATA) e `NUM_LEDS` (número de LEDs).
4. Conecte o ESP32 no USB e grave o firmware.
5. Ao ligar, o ESP32 pisca 3 LEDs verdes (OK) e conecta no Wi-Fi.

**Compilar/gravar via terminal (macOS):**
```
./tools/bin/arduino-cli compile --fqbn esp32:esp32:esp32 \
  togo-hunt/esp32 --build-path build-esp32

./tools/bin/arduino-cli upload -p /dev/cu.usbserial-0001 \
  --fqbn esp32:esp32:esp32 --input-dir build-esp32 togo-hunt/esp32
```

---

## 6. Configuração do monitor

1. No monitor/TV (ou mini PC), abra o navegador na URL:
   `https://SEU-SERVIDOR.onrender.com/monitor`
2. Coloque em **tela cheia** (F11 no navegador).
3. Configure o navegador para **abrir em kiosk** na inicialização (ex.: Chrome com `--kiosk URL`, ou um app de TV Box que abra o site).
4. A tela alterna sozinha entre as 5 telas (desafio → prateleira → QR → ranking → desafio).

---

## 7. Criar o primeiro desafio

1. Abra o painel admin: `https://SEU-SERVIDOR.onrender.com/admin`
2. Login: usuário `admin`, senha `togo2026` (altere depois).
3. Em **Desafios → Novo desafio**, preencha:
   - Nome: `Encontre o produto secreto`
   - Descrição: `Procure a prateleira iluminada e escaneie o QR Code.`
   - Pontos: `10`
   - Loja: `store1`
   - Ativo: marcado
4. Clique em **Criar desafio**.

---

## 8. Gerar o QR Code

- No painel admin, cada desafio mostra o **QR Code** pronto (imagem) e a **URL**.
- Imprima o QR e cole na prateleira iluminada, ao lado da fita.
- A URL tem o formato `https://SEU-SERVIDOR.onrender.com/hunt/SLUG`.

---

## 9. Testar (checklist)

- [ ] ESP32 conectado ao Wi-Fi (LED pisca verde ao ligar)
- [ ] LED funcionando (pulso quando o desafio está ativo)
- [ ] Monitor funcionando (tela alterna as 5 telas)
- [ ] QR funcionando (celular abre a página do desafio)
- [ ] Cadastro funcionando (digitar apelido)
- [ ] Pontos funcionando (+10 aparece)
- [ ] Ranking funcionando (apelido aparece no monitor)
- [ ] Bloqueio de duplicidade funcionando (2ª vez = "Já feito!")
- [ ] Animação de sucesso funcionando (LED corre e brilha)

---

## 10. Checklist de instalação (final)

- [ ] Fita fixada na prateleira
- [ ] Fonte 12V ligada e GND comum com o ESP32
- [ ] ESP32 gravado e conectado
- [ ] Monitor em kiosk/fullscreen
- [ ] Servidor no Render no ar
- [ ] Desafio criado e ativo no admin
- [ ] QR impresso e colado
- [ ] Teste de ponta a ponta feito

---

## 11. Backup e recuperação

**Backup (pontos/ranking):** os dados ficam no **Firebase Realtime Database** (`/togohunt`). Para exportar:
1. Acesse o console do Firebase → Realtime Database.
2. Menu "…" → **Exportar JSON**.
3. Guarde o arquivo em local seguro.

**Recuperação:**
1. No Firebase → Menu "…" → **Importar JSON**.
2. Selecione o arquivo do backup.

**Recuperação após reset acidental:** o botão "Resetar campanha" apaga apenas participações/pontos. Os desafios continuam. Para recriar pontos, o cliente apenas participa novamente.

---

## 12. Cadastrar um novo desafio (resumo rápido)

1. Abrir `/admin` → aba **Desafios**.
2. Preencher nome, descrição, pontos, loja e deixar **ativo**.
3. Clicar **Criar**.
4. Copiar/imprimir o **QR Code** e colar na nova prateleira (com uma nova fita LED, se for o caso).
5. Testar escaneando o QR.

---

## 13. Diagnóstico rápido

Abra `https://SEU-SERVIDOR.onrender.com/diagnostico` para ver em uma tela:
- Servidor 🟢
- Banco 🟢
- Desafio 🟢 (ativo/inativo)
- QR 🟢
- ESP32 🟢 (online/offline + último heartbeat)

Se algo estiver vermelho, confira a internet da loja e se o ESP32 está ligado.

---

## 14. Sensor de som (opcional) — KEYES KY-038

Opcional: dá para ligar um **sensor de som** para a fita acender com uma palma/barulho.

**Ligação (3 fios):**

| Sensor KEYES | ESP32 |
| --- | --- |
| VCC | 3.3V |
| GND | GND |
| DO (saída digital) | GPIO 32 |
| AO | (não usar) |

- O sensor tem um **parafuso pequeno** (potenciômetro) que ajusta a sensibilidade.
- Gire até o LED do sensor acender quando fizer barulho (palma) e ficar apagado no silêncio.
- Ao detectar som, a fita faz a **animação de comemoração** (corrida de luz) por ~4 segundos.

**Ajustes no código** (`esp32.ino`, na parte "SENSOR DE SOM"):
- `SOUND_HABILITADO`: `true` (ligado) ou `false` (desligado).
- `SOUND_PIN`: pino do DO (padrão `32`).
- `SOUND_NIVEL`: `LOW` (padrão). Se a fita não acender com som, troque por `HIGH`.

---

## 15. Sensor de presença (opcional) — PIR HC-SR501

Opcional: dá para ligar um **sensor de presença** (movimento) para a fita acender quando alguém se aproxima da prateleira.

**Ligação (3 fios):**

| Sensor HC-SR501 | ESP32 |
| --- | --- |
| VCC | **5V** (pino 5V/VIN) |
| GND | GND |
| OUT (saída) | **GPIO 33** |

- O sensor tem **dois parafusinhos** (potenciômetros): um ajusta a **distância** (alcance), o outro o **tempo** que fica ligado após detectar.
- O jumper (pino de 2 posições na lateral) pode ficar na posição de repetição (H) para reativar continuamente.
- Ao detectar movimento, a fita **acende com luz dourada** (chamada de atenção) por ~6 segundos.

**Ajustes no código** (`esp32.ino`, na parte "SENSOR DE PRESENCA"):
- `PRESENCA_HABILITADO`: `true` (ligado) ou `false` (desligado).
- `PRESENCA_PIN`: pino do OUT (padrão `33`).
- `PRESENCA_NIVEL`: `HIGH` (padrão). Se a fita não acender com movimento, troque por `LOW`.
- `PRESENCA_DURACAO`: tempo aceso em ms (padrão `6000` = 6s).
