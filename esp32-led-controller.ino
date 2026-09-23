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
#define LED_TYPE    NEO_RBG   // Ordem de cor. Alternativas: NEO_RGB, NEO_GRB, NEO_BGR, NEO_GRBW
#define LED_BRIGHT  50        // Brilho padrão (0-255)

struct FitaConfig {
    int pino;
    int qtdLeds;
    Adafruit_NeoPixel* strip;
};

// Fitas conectadas ao ESP32
FitaConfig fitas[] = {
    {4, 240, nullptr},   // D4 - Fita principal 4m
    {5, 18,  nullptr},   // D5 - Fita 30cm
    {2, 18,  nullptr}    // D2 - Fita 30cm
};
const int NUM_FITAS = sizeof(fitas) / sizeof(fitas[0]);

WebServer server(80);

// ========== ESTADO ==========
String corAtual = "#000000";
String efeitoAtual = "apagado";
int brilhoAtual = LED_BRIGHT;
int velocidadeAtual = 50;       // 1-100
bool ligado = false;

unsigned long lastFrame = 0;
int framePhase = 0;
int chasePos = 0;

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

// Converte hex #RRGGBB ou #RRGGBBW para RGBW
void hexParaRGBW(String hex, uint8_t &r, uint8_t &g, uint8_t &b, uint8_t &w) {
    hex.replace("#", "");
    hex.toUpperCase();
    if (hex.length() < 6) {
        r = g = b = w = 0;
        return;
    }
    r = (uint8_t)strtol(hex.substring(0, 2).c_str(), NULL, 16);
    g = (uint8_t)strtol(hex.substring(2, 4).c_str(), NULL, 16);
    b = (uint8_t)strtol(hex.substring(4, 6).c_str(), NULL, 16);
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
        body.toLowerCase();

        // Comandos simples compatíveis com versão anterior
        if (body.indexOf("\"amarelo\"") != -1 || body.indexOf("amarelo") != -1) {
            corAtual = "#ffaa00";
            efeitoAtual = "solido";
            ligado = true;
            resposta = "{\"ok\":true,\"cor\":\"" + corAtual + "\",\"efeito\":\"" + efeitoAtual + "\"}";
            code = 200;
        }
        else if (body.indexOf("\"verde\"") != -1 || body.indexOf("verde") != -1) {
            corAtual = "#00ff00";
            efeitoAtual = "solido";
            ligado = true;
            resposta = "{\"ok\":true,\"cor\":\"" + corAtual + "\",\"efeito\":\"" + efeitoAtual + "\"}";
            code = 200;
        }
        else if (body.indexOf("\"apagar\"") != -1 || body.indexOf("apagar") != -1) {
            apagarLEDs();
            resposta = "{\"ok\":true,\"cor\":\"#000000\",\"efeito\":\"apagado\"}";
            code = 200;
        }
        // JSON avançado
        else if (body.indexOf("\"comando\"") != -1 || body.indexOf("\"cor\"") != -1 || body.indexOf("\"efeito\"") != -1) {
            // Extrai cor (busca chave "cor":)
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

            // Extrai efeito (busca chave "efeito":)
            int idxEfeito = body.indexOf("\"efeito\":");
            if (idxEfeito != -1) {
                int idxVal = body.indexOf("\"", idxEfeito + 9);
                if (idxVal != -1) {
                    int idxFim = body.indexOf("\"", idxVal + 1);
                    efeitoAtual = body.substring(idxVal + 1, idxFim);
                }
            }

            // Extrai brilho (busca chave "brilho":)
            int idxBrilho = body.indexOf("\"brilho\":");
            if (idxBrilho != -1) {
                int idxVal = idxBrilho + 9; // posição logo após o ':'
                int idxFim = body.indexOf(",", idxVal);
                if (idxFim == -1) idxFim = body.indexOf("}", idxVal);
                String val = body.substring(idxVal, idxFim);
                brilhoAtual = constrain(val.toInt(), 0, 255);
                setBrightnessTodas(brilhoAtual);
            }

            // Extrai velocidade (busca chave "velocidade":)
            int idxVel = body.indexOf("\"velocidade\":");
            if (idxVel != -1) {
                int idxVal = idxVel + 13; // posição logo após o ':'
                int idxFim = body.indexOf(",", idxVal);
                if (idxFim == -1) idxFim = body.indexOf("}", idxVal);
                String val = body.substring(idxVal, idxFim);
                velocidadeAtual = constrain(val.toInt(), 1, 100);
            }

            // Extrai índice da fita (busca chave "fita":)
            int idxFita = -1;
            int idxFitaKey = body.indexOf("\"fita\":");
            if (idxFitaKey != -1) {
                int idxVal = idxFitaKey + 7; // posição logo após o ':'
                int idxFim = body.indexOf(",", idxVal);
                if (idxFim == -1) idxFim = body.indexOf("}", idxVal);
                String val = body.substring(idxVal, idxFim);
                idxFita = constrain(val.toInt(), 0, NUM_FITAS - 1);
            }

            // Comando específico (busca chave "comando":)
            int idxCmd = body.indexOf("\"comando\":");
            bool temEfeito = body.indexOf("\"efeito\":") != -1;
            if (idxCmd != -1) {
                int idxVal = body.indexOf("\"", idxCmd + 10);
                int idxFim = body.indexOf("\"", idxVal + 1);
                String cmd = body.substring(idxVal + 1, idxFim);
                if (cmd == "ligar") ligado = true;
                else if (cmd == "desligar") { apagarLEDs(); }
                else if (cmd == "cor") {
                    ligado = true;
                    if (!temEfeito) efeitoAtual = "solido";
                }
            }

            if (idxFita >= 0) {
                // Teste de fita individual: aplica imediatamente na fita escolhida
                if (corAtual == "#000000" || body.indexOf("\"apagar\"") != -1) {
                    apagarFita(idxFita);
                    resposta = "{\"ok\":true,\"fita\":" + String(idxFita) + ",\"acao\":\"apagar\"}";
                } else {
                    setFitaCor(idxFita, corAtual);
                    resposta = "{\"ok\":true,\"fita\":" + String(idxFita) + ",\"cor\":\"" + corAtual + "\",\"brilho\":" + String(brilhoAtual) + "}";
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

void handleOptions() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(204);
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

    // Teste rápido: pisca 3 LEDs verdes em cada fita
    for (int f = 0; f < NUM_FITAS; f++) {
        for (int i = 0; i < 3 && i < fitas[f].qtdLeds; i++) {
            fitas[f].strip->setPixelColor(i, fitas[0].strip->Color(0, 50, 0));
        }
    }
    showTodas();
    delay(500);
    apagarLEDs();

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
    server.begin();
    Serial.println("Servidor HTTP iniciado na porta 80");
}

// ========== LOOP ==========

void loop() {
    server.handleClient();
    executarEfeito();
    delay(1);
}
