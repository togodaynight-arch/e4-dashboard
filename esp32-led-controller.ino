/*
 * esp32-led-controller.ino
 * Controlador completo de fita LED RGB/RGBW via WiFi
 * Suporte a cores personalizadas, efeitos, brilho e controle HTTP
 *
 * Conexões:
 * - LED Data: GPIO 4 (configurável)
 * - Alimentação LED: 5V externa (NÃO usar 5V do ESP32!)
 * - GND comum entre ESP32 e fonte LED
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_NeoPixel.h>

// ========== CONFIGURAÇÃO WIFI ==========
const char* WIFI_SSID = "NETPARQUE-DIEGO";    // Rede da loja
const char* WIFI_PASS = "NPQ274950";          // Senha da rede

// IP fixo do ESP32 na rede (evita mudar a cada reboot)
IPAddress local_IP(192, 168, 0, 200);
IPAddress gateway(192, 168, 0, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns1(8, 8, 8, 8);
IPAddress dns2(8, 8, 4, 4);

// ========== CONFIGURAÇÃO LED ==========
// Múltiplas fitas LED. Configure quantas quiser aqui.
#define LED_TYPE    NEO_GRB   // Ordem de cor para WS2812B. Alternativas: NEO_RGB, NEO_RBG, NEO_BGR, NEO_GRBW
#define LED_BRIGHT  50        // Brilho padrão (0-255)

struct FitaConfig {
    int pino;
    int qtdLeds;
    Adafruit_NeoPixel* strip;
};

// =============================================================
// CONFIGURACAO DAS FITAS - ALTERE AQUI OS PINOS E QUANTIDADE DE LEDS
// =============================================================
// Formato: {GPIO, quantidade_de_LEDs, ponteiro}
// Exemplos de GPIOs seguros no ESP32 DevKit: 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
// Evite: 6, 7, 8, 9, 10, 11 (usados pela flash) e 0, 1, 3 (boot/serial)
//
// AJUSTE OS PINOS ABAIXO CONFORME A SUA LIGACAO FISICA:
// 4 fitas de 10m cada = 600 LEDs por fita (60 LED/m, WS2811 12V)
FitaConfig fitas[] = {
    {4, 600, nullptr},   // Fita 1 - GPIO 4 - 10 metros
    {5, 600, nullptr},   // Fita 2 - GPIO 5 - 10 metros
    {18, 600, nullptr},  // Fita 3 - GPIO 18 - 10 metros
    {19, 600, nullptr}   // Fita 4 - GPIO 19 - 10 metros
};
const int NUM_FITAS = sizeof(fitas) / sizeof(fitas[0]);

WebServer server(80);

// ========== ESTADO ==========
String corAtual = "#000000";
String efeitoAtual = "apagado";
int brilhoAtual = LED_BRIGHT;
int velocidadeAtual = 50;       // 1-100
bool ligado = false;
String ordemCor = "grb";        // grb, rgb, rbg, gbr, brg, bgr

unsigned long lastFrame = 0;
int framePhase = 0;
int chasePos = 0;

// Modo teste individual: mantem a fita acesa por X segundos
bool testandoFita = false;
int fitaEmTeste = -1;
String corEmTeste = "";
unsigned long manterAte = 0;

// Cores pré-definidas
struct CorPredefinida {
    String nome;
    String hex;
};
CorPredefinida coresPredefinidas[] = {
    {"amarelo", "#ffaa00"},
    {"laranja", "#ff6600"},
    {"verde",   "#00ff00"},
    {"vermelho","#ff0000"},
    {"azul",    "#0000ff"},
    {"roxo",    "#8800ff"},
    {"rosa",    "#ff00aa"},
    {"branco",  "#ffffff"},
    {"branco_quente", "#ffddaa"},
    {"apagado", "#000000"}
};

// ========== FUNÇÕES DE COR ==========

// Converte hex #RRGGBB ou #RRGGBBW para RGBW, respeitando ordemCor
void hexParaRGBW(String hex, uint8_t &r, uint8_t &g, uint8_t &b, uint8_t &w) {
    hex.replace("#", "");
    hex.toUpperCase();
    if (hex.length() < 6) {
        r = g = b = w = 0;
        return;
    }
    uint8_t v0 = (uint8_t)strtol(hex.substring(0, 2).c_str(), NULL, 16);
    uint8_t v1 = (uint8_t)strtol(hex.substring(2, 4).c_str(), NULL, 16);
    uint8_t v2 = (uint8_t)strtol(hex.substring(4, 6).c_str(), NULL, 16);

    // Aplica ordem de cor configurada
    String o = ordemCor;
    o.toLowerCase();
    if (o == "rgb") { r = v0; g = v1; b = v2; }
    else if (o == "rbg") { r = v0; b = v1; g = v2; }
    else if (o == "grb") { g = v0; r = v1; b = v2; }
    else if (o == "gbr") { g = v0; b = v1; r = v2; }
    else if (o == "brg") { b = v0; r = v1; g = v2; }
    else if (o == "bgr") { b = v0; g = v1; r = v2; }
    else { g = v0; r = v1; b = v2; } // padrao grb

    if (hex.length() >= 8) {
        w = (uint8_t)strtol(hex.substring(6, 8).c_str(), NULL, 16);
    } else {
        // Para fitas RGBW, calcula canal branco proporcional
        w = min(r, min(g, b));
    }
}

String encontrarHexPorNome(String nome) {
    nome.toLowerCase();
    for (int i = 0; i < sizeof(coresPredefinidas)/sizeof(coresPredefinidas[0]); i++) {
        if (coresPredefinidas[i].nome == nome) return coresPredefinidas[i].hex;
    }
    return "";
}

uint32_t corComBrilho(uint8_t r, uint8_t g, uint8_t b, uint8_t w, int brilho) {
    if (LED_TYPE == NEO_GRBW) {
        return fitas[0].strip->Color(
            r * brilho / 255,
            g * brilho / 255,
            b * brilho / 255,
            w * brilho / 255
        );
    } else {
        return fitas[0].strip->Color(
            r * brilho / 255,
            g * brilho / 255,
            b * brilho / 255
        );
    }
}

void setPixelColorTodas(int i, uint32_t cor) {
    for (int f = 0; f < NUM_FITAS; f++) {
        if (i < fitas[f].qtdLeds) {
            fitas[f].strip->setPixelColor(i, cor);
        }
    }
}

void showTodas() {
    for (int f = 0; f < NUM_FITAS; f++) {
        fitas[f].strip->show();
    }
}

void setBrightnessTodas(int b) {
    for (int f = 0; f < NUM_FITAS; f++) {
        fitas[f].strip->setBrightness(b);
    }
}

void clearTodas() {
    for (int f = 0; f < NUM_FITAS; f++) {
        fitas[f].strip->clear();
    }
}

int maxLeds() {
    int max = 0;
    for (int f = 0; f < NUM_FITAS; f++) {
        if (fitas[f].qtdLeds > max) max = fitas[f].qtdLeds;
    }
    return max;
}

void setTodosLEDsCor(String hex) {
    uint8_t r, g, b, w;
    hexParaRGBW(hex, r, g, b, w);
    int maxLed = maxLeds();
    for (int i = 0; i < maxLed; i++) {
        setPixelColorTodas(i, corComBrilho(r, g, b, w, brilhoAtual));
    }
    showTodas();
}

void apagarLEDs() {
    testandoFita = false;
    fitaEmTeste = -1;
    corAtual = "#000000";
    efeitoAtual = "apagado";
    ligado = false;
    clearTodas();
    showTodas();
}

// ========== CONTROLE DE FITA INDIVIDUAL ==========
void setPixelColorFita(int idxFita, int i, uint32_t cor) {
    if (idxFita >= 0 && idxFita < NUM_FITAS && i < fitas[idxFita].qtdLeds) {
        fitas[idxFita].strip->setPixelColor(i, cor);
    }
}

void showFita(int idxFita) {
    if (idxFita >= 0 && idxFita < NUM_FITAS) {
        fitas[idxFita].strip->show();
    }
}

void clearFita(int idxFita) {
    if (idxFita >= 0 && idxFita < NUM_FITAS) {
        fitas[idxFita].strip->clear();
    }
}

void setFitaCor(int idxFita, String hex) {
    if (idxFita < 0 || idxFita >= NUM_FITAS) return;
    uint8_t r, g, b, w;
    hexParaRGBW(hex, r, g, b, w);
    for (int i = 0; i < fitas[idxFita].qtdLeds; i++) {
        fitas[idxFita].strip->setPixelColor(i, corComBrilho(r, g, b, w, brilhoAtual));
    }
    fitas[idxFita].strip->show();
}

void apagarFita(int idxFita) {
    if (idxFita < 0 || idxFita >= NUM_FITAS) return;
    clearFita(idxFita);
    showFita(idxFita);
}

// ========== EFEITOS ==========

void efeitoSolido() {
    setTodosLEDsCor(corAtual);
}

void efeitoPulso() {
    int brilho = 50 + (205 * (sin(framePhase * 0.05) + 1)) / 2;
    uint8_t r, g, b, w;
    hexParaRGBW(corAtual, r, g, b, w);
    int maxLed = maxLeds();
    for (int i = 0; i < maxLed; i++) {
        setPixelColorTodas(i, corComBrilho(r, g, b, w, brilho));
    }
    showTodas();
    framePhase++;
}

void efeitoChase() {
    uint8_t r, g, b, w;
    hexParaRGBW(corAtual, r, g, b, w);
    int maxLed = maxLeds();
    for (int i = 0; i < maxLed; i++) {
        int dist = abs(i - chasePos);
        int brilho = max(0, 255 - dist * 8);
        setPixelColorTodas(i, corComBrilho(r, g, b, w, brilho * brilhoAtual / 255));
    }
    showTodas();
    chasePos = (chasePos + 2) % maxLed;
}

void efeitoArcoIris() {
    int maxLed = maxLeds();
    for (int i = 0; i < maxLed; i++) {
        int hue = (framePhase * 2 + i * 5) % 65536;
        uint32_t cor = fitas[0].strip->gamma32(fitas[0].strip->ColorHSV(hue));
        uint8_t r = (cor >> 16) & 0xFF;
        uint8_t g = (cor >> 8) & 0xFF;
        uint8_t b = cor & 0xFF;
        setPixelColorTodas(i, corComBrilho(r, g, b, 0, brilhoAtual));
    }
    showTodas();
    framePhase++;
}

void efeitoConfete() {
    int maxLed = maxLeds();
    for (int i = 0; i < maxLed; i++) {
        if (random(100) < 5) {
            uint32_t cor = fitas[0].strip->gamma32(fitas[0].strip->ColorHSV(random(65536)));
            uint8_t r = (cor >> 16) & 0xFF;
            uint8_t g = (cor >> 8) & 0xFF;
            uint8_t b = cor & 0xFF;
            setPixelColorTodas(i, corComBrilho(r, g, b, 0, brilhoAtual));
        } else {
            uint32_t c = 0;
            for (int f = 0; f < NUM_FITAS; f++) {
                if (i < fitas[f].qtdLeds) {
                    c = fitas[f].strip->getPixelColor(i);
                    uint8_t r = ((c >> 16) & 0xFF) * 95 / 100;
                    uint8_t g = ((c >> 8) & 0xFF) * 95 / 100;
                    uint8_t b = (c & 0xFF) * 95 / 100;
                    fitas[f].strip->setPixelColor(i, fitas[0].strip->Color(r, g, b));
                }
            }
        }
    }
    showTodas();
}

void efeitoOnda() {
    uint8_t r, g, b, w;
    hexParaRGBW(corAtual, r, g, b, w);
    int maxLed = maxLeds();
    for (int i = 0; i < maxLed; i++) {
        int brilho = 50 + 205 * abs(sin((framePhase + i) * 0.1));
        setPixelColorTodas(i, corComBrilho(r, g, b, w, brilho * brilhoAtual / 255));
    }
    showTodas();
    framePhase++;
}

void executarEfeito() {
    // Se estiver em modo teste individual, mantem a fita acesa
    if (testandoFita) {
        if (millis() >= manterAte) {
            testandoFita = false;
            fitaEmTeste = -1;
            apagarLEDs();
        } else {
            setFitaCor(fitaEmTeste, corEmTeste);
        }
        return;
    }

    if (!ligado || efeitoAtual == "apagado") {
        apagarLEDs();
        return;
    }

    unsigned long intervalo = map(velocidadeAtual, 1, 100, 200, 10);
    if (millis() - lastFrame < intervalo) return;
    lastFrame = millis();

    if (efeitoAtual == "solido") efeitoSolido();
    else if (efeitoAtual == "pulso") efeitoPulso();
    else if (efeitoAtual == "chase") efeitoChase();
    else if (efeitoAtual == "arcoiris") efeitoArcoIris();
    else if (efeitoAtual == "confete") efeitoConfete();
    else if (efeitoAtual == "onda") efeitoOnda();
    else efeitoSolido();
}

// ========== SERVIDOR HTTP ==========

void handleComando() {
    String resposta = "{\"ok\":false,\"erro\":\"requisicao invalida\"}";
    int code = 400;

    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        String bodyLow = body;
        bodyLow.toLowerCase();

        // Comandos simples compatíveis com versão anterior
        if (bodyLow.indexOf("\"amarelo\"") != -1 || bodyLow.indexOf("amarelo") != -1) {
            corAtual = "#ffaa00";
            efeitoAtual = "solido";
            ligado = true;
            resposta = "{\"ok\":true,\"cor\":\"" + corAtual + "\",\"efeito\":\"" + efeitoAtual + "\"}";
            code = 200;
        }
        else if (bodyLow.indexOf("\"verde\"") != -1 || bodyLow.indexOf("verde") != -1) {
            corAtual = "#00ff00";
            efeitoAtual = "solido";
            ligado = true;
            resposta = "{\"ok\":true,\"cor\":\"" + corAtual + "\",\"efeito\":\"" + efeitoAtual + "\"}";
            code = 200;
        }
        else if (bodyLow.indexOf("\"apagar\"") != -1 || bodyLow.indexOf("apagar") != -1) {
            apagarLEDs();
            resposta = "{\"ok\":true,\"cor\":\"#000000\",\"efeito\":\"apagado\"}";
            code = 200;
        }
        // JSON avançado
        else if (bodyLow.indexOf("\"comando\"") != -1 || bodyLow.indexOf("\"cor\"") != -1 || bodyLow.indexOf("\"efeito\"") != -1) {
            // Extrai cor (mantem case original para hex)
            int idxCor = body.indexOf("\"cor\":");
            if (idxCor != -1) {
                int idxVal = body.indexOf("\"", idxCor + 6);
                if (idxVal != -1) {
                    int idxFim = body.indexOf("\"", idxVal + 1);
                    String hex = body.substring(idxVal + 1, idxFim);
                    if (hex.startsWith("#")) corAtual = hex;
                    else {
                        String hexNome = encontrarHexPorNome(hex);
                        if (hexNome != "") corAtual = hexNome;
                    }
                }
            }

            // Extrai efeito
            int idxEfeito = bodyLow.indexOf("\"efeito\":");
            if (idxEfeito != -1) {
                int idxVal = body.indexOf("\"", idxEfeito + 9);
                if (idxVal != -1) {
                    int idxFim = body.indexOf("\"", idxVal + 1);
                    efeitoAtual = body.substring(idxVal + 1, idxFim);
                    efeitoAtual.toLowerCase();
                }
            }

            // Extrai brilho
            int idxBrilho = bodyLow.indexOf("\"brilho\":");
            if (idxBrilho != -1) {
                int idxVal = idxBrilho + 9;
                int idxFim = bodyLow.indexOf(",", idxVal);
                if (idxFim == -1) idxFim = bodyLow.indexOf("}", idxVal);
                String val = body.substring(idxVal, idxFim);
                brilhoAtual = constrain(val.toInt(), 0, 255);
                setBrightnessTodas(brilhoAtual);
            }

            // Extrai velocidade
            int idxVel = bodyLow.indexOf("\"velocidade\":");
            if (idxVel != -1) {
                int idxVal = idxVel + 13;
                int idxFim = bodyLow.indexOf(",", idxVal);
                if (idxFim == -1) idxFim = bodyLow.indexOf("}", idxVal);
                String val = body.substring(idxVal, idxFim);
                velocidadeAtual = constrain(val.toInt(), 1, 100);
            }

            // Extrai índice da fita
            int idxFita = -1;
            int idxFitaKey = bodyLow.indexOf("\"fita\":");
            if (idxFitaKey != -1) {
                int idxVal = idxFitaKey + 7;
                int idxFim = bodyLow.indexOf(",", idxVal);
                if (idxFim == -1) idxFim = bodyLow.indexOf("}", idxVal);
                String val = body.substring(idxVal, idxFim);
                idxFita = constrain(val.toInt(), 0, NUM_FITAS - 1);
            }

            // Comando específico
            int idxCmd = bodyLow.indexOf("\"comando\":");
            bool temEfeito = bodyLow.indexOf("\"efeito\":") != -1;
            String cmd = "";
            if (idxCmd != -1) {
                int idxVal = body.indexOf("\"", idxCmd + 10);
                int idxFim = body.indexOf("\"", idxVal + 1);
                cmd = body.substring(idxVal + 1, idxFim);
                cmd.toLowerCase();
                if (cmd == "ligar") ligado = true;
                else if (cmd == "desligar") { apagarLEDs(); }
                else if (cmd == "cor") {
                    ligado = true;
                    if (!temEfeito) efeitoAtual = "solido";
                }
                else if (cmd == "config") {
                    // Apenas confirma config (os valores ja foram aplicados acima)
                    ligado = true;
                    if (!temEfeito && corAtual != "#000000") efeitoAtual = "solido";
                }
            }

            // Extrai ordem de cor
            int idxOrdem = bodyLow.indexOf("\"ordem_cor\":");
            if (idxOrdem != -1) {
                int idxVal = body.indexOf("\"", idxOrdem + 12);
                if (idxVal != -1) {
                    int idxFim = body.indexOf("\"", idxVal + 1);
                    String novaOrdem = body.substring(idxVal + 1, idxFim);
                    novaOrdem.toLowerCase();
                    if (novaOrdem == "grb" || novaOrdem == "rgb" || novaOrdem == "rbg" ||
                        novaOrdem == "gbr" || novaOrdem == "brg" || novaOrdem == "bgr") {
                        ordemCor = novaOrdem;
                        Serial.println("[CONFIG] Ordem de cor alterada para: " + ordemCor);
                    }
                }
            }

            if (idxFita >= 0) {
                // Teste de fita individual: aplica imediatamente na fita escolhida
                if (corAtual == "#000000" || bodyLow.indexOf("\"apagar\"") != -1) {
                    testandoFita = false;
                    apagarFita(idxFita);
                    resposta = "{\"ok\":true,\"fita\":" + String(idxFita) + ",\"acao\":\"apagar\"}";
                } else {
                    setFitaCor(idxFita, corAtual);
                    // Mantem a fita acesa por 10 segundos (ou duracao especificada)
                    int duracaoTeste = 10000;
                    int idxDur = bodyLow.indexOf("\"duracao\":");
                    if (idxDur == -1) idxDur = bodyLow.indexOf("\"tempo\":");
                    if (idxDur != -1) {
                        int idxVal = bodyLow.indexOf(":", idxDur) + 1;
                        int idxFim = bodyLow.indexOf(",", idxVal);
                        if (idxFim == -1) idxFim = bodyLow.indexOf("}", idxVal);
                        String val = body.substring(idxVal, idxFim);
                        duracaoTeste = constrain(val.toInt() * 1000, 1000, 60000);
                    }
                    testandoFita = true;
                    fitaEmTeste = idxFita;
                    corEmTeste = corAtual;
                    manterAte = millis() + duracaoTeste;
                    resposta = "{\"ok\":true,\"fita\":" + String(idxFita) + ",\"cor\":\"" + corAtual + "\",\"brilho\":" + String(brilhoAtual) + ",\"duracao\":\"" + String(duracaoTeste/1000) + "s\"}";
                }
                code = 200;
            } else {
                if (efeitoAtual != "apagado") ligado = true;
                if (corAtual != "#000000" && efeitoAtual == "apagado") {
                    efeitoAtual = "solido";
                    ligado = true;
                }

                resposta = "{\"ok\":true,\"cor\":\"" + corAtual + "\",\"efeito\":\"" + efeitoAtual + "\",\"brilho\":" + String(brilhoAtual) + "}";
                code = 200;

                // Reset de efeitos que usam fase
                framePhase = 0;
                chasePos = 0;
            }
        }
        else {
            resposta = "{\"ok\":false,\"erro\":\"comando nao reconhecido\"}";
            code = 400;
        }
    }

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(code, "application/json", resposta);
}

void handleStatus() {
    String json = "{";
    json += "\"cor\":\"" + corAtual + "\",";
    json += "\"efeito\":\"" + efeitoAtual + "\",";
    json += "\"brilho\":" + String(brilhoAtual) + ",";
    json += "\"velocidade\":" + String(velocidadeAtual) + ",";
    json += "\"ligado\":" + String(ligado ? "true" : "false") + ",";
    json += "\"ordem_cor\":\"" + ordemCor + "\",";
    json += "\"fitas\":[";
    for (int f = 0; f < NUM_FITAS; f++) {
        json += "{\"pino\":" + String(fitas[f].pino) + ",\"leds\":" + String(fitas[f].qtdLeds) + "}";
        if (f < NUM_FITAS - 1) json += ",";
    }
    json += "],";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\"";
    json += "}";
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(200, "application/json", json);
}

void handleCores() {
    String json = "[";
    int total = sizeof(coresPredefinidas)/sizeof(coresPredefinidas[0]);
    for (int i = 0; i < total; i++) {
        json += "{\"nome\":\"" + coresPredefinidas[i].nome + "\",\"hex\":\"" + coresPredefinidas[i].hex + "\"}";
        if (i < total - 1) json += ",";
    }
    json += "]";
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(200, "application/json", json);
}

void handleEfeitos() {
    String json = "[";
    String efeitos[] = {"solido", "pulso", "chase", "arcoiris", "confete", "onda", "apagado"};
    for (int i = 0; i < 7; i++) {
        json += "\"" + efeitos[i] + "\"";
        if (i < 6) json += ",";
    }
    json += "]";
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(200, "application/json", json);
}

// Testa uma fita especifica: pisca na cor escolhida e apaga
void handleTeste() {
    String resposta = "{\"ok\":false,\"erro\":\"requisicao invalida\"}";
    int code = 400;

    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        String bodyLow = body;
        bodyLow.toLowerCase();

        // Extrai fita
        int idxFita = 0;
        int idxFitaKey = bodyLow.indexOf("\"fita\":");
        if (idxFitaKey != -1) {
            int idxVal = idxFitaKey + 7;
            int idxFim = bodyLow.indexOf(",", idxVal);
            if (idxFim == -1) idxFim = bodyLow.indexOf("}", idxVal);
            String val = body.substring(idxVal, idxFim);
            idxFita = constrain(val.toInt(), 0, NUM_FITAS - 1);
        }

        // Extrai cor (mantem case original)
        String hex = "#ffaa00";
        int idxCor = body.indexOf("\"cor\":");
        if (idxCor != -1) {
            int idxVal = body.indexOf("\"", idxCor + 6);
            if (idxVal != -1) {
                int idxFim = body.indexOf("\"", idxVal + 1);
                hex = body.substring(idxVal + 1, idxFim);
            }
        }

        int duracao = 2000;
        int idxDur = bodyLow.indexOf("\"duracao\":");
        if (idxDur == -1) idxDur = bodyLow.indexOf("\"tempo\":");
        if (idxDur != -1) {
            int idxVal = bodyLow.indexOf(":", idxDur) + 1;
            int idxFim = bodyLow.indexOf(",", idxVal);
            if (idxFim == -1) idxFim = bodyLow.indexOf("}", idxVal);
            String val = body.substring(idxVal, idxFim);
            duracao = constrain(val.toInt(), 100, 10000);
        }

        Serial.println("[TESTE] Fita " + String(idxFita) + " cor " + hex + " por " + String(duracao) + "ms");

        // Pisca a fita escolhida 2x
        uint8_t r, g, b, w;
        hexParaRGBW(hex, r, g, b, w);
        for (int p = 0; p < 2; p++) {
            setFitaCor(idxFita, hex);
            delay(300);
            apagarFita(idxFita);
            delay(200);
        }
        setFitaCor(idxFita, hex);

        resposta = "{\"ok\":true,\"fita\":" + String(idxFita) + ",\"cor\":\"" + hex + "\",\"duracao\":" + String(duracao) + "}";
        code = 200;
    }

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(code, "application/json", resposta);
}

void handleOptions() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(204);
}

// Reinicia o ESP32 remotamente
void handleReboot() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(200, "application/json", "{\"ok\":true,\"msg\":\"reiniciando\"}");
    Serial.println("[REBOOT] Reiniciando ESP32 por comando remoto...");
    delay(500);
    ESP.restart();
}

// ========== SETUP ==========

void setup() {
    Serial.begin(115200);

    // Inicializa todas as fitas LED
    for (int f = 0; f < NUM_FITAS; f++) {
        fitas[f].strip = new Adafruit_NeoPixel(fitas[f].qtdLeds, fitas[f].pino, LED_TYPE + NEO_KHZ800);
        fitas[f].strip->begin();
        fitas[f].strip->setBrightness(brilhoAtual);
    }
    apagarLEDs();

    // Teste sequencial: pisca cada fita individualmente na cor vermelha
    // Isso ajuda a identificar se cada fita está ligada no pino correto
    Serial.println("[TESTE] Iniciando teste sequencial das fitas...");
    for (int f = 0; f < NUM_FITAS; f++) {
        Serial.print("[TESTE] Fita ");
        Serial.print(f);
        Serial.print(" no GPIO ");
        Serial.println(fitas[f].pino);

        for (int i = 0; i < fitas[f].qtdLeds; i++) {
            fitas[f].strip->setPixelColor(i, fitas[f].strip->Color(50, 0, 0));
        }
        fitas[f].strip->show();
        delay(400);
        fitas[f].strip->clear();
        fitas[f].strip->show();
        delay(200);
    }
    Serial.println("[TESTE] Teste sequencial concluido");

    // Configura IP fixo
    if (!WiFi.config(local_IP, gateway, subnet, dns1, dns2)) {
        Serial.println("Falha ao configurar IP fixo");
    }

    // Conecta WiFi
    Serial.print("Conectando WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED && tentativas < 30) {
        delay(1000);
        Serial.print(".");
        tentativas++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi OK!");
        Serial.print("IP: ");
        Serial.println(WiFi.localIP());
        int maxLed = maxLeds();
        for (int i = 0; i < maxLed; i++) {
            setPixelColorTodas(i, fitas[0].strip->Color(0, 50, 0));
        }
        showTodas();
        delay(300);
        apagarLEDs();
    } else {
        Serial.println("\nWiFi FALHOU!");
        int maxLed = maxLeds();
        for (int i = 0; i < 10; i++) {
            for (int j = 0; j < maxLed; j++) setPixelColorTodas(j, fitas[0].strip->Color(50, 0, 0));
            showTodas();
            delay(200);
            apagarLEDs();
            delay(200);
        }
    }

    // Rotas HTTP
    server.on("/comando", HTTP_POST, handleComando);
    server.on("/comando", HTTP_OPTIONS, handleOptions);
    server.on("/status", handleStatus);
    server.on("/status", HTTP_OPTIONS, handleOptions);
    server.on("/cores", handleCores);
    server.on("/cores", HTTP_OPTIONS, handleOptions);
    server.on("/efeitos", handleEfeitos);
    server.on("/efeitos", HTTP_OPTIONS, handleOptions);
    server.on("/teste", HTTP_POST, handleTeste);
    server.on("/teste", HTTP_OPTIONS, handleOptions);
    server.on("/reboot", HTTP_GET, handleReboot);
    server.on("/reboot", HTTP_POST, handleReboot);
    server.on("/reboot", HTTP_OPTIONS, handleOptions);
    server.begin();
    Serial.println("Servidor HTTP iniciado na porta 80");
}

// ========== LOOP ==========

unsigned long lastWifiCheck = 0;

void loop() {
    server.handleClient();
    executarEfeito();

    // Reconexao WiFi a cada 10 segundos se desconectado
    if (millis() - lastWifiCheck > 10000) {
        lastWifiCheck = millis();
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi] Reconectando...");
            WiFi.reconnect();
        }
    }

    delay(1);
}
