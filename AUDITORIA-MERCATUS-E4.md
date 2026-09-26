# AUDITORIA MERCATUS / E4

**Data:** 2026-09-25
**Objetivo:** descobrir o que já existe no ambiente que pode ser reutilizado para a gamificação TO GO EXPERIENCE, **sem inventar** APIs, endpoints ou bancos.

---

## 1. Resumo executivo

- **Não existe Mercatus no ambiente.** O sistema utilizado é o **E4 Sistemas** (`portal.e4sistemas.com.br`).
- O ambiente já contém uma integração **real e funcional** com o E4, validada em vários subprojetos do repositório.
- Existem **dois mecanismos de acesso** ao E4:
  1. **API REST oficial** (autenticada por **JWT Bearer**, tipo "Terceiros via API").
  2. **Portal web interno** (login com usuário/senha + cookie `PHPSESSID`).
- Foi possível confirmar endpoints para **vendas, categorias e relatórios por loja**. **Não foi encontrado** nenhum endpoint para: cadastro de clientes, catálogo de produtos, cupons, créditos, cashback, fidelidade/pontos ou webhooks.
- Todo o restante (pontos, desafios, ranking, participações) **terá que ser desenvolvido** como camada independente — exatamente como previsto no projeto.

---

## 2. O que existe (confirmado no código do repositório)

### 2.1. Identificação da conta E4

| Item | Valor (decodificado do token JWT) |
| --- | --- |
| Emissor (`iss`) | `e4sistemas.com.br` |
| Cliente (`cliente`) | `215` |
| Documento (`documento`) | `to go` |
| Assunto (`sub`) | `Autenticação` |
| Audiência (`aud`) | `Terceiros via API` |

- O `X-Cliente-Id` usado nas chamadas é `215`.
- Existe um token JWT (Bearer) configurado como fallback em vários servidores.

### 2.2. Autenticação

- **API REST:** header `Authorization: Bearer <JWT>` + `X-Cliente-Id: 215` (+ `X-Produto` opcional, default vazio).
- **Portal web:** `GET /central/index/login` retorna cookie `PHPSESSID`; `POST /central/index/logar` com `usuario`/`senha`/`modulo` valida a sessão (resposta `sMensagem === true`). Sessão expira em ~25 min e é revalidada automaticamente no código.

### 2.3. Endpoints confirmados

| Endpoint | Método | Autenticação | Retorno confirmado |
| --- | --- | --- | --- |
| `/api/vendas/listagem?pagina=N&quantidade=M` | POST | JWT Bearer | `{ registros: [...], paginacao: { qtdTotalRegistros, qtdTotalPaginas } }` |
| `/api/categorias/listagem?pagina=1&quantidade=1000` | POST | JWT Bearer | array de `{ id, nome }` |
| `/api/vendas/vendas-loja` | POST | JWT Bearer | `{ produtos: [...], finalizadoras: [...] }` (com categoria e finalizadora) |
| `/basico/ocorrencias-pdv/retornar-dados` | POST | PHPSESSID | `{ aDados: [...] }` (ocorrências de caixa) |
| `/basico/log-porta-acessos/retornar-dados` | POST | PHPSESSID | `{ aDados: [...] }` (log de entrada/saída de cliente) |

### 2.4. Corpo e campos de `/api/vendas/listagem`

Corpo: `{ "unidade": null, "dataInicial": "YYYY-MM-DD 00:00:00", "dataFinal": "YYYY-MM-DD 23:59:59" }`.

Campos de cada venda (registro):
- `id`, `cupom`, `valorLiquido`, `cancelado`
- `unidadeNome` / `unidadeNombre` (nome da loja)
- `pdvCodigo`, `dataEfetivacao`, `nfceSituacaoNome`
- `produtos[]` com: `id`, `ean`, `codigo`, `descricaoReduzida`, `descricaoComercial`, `quantidade`, `valorUnitario`, `valorTotal`, `valorLiquido`, `cancelado`, `categoriaId`

