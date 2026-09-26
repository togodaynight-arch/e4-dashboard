/*
 * TO GO HUNT - firmware ESP32 (V1)
 *
 * Controla um trecho curto de fita WS2811 (12V) como sinalizacao visual
 * do desafio. Estados:
 *   - normal   : LED apagado (ou iluminacao discreta)
 *   - desafio  : animacao de pulsacao (indica a prateleira)
 *   - sucesso  : corrida de LED + brilho (celebracao)
 *
 * Comunicacao: o ESP32 faz POLLING no servidor (heartbeat) e recebe
 * comandos. Nao expoe porta na rede. Se o servidor cair, o LED continua
 * funcionando no ultimo estado (nao trava).
 *
 * CONFIGURACAO: preencha abaixo. Nao espalhe credenciais pelo codigo.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Adafruit_NeoPixel.h>

// ========== CONFIGURACAO ==========
const char* WIFI_SSID   = "NETPARQUE-DIEGO";
const char* WIFI_PASS   = "NPQ274950";

const char* SERVER_URL  = "https://e4-dashboard-2lvk.onrender.com";  // URL do servidor (sem barra final)
const char* DEVICE_ID   = "esp32-1";
const char* STORE_ID    = "store1";

// LED (WS2811 - DATA no GPIO, alimentacao 12V externa, GND comum)
#define LED_PIN      4
#define NUM_LEDS     900     // quantidade de LEDs da fita (ex: 12 = ~20cm; 900 = fita longa)
#define LED_TYPE     NEO_RBG // se a cor sair trocada, teste NEO_RGB
#define BRILHO_BASE  60      // brilho da pulsacao (0-255)

// SENSOR DE SOM (KEYES KY-038 / KY-037)
// Liga: VCC->3.3V, GND->GND, DO->SOUND_PIN (o AO nao e usado).
// Quando detecta som (palma/barulho), dispara a animacao de comemoracao.
#define SOUND_HABILITADO true
#define SOUND_PIN       32        // pino do DO do sensor (GPIO 32, tem pull-up interno)
#define SOUND_NIVEL     LOW       // LOW = som detectado (LED do sensor acende). Se nao disparar, troque por HIGH
#define SOUND_DURACAO   4000      // tempo da comemoracao em ms

// SENSOR DE PRESENCA (PIR HC-SR501)
// Liga: VCC->5V, GND->GND, OUT->PRESENCA_PIN.
// Quando detecta movimento (alguem se aproxima), acende a fita para chamar atencao.
#define PRESENCA_HABILITADO true
#define PRESENCA_PIN      33        // pino do OUT do sensor (GPIO 33)
#define PRESENCA_NIVEL    HIGH      // HIGH = movimento detectado
#define PRESENCA_DURACAO  6000      // tempo que a fita fica acesa apos o movimento (ms)

const unsigned long HEARTBEAT_MS = 5000;   // intervalo do heartbeat
const unsigned long SUCESSO_MS   = 9000;   // duracao da celebracao

Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, LED_TYPE + NEO_KHZ800);

String estado = "normal";            // normal | desafio | sucesso
unsigned long sucessoAte = 0;
unsigned long somAte = 0;            // ate quando a comemoracao do som dura
unsigned long somCooldown = 0;       // evita disparar repetido
unsigned long presencaAte = 0;       // ate quando a luz de presenca fica acesa
unsigned long ultimoHeartbeat = 0;
unsigned long ultimoFrame = 0;
int framePhase = 0;

// ========== ANIMACOES ==========
void apagar() {
  strip.clear();
  strip.show();
}

void animarDesafio() {
  // pulsacao suave
  int brilho = 20 + (235 * (sin(framePhase * 0.06) + 1)) / 2;
  for (int i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, strip.Color(brilho, brilho * 0.6, 0));
  }
  strip.show();
}

void animarSucesso() {
  // corrida de LED + brilho (celebracao)
  for (int i = 0; i < NUM_LEDS; i++) {
    int dist = abs(i - (framePhase % NUM_LEDS));
    int brilho = max(0, 255 - dist * 40);
    strip.setPixelColor(i, strip.Color(0, brilho, brilho / 2));
  }
  strip.show();
}

void animarPresenca() {
  // luz quente (dourada) para chamar atencao quando alguem se aproxima
  for (int i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, strip.Color(255, 200, 120));
  }
  strip.show();
}

void executarAnimacao() {
  if (millis() - ultimoFrame < 30) return;  // ~33fps
  ultimoFrame = millis();
  framePhase++;

  if (millis() < somAte) animarSucesso();               // palma/barulho -> comemoracao
  else if (millis() < presencaAte) animarPresenca();     // movimento -> acende (chamada)
  else if (estado == "desafio") animarDesafio();
  else if (estado == "sucesso") animarSucesso();
  else apagar();

  // volta do sucesso para o estado anterior (desafio)
  if (estado == "sucesso" && millis() > sucessoAte) {
    estado = "desafio";
  }
}

// ========== REDE ==========
bool conectarWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
    delay(500);
  }
  return WiFi.status() == WL_CONNECTED;
}

// ========== HEARTBEAT / POLLING ==========
void heartbeat() {
  if (!conectarWifi()) return;

  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();  // V1: aceita certificado (substituir por CA p/ producao)
  http.begin(client, String(SERVER_URL) + "/api/devices/heartbeat");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  String body = "{\"deviceId\":\"" + String(DEVICE_ID) +
                "\",\"storeId\":\"" + String(STORE_ID) +
                "\",\"name\":\"ESP32 " + String(DEVICE_ID) + "\"}";

  int code = http.POST(body);
  if (code == 200) {
    String resp = http.getString();
    // parse simples de JSON (evita dependencia de lib)
    String cmd = extrair(resp, "command");
    String desired = extrair(resp, "desiredState");

    // comando transiente (sucesso) tem prioridade
    if (cmd == "sucesso") {
      estado = "sucesso";
      sucessoAte = millis() + SUCESSO_MS;
    } else if (desired == "desafio" || desired == "normal") {
      // se nao esta em sucesso, segue o estado desejado
      if (estado != "sucesso") estado = desired;
    }
  }
  http.end();
}

// extrai o valor de uma chave string de um JSON simples {"key":"value"}
String extrair(String json, String chave) {
  String busca = "\"" + chave + "\":";
  int idx = json.indexOf(busca);
  if (idx == -1) return "";
  idx += busca.length();
  if (json.charAt(idx) == '\"') {
    int fim = json.indexOf('\"', idx + 1);
    return json.substring(idx + 1, fim);
  }
  int fim = json.indexOf(',', idx);
  if (fim == -1) fim = json.indexOf('}', idx);
  return json.substring(idx, fim);
}

// ========== SETUP / LOOP ==========
void setup() {
  Serial.begin(115200);
  strip.begin();
  strip.setBrightness(BRILHO_BASE);
  apagar();

  // teste rapido: 3 LEDs verdes
  for (int i = 0; i < 3 && i < NUM_LEDS; i++) strip.setPixelColor(i, strip.Color(0, 50, 0));
  strip.show();
  delay(400);
  apagar();

  if (SOUND_HABILITADO) {
    pinMode(SOUND_PIN, INPUT_PULLUP);
  }

  if (PRESENCA_HABILITADO) {
    pinMode(PRESENCA_PIN, INPUT_PULLDOWN);
  }

  if (conectarWifi()) {
    Serial.println("WiFi OK: " + WiFi.localIP().toString());
  } else {
    Serial.println("WiFi FALHOU (continuara tentando)");
  }

  ultimoHeartbeat = millis();
}

void loop() {
  executarAnimacao();

  // Sensor de som: ao detectar (palma/barulho), dispara a comemoracao
  if (SOUND_HABILITADO) {
    bool somDetectado = (digitalRead(SOUND_PIN) == SOUND_NIVEL);
    if (somDetectado && millis() > somCooldown) {
      somAte = millis() + SOUND_DURACAO;
      somCooldown = millis() + 2000;  // so repete apos 2s
      Serial.println("Som detectado - comemoracao!");
    }
  }

  // Sensor de presenca: ao detectar movimento, acende a fita (chamada)
  if (PRESENCA_HABILITADO) {
    bool movimento = (digitalRead(PRESENCA_PIN) == PRESENCA_NIVEL);
    if (movimento) {
      presencaAte = millis() + PRESENCA_DURACAO;
    }
  }

  if (millis() - ultimoHeartbeat >= HEARTBEAT_MS) {
    ultimoHeartbeat = millis();
    heartbeat();
  }

  // watchdog simples: se algo travar o WiFi, reconecta
  if (WiFi.status() != WL_CONNECTED) {
    conectarWifi();
  }

  delay(5);
}
