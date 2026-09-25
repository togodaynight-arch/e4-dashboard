// ============================================================
//  ESP32 - LED atrás da TV (lê o comando do Firebase)
//
//  Como funciona:
//   1. A tela de boas-vindas grava no Firebase o estado do LED
//      (ex: {on:true, r:255, g:0, b:0} = acender vermelho).
//   2. Este ESP32 fica olhando o Firebase a cada 1 segundo.
//   3. Quando muda, ele acende/apaga a fita LED na cor pedida.
//
//  Como usar:
//   1. Instale no Arduino IDE as bibliotecas:
//      - FastLED  (Sketch > Incluir Biblioteca > Gerenciar Bibliotecas)
//      - ArduinoJson  (mesmo jeito)
//   2. Ajuste o WiFi e o pino dos LEDs aqui embaixo.
//   3. Grave no ESP32.
// ============================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FastLED.h>

// ===================== CONFIGURAÇÃO =====================
const char* WIFI_SSID = "NOME_DA_REDE_WIFI";     // <- troque
const char* WIFI_SENHA = "SENHA_DA_REDE_WIFI";   // <- troque

const char* FIREBASE_URL = "https://loja-bemvindo-default-rtdb.firebaseio.com/led.json";

#define LED_PIN     4     // pino de dados da fita (GPIO4, o mais comum)
#define NUM_LEDS    60    // quantidade de LEDs da fita
#define BRILHO      128   // brilho (0 a 255)
// ========================================================

CRGB leds[NUM_LEDS];
bool ledLigado = false;
CRGB corAtual = CRGB(0, 0, 0);

void conectarWiFi() {
    Serial.println("Conectando ao WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_SENHA);
    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED && tentativas < 40) {
        delay(500);
        Serial.print(".");
        tentativas++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi conectado!");
    } else {
        Serial.println("\nFalha no WiFi (vai tentar de novo).");
    }
}

void aplicarCor() {
    if (ledLigado) {
        fill_solid(leds, NUM_LEDS, corAtual);
    } else {
        fill_solid(leds, NUM_LEDS, CRGB(0, 0, 0));
    }
    FastLED.show();
}

void verificarFirebase() {
    if (WiFi.status() != WL_CONNECTED) return;

    WiFiClientSecure client;
    client.setInsecure();   // aceita o certificado do Firebase (simples pra loja)

    HTTPClient http;
    http.setTimeout(5000);
    if (!http.begin(client, FIREBASE_URL)) {
        return;
    }

    int code = http.GET();
    if (code == HTTP_CODE_OK) {
        String payload = http.getString();
        StaticJsonDocument<512> doc;
        DeserializationError err = deserializeJson(doc, payload);
        if (!err) {
            bool novoLigado = doc["on"] | false;
            CRGB novaCor = CRGB(doc["r"] | 0, doc["g"] | 0, doc["b"] | 0);
            if (novoLigado != ledLigado || (novoLigado && novaCor.r != corAtual.r) ||
                (novoLigado && novaCor.g != corAtual.g) || (novoLigado && novaCor.b != corAtual.b)) {
                ledLigado = novoLigado;
                corAtual = novaCor;
                aplicarCor();
                Serial.print("LED: ");
                Serial.println(ledLigado ? "aceso" : "apagado");
            }
        }
    }
    http.end();
}

void setup() {
    Serial.begin(115200);

    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
    FastLED.setBrightness(BRILHO);
    fill_solid(leds, NUM_LEDS, CRGB(0, 0, 0));
    FastLED.show();

    conectarWiFi();
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        conectarWiFi();
    }
    verificarFirebase();
    delay(1000);   // checa a cada 1 segundo
}
