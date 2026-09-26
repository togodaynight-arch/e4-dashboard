# ROADMAP — TO GO EXPERIENCE

Evolução planejada após a V1 (TO GO HUNT) estar funcionando de ponta a ponta em uma loja.

> Nada abaixo é implementado agora. Este documento é apenas o plano de evolução.

---

## V1 — TO GO HUNT (ATUAL)
- 1 loja, 1 prateleira, 1 ESP32, 1 trecho de LED, 1 QR Code, 1 desafio, 1 ranking, 1 monitor.
- Identificação própria (apelido + telefone opcional).
- Antifraude (participante + desafio únicos), ledger de pontos.
- Estados do LED: normal / desafio / sucesso.

## V2 — Vários desafios
- Vários QR Codes, vários LEDs e várias prateleiras.
- Múltiplos desafios ativos ao mesmo tempo.
- Painel admin para gerenciar vários desafios.
- Monitor mostra os desafios em rotação.

## V3 — Integração mais profunda com E4
- Leitura do histórico de compras (`vendas/listagem`) **agregado**.
- Desafios personalizados por comportamento (café ☕, energético ⚡).
- Regras simples de personalização (sem IA).
- Pontos por comportamento (visita, compra, frequência).
- Identificação do cliente via E4 (se o módulo de cliente for habilitado).

## V4 — Benefícios
- Vouchers, cashback, produtos grátis, créditos.
- Resgate de pontos (ledger negativo: `-100 resgate`).
- Integração com cupom/desconto do E4 **se** o fornecedor liberar.

## V5 — Multiloja e campanhas
- Ranking geral (entre lojas).
- Campanhas com data de início/fim.
- TO GO RENOVA, TO GO TRANSBUS, TO GO TRANSCAL etc.

## V6 — Personalização avançada
- Recomendações e experiências por perfil.
- IA / segmentação.
- Regras avançadas de recompensa.

---

## Critério para avançar de fase
Só avançar quando a fase anterior estiver **estável e instalada** na loja. Prioridade absoluta: **funcionar na loja**, não criar funcionalidades que nunca sejam instaladas.
