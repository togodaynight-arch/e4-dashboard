# ARQUITETURA — TO GO HUNT (V1)

Camada independente de gamificação. **Não substitui** o E4/Mercatus, o PDV ou o cadastro existente. Consome o E4 apenas como leitura (V3+).

---

## 1. Diagrama de arquitetura

```
                      ┌──────────────────────────────┐
                      │  E4 SISTEMAS (portal + API)  │
                      │  (leitura, V3+ — não na V1)   │
                      └──────────────┬───────────────┘
                                     │ (futuro)
                                     ▼
                 ┌───────────────────────────────────┐
                 │         TO GO EXPERIENCE          │
                 │   (Node.js + Firebase RTDB)       │
                 │   API · ranking · antifraude      │
                 └───┬──────────┬──────────┬─────────┘
                     │          │          │
           ┌─────────▼──┐  ┌────▼─────┐  ┌─▼────────────┐
           │  MONITOR   │  │ QR CODE  │  │    ESP32     │
           │ (TV/kiosk) │  │(celular) │  │  (WS2811 12V)│
           └────────────┘  └──────────┘  └──────────────┘
                     │          │          │
                     └────┬─────┴────┬─────┘
                          ▼          ▼
                  PONTOS · DESAFIOS · RANKING
                          │
                          ▼
                 BENEFÍCIOS FUTUROS (V4)
```

**Comunicação:**
- Monitor e celular → HTTP (páginas/API públicas).
- ESP32 → *polling* HTTP (heartbeat a cada 5s + recebe comando). O ESP32 **nunca** expõe porta pública.

---

## 2. Estrutura do banco (Firebase Realtime Database, raiz `/togohunt`)

| Nó | Conteúdo | Índice/chave |
| --- | --- | --- |
| `stores/{id}` | `{ id, name, active }` | `id` = `store1` |
| `challenges/{slug}` | `{ slug, name, description, points, storeId, productName, active, validFrom, validTo, createdAt }` | `slug` |
| `participants/{id}` | `{ id, nickname, phone, createdAt }` | `id` = código público (ex. `KJF6`) |
| `participations/{participantId}__{slug}` | `{ participantId, challengeSlug, points, at, ip }` | chave composta (garante **antifraude**) |
| `pointsLedger/{pushId}` | `{ participantId, challengeSlug, amount, type, at, ip }` | `pushId` (auto) |
| `devices/{deviceId}` | `{ deviceId, storeId, name, lastHeartbeatAt, online, state, pendingCommand }` | `deviceId` |
| `deviceEvents/{pushId}` | `{ deviceId, type, state?, at }` | `pushId` (auto) |
| `lastSuccess/{storeId}` | `{ code, nickname, points, challengeSlug, at }` | `storeId` |
| `campaigns` / `rewards` | reservado (futuro) | — |

**Regras de integridade:**
- Pontos **nunca** são sobrescritos: cada concessão é uma linha em `pointsLedger` (ledger).
- Antifraude: `participations/{participantId}__{slug}` impede duplicidade.
- Ranking é **calculado** a partir do ledger (não é armazenado).

---

## 3. API

### Públicas (cliente/monitor)
| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/hunt/challenges?storeId=` | Lista desafios de uma loja |
| GET | `/api/hunt/challenge?slug=` | Detalhe de um desafio (para o QR) |
| GET | `/api/hunt/ranking?storeId=` | TOP 10 da loja |
| GET | `/api/hunt/state?storeId=` | Estado para o monitor (desafio ativo + ranking + último sucesso) |
| POST | `/api/hunt/participate` | `{slug, nickname, phone}` → concede pontos (ou bloqueia) |

### Dispositivo (ESP32)
| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/api/devices/heartbeat` | `{deviceId, storeId}` → retorna `{command, desiredState}` |
| POST | `/api/devices/state` | Atualiza o estado atual do dispositivo |

### Admin (Basic Auth)
| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/admin/status` | Status geral + dispositivos |
| GET/POST | `/api/admin/challenges` | Lista / cria desafio |
| POST | `/api/admin/challenges/{slug}` | Edita (ativar/desativar/pontos/validade) |
| GET | `/api/admin/participants` | Lista participantes + pontos |
| POST | `/api/admin/ranking/reset` | Zera participações/pontos |
| GET | `/api/admin/devices` | Lista dispositivos |

---

## 4. Estados do LED (ESP32)

| Estado | LED | Quando |
| --- | --- | --- |
| `normal` | apagado / discreto | sem desafio ativo |
| `desafio` | pulsação (laranja) | desafio ativo |
| `sucesso` | corrida + brilho (verde) | cliente concluiu (por ~9s, depois volta a `desafio`) |

---

## 5. Segurança e privacidade (LGPD)

- Coleta mínima: **apelido** (obrigatório) + **telefone** (opcional). Sem CPF.
- Ranking mostra apenas **código público** e **apelido**. Nunca telefone/CPF/nome completo.
- Histórico de compras do E4 **não** é exibido publicamente.
- Dados privados (`phone`, `ip`) ficam fora do ranking.
- Código separa dados públicos (ranking) dos privados (participantes/admin).

---

## 6. Como adicionar outra loja (multiloja futura)

A arquitetura já usa `STORE_ID` em desafios e dispositivos. Para uma 2ª loja:
1. Crie desafios com `storeId` da nova loja.
2. Configure o ESP32 da nova loja com `STORE_ID` correspondente.
3. O ranking continua **por loja** (o ranking geral é fase futura — V5).