### 2.5. Corpo e campos das ocorrências de caixa (`/basico/ocorrencias-pdv/retornar-dados`)

Campos relevantes por ocorrência:
- `id`, `data_ocorrencia`, `ocorrencia` (texto), `origem` (`Cupom`, `Totem/PDV`, `Log de Porta`)
- `ws_ocorrencias_frente_caixa` (tipo numérico: `1,2,8,13,32` = erros/cancelamento; `41` = entrada; `42` = saída)
- `unidade`, `pdv`, `cupom`, `cupons_vl_liquido`, `cupons_divergencias_status` (`Autorizado`/`Autorizada`)
- `cliente`, `cpf_cliente`, `cod_operacao`

### 2.6. Log de porta (`/basico/log-porta-acessos/retornar-dados`)

Campos relevantes:
- `id`, `datahora`, `loja`, `cliente`, `cpf`, `cartao`, `telefone`, `email`, `apartamento`, `obs`, `status`
- Tipos: `41` = entrada, `42` = saída.

---

## 3. O que podemos utilizar

| Recurso | Uso possível na gamificação |
| --- | --- |
| `vendas/listagem` | Histórico de compras agregado (produtos mais comprados, categorias, ticket médio, horários) — **somente em agregação, nunca exposto individualmente**. |
| `categorias/listagem` | Mapear produto → categoria para regras futuras ("quem compra café..."). |
| `vendas/vendas-loja` | Relatório por loja/categoria/finalizadora — útil para V3 (personalização). |
| `ocorrencias-pdv` | Eventos em tempo real de caixa (venda autorizada, cancelamento, entrada/saída de cliente) — já usados hoje para acender LED. |
| `log-porta-acessos` | Identificação do cliente na entrada (`cpf`, `cartao`, `telefone`, `email`) quando o leitor facial/porta estiver ligado. |
| Token JWT + `X-Cliente-Id` | Padrão de autenticação já funcional para chamar a API oficial. |

---

## 4. O que pode ser integrado

- **Leitura** de vendas, categorias e ocorrências (já integrado em `server-unificado.js`, `loja-unificada/server.js`, `loja-totem/server.js`, `relatorios-dia/*`, `public/*`).
- **Sinalização por LED a partir de eventos do E4** (já existe: venda aprovada → verde, cancelamento → vermelho, entrada → amarelo).
- **Identificação de cliente na porta** via `log-porta-acessos`/Control iD (depende do hardware de porta estar ativo).

---

## 5. O que NÃO pode ser integrado (não encontrado / não existe)

- **Cadastro de clientes (CRUD/lookup).** Não foi encontrado endpoint para consultar ou criar cliente por CPF/telefone/cartão/token. Os dados de cliente só aparecem *embutidos* em ocorrências e log de porta.
- **Catálogo de produtos (CRUD).** Só há produtos embutidos nas vendas + lista de categorias. Não há endpoint de consulta individual de produto.
- **Cupons, créditos, cashback, carteira, fidelidade/pontos.** Nenhum endpoint encontrado.
- **Webhooks.** Não há mecanismo de webhook documentado/disponível; a integração é por *polling* (o código consulta o E4 periodicamente).
- **App E4 / SDK móvel.** Nenhum SDK ou API de aplicativo encontrado no ambiente.

---

## 6. O que exige autorização / API própria do E4

- Qualquer criação de **cupom, desconto, crédito ou voucher financeiro real** no PDV (exigiria módulo E4 não mapeado + autorização do fornecedor).
- Acesso a **cadastro de clientes** (se existir em outro módulo do portal) exigiria investigação adicional no portal e, provavelmente, liberação pelo E4.

---

## 7. O que exige desenvolvimento externo (camada TO GO)

- Banco de dados da gamificação (participantes, desafios, participações, ledger de pontos, dispositivos, recompensas, campanhas).
- API de gamificação (desafios, ranking, participação, comando de dispositivo).
- Frontend do cliente (telas do monitor) e painel administrativo.
- Firmware ESP32 (ou reuso do já existente) com os estados normal/desafio/sucesso.
- Antifraude (participante + desafio únicos) e logs.

---

## 8. O que pode ser feito SEM alterar o sistema atual

- **Toda a gamificação V1**, exceto: a identificação do cliente e a pontuação que dependem de dados do E4.
- **Identificação V1 própria** (apelido/telefone) sem tocar no E4.
- **Leitura de vendas/categorias** para personalização futura (V3) sem escrita no E4.
- **Controle de LED** (já existe infraestrutura: firmware próprio e WLED).

---

## 9. Riscos técnicos

1. **Segredos em texto puro.** O token JWT, usuário/senha do portal, senha do Wi-Fi, token do Telegram e URL do Firebase estão hardcoded em vários arquivos (e alguns já em histórico do git). **Recomendação:** rotacionar o token E4 e mover tudo para variáveis de ambiente / secret manager.
2. **Token E4 pode expirar.** O JWT tem campo `data` de emissão; se for rotacionado pelo fornecedor, todas as integrações quebram. Existe `fallback` no código, mas deve-se centralizar.
3. **Sem webhooks = polling.** O E4 é consultado por polling (2–3s). Isso gera latência e consumo de quota. A gamificação V1 **não precisa** de tempo real no E4 (o QR/desafio são independentes).
4. **Persistência no Render (free) é efêmera.** Arquivos locais somem a cada redeploy. Usar Firebase (já em uso) ou banco persistente.
5. **Identificação do cliente é o ponto fraco.** Sem endpoint de cliente no E4, a V1 precisará de identificação própria (ver decisão abaixo).
6. **Rede local vs nuvem.** O ESP32 está na rede local da loja; um servidor em nuvem não alcança o ESP32 diretamente — o ESP32 deve *polling* o servidor (buscar comandos pendentes), padrão que o projeto já exige ("continuar funcionando se servidor cair").
7. **LGPD/minimização.** Não persistir CPF/telefone sem necessidade; ranking só com identificador público.

---

## 10. Recomendações

1. **NÃO** tentar integrar cadastro de clientes/CPF do E4 na V1 — não existe endpoint confirmado. Usar **identificação própria mínima** (apelido + telefone opcional) e deixar a integração de identidade para uma fase posterior, após investigar o portal E4.
2. **NÃO** depender de desconto/cupom no PDV na V1 — confirmado que não há mecanismo mapeado.
3. Usar **apenas leitura** do E4 (vendas/categorias/ocorrências) para a V3+ de personalização.
4. Centralizar as credenciais E4 em **um único adaptador** reutilizável (o padrão já existe em `led-eventos/src/erp-adapter.js`).
5. Para persistência dos pontos, preferir **Firebase Realtime Database** (já usado e persistente no plano free) ou um banco persistente; **não** usar arquivo JSON no Render.
6. Rotacionar o token E4 e o usuário/senha do portal após mover para variáveis de ambiente.

---

## 11. Arquivos que comprovam a integração (referências)

- `server-unificado.js` — dashboard + proxy API + ocorrências + entradas de porta.
- `relatorios-dia/server.js` e `relatorios-dia/enviar-relatorio.js` — vendas + relatório Telegram.
- `server-loja.js` — ESP32 + monitor + Control iD + vendas E4.
- `loja-totem/server.js` — ocorrências de caixa → cenas de LED.
- `loja-unificada/server.js` — WLED + ocorrências E4 + sensor de presença.
- `led-eventos/src/erp-adapter.js` — adaptador E4 reutilizável.
- `compras-site/app.js` — vendas + categorias (agregação).
- `public/recebimentos.js` — vendas por loja/categoria/finalizadora.
- `esp32-led-controller.ino` — firmware ESP32 próprio (HTTP + WS281x).
- `esp32-wled-backup/` — firmware WLED v0.15.4 (fitas 12V WS2811).
