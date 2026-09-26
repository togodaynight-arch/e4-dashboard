// =====================================================================
//  TO GO HUNT - servidor da gamificacao (V1)
//  Camada independente do E4/Mercatus. Nao altera o PDV.
//
//  - API de desafios / ranking / participacao
//  - Comunicacao com ESP32 (heartbeat + comando pendente)
//  - Painel admin (Basic Auth)
//  - Monitor (kiosk) e pagina do cliente (QR)
//  - Persistencia: Firebase Realtime Database
//
//  Sem dependencias npm. Roda com: node togo-hunt/server.js
// =====================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ========== CONFIGURACAO (env) ==========
const PORT = Number(process.env.PORT || 3000);
const FIREBASE_DB = (process.env.FIREBASE_DB || 'https://loja-bemvindo-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const DB_ROOT = (process.env.DB_ROOT || 'togohunt').replace(/^\/+|\/+$/g, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'togo2026';
const STORE_ID = process.env.STORE_ID || 'store1';
const STORE_NAME = process.env.STORE_NAME || 'TO GO DAY/NIGHT';
const BASE_URL = (process.env.BASE_URL || 'http://localhost:' + PORT).replace(/\/+$/, '');

const PUBLIC_DIR = path.join(__dirname, 'public');

// ========== HELPERS FIREBASE (REST) ==========
function fbUrl(relPath) {
    return FIREBASE_DB + '/' + DB_ROOT + '/' + relPath + '.json';
}

function fbRequest(method, relPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const opts = {
            method: method,
            headers: { 'Accept': 'application/json' }
        };
        if (payload) {
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['Content-Length'] = Buffer.byteLength(payload);
        }
        const req = https.request(fbUrl(relPath), opts, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                let json = null;
                try { json = data ? JSON.parse(data) : null; } catch (e) { json = null; }
                if (res.statusCode >= 400) reject(new Error('Firebase HTTP ' + res.statusCode));
                else resolve(json);
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

const fbGet = (p) => fbRequest('GET', p);
const fbPut = (p, body) => fbRequest('PUT', p, body);
const fbPost = (p, body) => fbRequest('POST', p, body);
const fbDel = (p) => fbRequest('DELETE', p);

// ========== UTIL ==========
function agora() { return new Date().toISOString(); }

function codigoPublico() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

function sendJSON(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-cache'
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve) => {
        let b = '';
        req.on('data', (c) => b += c);
        req.on('end', () => {
            try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); }
        });
    });
}

function basicAuth(req, res) {
    const h = req.headers['authorization'];
    if (!h || !h.startsWith('Basic ')) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="TO GO HUNT Admin"', 'Content-Type': 'text/plain' });
        res.end('Acesso negado');
        return false;
    }
    const creds = Buffer.from(h.split(' ')[1], 'base64').toString().split(':');
    if (creds[0] !== ADMIN_USER || creds[1] !== ADMIN_PASS) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="TO GO HUNT Admin"', 'Content-Type': 'text/plain' });
        res.end('Acesso negado');
        return false;
    }
    return true;
}

function slugSeguro(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\-_]/g, '').slice(0, 40);
}

function hostDoReq(req) {
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host = req.headers['host'];
    return proto + '://' + (host || ('localhost:' + PORT));
}

// ========== DADOS ==========

async function getChallenge(slug) {
    const all = await fbGet('challenges');
    if (!all) return null;
    return all[slug] || null;
}

async function listChallenges(storeId) {
    const all = (await fbGet('challenges')) || {};
    return Object.values(all)
        .filter((c) => c && (!storeId || c.storeId === storeId))
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

async function getParticipant(id) {
    const all = (await fbGet('participants')) || {};
    return all[id] || null;
}

async function findOrCreateParticipant(nickname, phone) {
    const nick = String(nickname || '').trim().slice(0, 30);
    if (!nick) return null;
    const all = (await fbGet('participants')) || {};
    const phoneKey = phone ? String(phone).replace(/\D/g, '') : '';
    // procura por telefone (se informado) ou apelido igual
    let found = null;
    for (const id of Object.keys(all)) {
        const p = all[id];
        if (phoneKey && p.phone && p.phone === phoneKey) { found = p; break; }
    }
    if (!found) {
        for (const id of Object.keys(all)) {
            const p = all[id];
            if (String(p.nickname || '').toLowerCase() === nick.toLowerCase()) { found = p; break; }
        }
    }
    if (found) return found;

    let id = codigoPublico();
    while (all[id]) id = codigoPublico();
    const p = {
        id: id,
        nickname: nick,
        phone: phoneKey || '',
        createdAt: agora()
    };
    await fbPut('participants/' + id, p);
    return p;
}

async function computeRanking(storeId, limit) {
    limit = limit || 10;
    const parts = (await fbGet('participants')) || {};
    const ledger = (await fbGet('pointsLedger')) || {};
    const participations = (await fbGet('participations')) || {};

    // participacao -> loja do desafio (para filtrar por loja)
    const challenges = (await fbGet('challenges')) || {};

    const totals = {};
    for (const key of Object.keys(ledger)) {
        const e = ledger[key];
        if (!e || !e.participantId) continue;
        if (storeId) {
            const part = participations[e.participantId + '__' + e.challengeSlug];
            const ch = part ? challenges[part.challengeSlug] : null;
            if (!ch || ch.storeId !== storeId) continue;
        }
        totals[e.participantId] = (totals[e.participantId] || 0) + Number(e.amount || 0);
    }

    const list = Object.keys(totals).map((pid) => {
        const p = parts[pid] || { id: pid, nickname: 'Anonimo' };
        return { code: p.id, nickname: p.nickname || 'Anonimo', points: totals[pid] };
    }).sort((a, b) => b.points - a.points);

    return list.slice(0, limit);
}

async function getLastSuccess(storeId) {
    const ls = (await fbGet('lastSuccess')) || {};
    return ls[storeId] || null;
}

// ========== PARTICIPACAO ==========
async function participate(body, ip) {
    const slug = slugSeguro(body.slug);
    const nickname = String(body.nickname || '').trim();
    const phone = String(body.phone || '').trim();

    if (!slug) return { ok: false, erro: 'desafio_invalido' };
    if (!nickname) return { ok: false, erro: 'apelido_obrigatorio' };

    const challenge = await getChallenge(slug);
    if (!challenge) return { ok: false, erro: 'desafio_nao_encontrado' };
    if (challenge.active === false) return { ok: false, erro: 'desafio_inativo' };
    if (challenge.validTo && agora() > challenge.validTo) return { ok: false, erro: 'desafio_expirado' };

    const participant = await findOrCreateParticipant(nickname, phone);
    if (!participant) return { ok: false, erro: 'apelido_obrigatorio' };

    // ANTIFRAUDE: participante + desafio unicos
    const partKey = participant.id + '__' + slug;
    const jaFez = await fbGet('participations/' + partKey);
    if (jaFez) return { ok: false, erro: 'ja_completou', participant: { code: participant.id, nickname: participant.nickname } };

    const pontos = Number(challenge.points || 0);
    const at = agora();

    const participation = {
        participantId: participant.id,
        challengeSlug: slug,
        points: pontos,
        at: at,
        ip: ip || ''
    };
    await fbPut('participations/' + partKey, participation);

    // LEDGER (registro de ponto - nunca sobrescrever total)
    const ledgerEntry = {
        participantId: participant.id,
        challengeSlug: slug,
        amount: pontos,
        type: 'desafio',
        at: at,
        ip: ip || ''
    };
    await fbPost('pointsLedger', ledgerEntry);

    await fbPut('lastSuccess/' + challenge.storeId, {
        code: participant.id,
        nickname: participant.nickname,
        points: pontos,
        challengeSlug: slug,
        at: at
    });

    // Dispara comando de sucesso no LED do dispositivo da loja
    await notificarDispositivos(challenge.storeId, 'sucesso');

    const ranking = await computeRanking(challenge.storeId, 10);
    const total = await pontosParticipante(participant.id, challenge.storeId);

    return {
        ok: true,
        pontos: pontos,
        total: total,
        participant: { code: participant.id, nickname: participant.nickname },
        ranking: ranking
    };
}

async function pontosParticipante(participantId, storeId) {
    const ledger = (await fbGet('pointsLedger')) || {};
    const participations = (await fbGet('participations')) || {};
    const challenges = (await fbGet('challenges')) || {};
    let total = 0;
    for (const key of Object.keys(ledger)) {
        const e = ledger[key];
        if (!e || e.participantId !== participantId) continue;
        if (storeId) {
            const part = participations[e.participantId + '__' + e.challengeSlug];
            const ch = part ? challenges[part.challengeSlug] : null;
            if (!ch || ch.storeId !== storeId) continue;
        }
        total += Number(e.amount || 0);
    }
    return total;
}

// ========== DISPOSITIVOS (ESP32) ==========
async function notificarDispositivos(storeId, estado) {
    const devices = (await fbGet('devices')) || {};
    for (const id of Object.keys(devices)) {
        const d = devices[id];
        if (d && d.storeId === storeId) {
            await fbPut('devices/' + id + '/pendingCommand', { state: estado, at: agora() });
        }
    }
}

// ========== STATIC ==========
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/monitor';
    if (p === '/monitor') p = '/monitor.html';
    if (p.startsWith('/hunt/')) p = '/hunt.html';
    if (p === '/admin') p = '/admin.html';
    if (p === '/diagnostico') p = '/diagnostico.html';

    const filePath = path.join(PUBLIC_DIR, p);
    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404');
        return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(filePath));
}

// ========== ROTAS ==========
async function handler(req, res) {
    const url = req.url.split('?')[0];

    if (req.method === 'OPTIONS') {
        sendJSON(res, 204, {});
        return;
    }

    // ---------- API PUBLICA (cliente/monitor) ----------
    if (url === '/api/hunt/challenges') {
        const q = new URLSearchParams(req.url.split('?')[1] || '');
        const storeId = q.get('storeId') || STORE_ID;
        const list = await listChallenges(storeId);
        sendJSON(res, 200, { ok: true, storeId, challenges: list });
        return;
    }

    if (url === '/api/hunt/challenge') {
        const q = new URLSearchParams(req.url.split('?')[1] || '');
        const ch = await getChallenge(slugSeguro(q.get('slug')));
        sendJSON(res, 200, { ok: !!ch, challenge: ch });
        return;
    }

    if (url === '/api/hunt/ranking') {
        const q = new URLSearchParams(req.url.split('?')[1] || '');
        const storeId = q.get('storeId') || STORE_ID;
        const ranking = await computeRanking(storeId, 10);
        sendJSON(res, 200, { ok: true, storeId, ranking });
        return;
    }

    if (url === '/api/hunt/state') {
        const q = new URLSearchParams(req.url.split('?')[1] || '');
        const storeId = q.get('storeId') || STORE_ID;
        const challenges = await listChallenges(storeId);
        const active = challenges.find((c) => c.active !== false) || null;
        const ranking = await computeRanking(storeId, 10);
        const lastSuccess = await getLastSuccess(storeId);
        sendJSON(res, 200, { ok: true, storeId, storeName: STORE_NAME, activeChallenge: active, ranking, lastSuccess });
        return;
    }

    if (url === '/api/hunt/participate' && req.method === 'POST') {
        const body = await readBody(req);
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        const result = await participate(body, ip);
        sendJSON(res, result.ok ? 200 : 400, result);
        return;
    }

    // ---------- API DISPOSITIVO (ESP32) ----------
    if (url === '/api/devices/heartbeat' && req.method === 'POST') {
        const body = await readBody(req);
        const deviceId = slugSeguro(body.deviceId) || 'esp32-1';
        const storeId = slugSeguro(body.storeId) || STORE_ID;
        const devices = (await fbGet('devices')) || {};
        const existing = devices[deviceId];
        const now = agora();

        const pending = existing && existing.pendingCommand ? existing.pendingCommand : null;

        const device = {
            deviceId: deviceId,
            storeId: storeId,
            name: (existing && existing.name) || body.name || ('ESP32 ' + deviceId),
            lastHeartbeatAt: now,
            online: true,
            state: body.state || (existing && existing.state) || 'normal',
            pendingCommand: null
        };
        await fbPut('devices/' + deviceId, device);
        await fbPost('deviceEvents', { deviceId, type: 'heartbeat', at: now });

        // se havia comando pendente, devolve e limpa
        if (pending) {
            await fbPut('devices/' + deviceId + '/pendingCommand', null);
        }

        // estado desejado baseado no desafio ativo da loja
        const storeChallenges = await listChallenges(storeId);
        const active = storeChallenges.find((c) => c.active !== false) || null;
        const desiredState = active ? 'desafio' : 'normal';

        sendJSON(res, 200, { ok: true, command: pending, desiredState: desiredState, serverTime: now });
        return;
    }

    if (url === '/api/devices/state' && req.method === 'POST') {
        const body = await readBody(req);
        const deviceId = slugSeguro(body.deviceId) || 'esp32-1';
        const now = agora();
        const devices = (await fbGet('devices')) || {};
        const existing = devices[deviceId] || {};
        existing.deviceId = deviceId;
        existing.state = body.state || existing.state || 'normal';
        existing.lastHeartbeatAt = now;
        existing.online = true;
        existing.storeId = existing.storeId || STORE_ID;
        await fbPut('devices/' + deviceId, existing);
        await fbPost('deviceEvents', { deviceId, type: 'state', state: existing.state, at: now });
        sendJSON(res, 200, { ok: true });
        return;
    }

    // ---------- ADMIN (Basic Auth) ----------
    if (url.startsWith('/api/admin/')) {
        if (!basicAuth(req, res)) return;

        // status geral / diagnostico
        if (url === '/api/admin/status') {
            const challenges = await listChallenges(null);
            const participants = (await fbGet('participants')) || {};
            const devices = (await fbGet('devices')) || {};
            const lastSuccess = (await fbGet('lastSuccess')) || {};
            sendJSON(res, 200, {
                ok: true,
                store: { id: STORE_ID, name: STORE_NAME, baseUrl: BASE_URL },
                totalChallenges: challenges.length,
                totalParticipants: Object.keys(participants).length,
                devices,
                lastSuccess
            });
            return;
        }

        // desafios: listar + criar
        if (url === '/api/admin/challenges') {
            if (req.method === 'GET') {
                const challenges = await listChallenges(null);
                sendJSON(res, 200, { ok: true, challenges });
                return;
            }
            if (req.method === 'POST') {
                const body = await readBody(req);
                const slug = slugSeguro(body.slug) || ('c' + Date.now().toString(36));
                const challenges = (await fbGet('challenges')) || {};
                const ch = {
                    slug: slug,
                    name: String(body.name || 'Desafio sem nome').slice(0, 80),
                    description: String(body.description || '').slice(0, 200),
                    points: Number(body.points || 0),
                    storeId: slugSeguro(body.storeId) || STORE_ID,
                    productName: String(body.productName || '').slice(0, 80),
                    active: body.active !== false,
                    validFrom: body.validFrom || null,
                    validTo: body.validTo || null,
                    createdAt: agora()
                };
                challenges[slug] = ch;
                await fbPut('challenges', challenges);
                sendJSON(res, 200, { ok: true, challenge: ch, qrUrl: hostDoReq(req) + '/hunt/' + slug });
                return;
            }
        }

        // desafio individual: editar
        const mChallenge = url.match(/^\/api\/admin\/challenges\/([a-zA-Z0-9\-_]+)$/);
        if (mChallenge && req.method === 'POST') {
            const slug = mChallenge[1];
            const body = await readBody(req);
            const challenges = (await fbGet('challenges')) || {};
            const ch = challenges[slug];
            if (!ch) { sendJSON(res, 404, { ok: false, erro: 'nao_encontrado' }); return; }
            if (body.name != null) ch.name = String(body.name).slice(0, 80);
            if (body.description != null) ch.description = String(body.description).slice(0, 200);
            if (body.points != null) ch.points = Number(body.points);
            if (body.productName != null) ch.productName = String(body.productName).slice(0, 80);
            if (body.active != null) ch.active = body.active === true || body.active === 'true';
            if (body.validFrom != null) ch.validFrom = body.validFrom;
            if (body.validTo != null) ch.validTo = body.validTo;
            challenges[slug] = ch;
            await fbPut('challenges', challenges);
            sendJSON(res, 200, { ok: true, challenge: ch, qrUrl: hostDoReq(req) + '/hunt/' + slug });
            return;
        }

        // participantes
        if (url === '/api/admin/participants') {
            const participants = (await fbGet('participants')) || {};
            const ledger = (await fbGet('pointsLedger')) || {};
            const totals = {};
            for (const key of Object.keys(ledger)) {
                const e = ledger[key];
                if (e && e.participantId) totals[e.participantId] = (totals[e.participantId] || 0) + Number(e.amount || 0);
            }
            const list = Object.values(participants).map((p) => ({
                ...p,
                points: totals[p.id] || 0
            })).sort((a, b) => (b.points || 0) - (a.points || 0));
            sendJSON(res, 200, { ok: true, participants: list });
            return;
        }

        // resetar campanha (ranking)
        if (url === '/api/admin/ranking/reset' && req.method === 'POST') {
            await fbDel('participations');
            await fbDel('pointsLedger');
            await fbDel('lastSuccess');
            sendJSON(res, 200, { ok: true, mensagem: 'Campanha resetada' });
            return;
        }

        // dispositivos
        if (url === '/api/admin/devices') {
            const devices = (await fbGet('devices')) || {};
            sendJSON(res, 200, { ok: true, devices });
            return;
        }

        sendJSON(res, 404, { ok: false, erro: 'rota_nao_encontrada' });
        return;
    }

    // ---------- STATIC ----------
    serveStatic(req, res);
}

const server = http.createServer((req, res) => {
    handler(req, res).catch((e) => {
        console.error('[ERRO] ', e && e.message ? e.message : e);
        try { sendJSON(res, 500, { ok: false, erro: 'erro_interno' }); } catch (_) {}
    });
});

process.on('unhandledRejection', (e) => {
    console.error('[unhandledRejection]', e && e.message ? e.message : e);
});

// Permite ser usado como modulo (integrado ao servidor ja publicado) ou sozinho
function handlerPublico() {
    return (req, res) => {
        handler(req, res).catch((e) => {
            console.error('[ERRO] ', e && e.message ? e.message : e);
            try { sendJSON(res, 500, { ok: false, erro: 'erro_interno' }); } catch (_) {}
        });
    };
}
module.exports = { handler: handlerPublico() };

if (require.main === module) {
    server.listen(PORT, () => {
        console.log('==============================================');
        console.log('  TO GO HUNT - servidor V1');
        console.log('==============================================');
        console.log('  Monitor:      ' + BASE_URL + '/monitor');
        console.log('  Admin:        ' + BASE_URL + '/admin');
        console.log('  Diagnostico:  ' + BASE_URL + '/diagnostico');
        console.log('  Cliente (QR): ' + BASE_URL + '/hunt/ABC123');
        console.log('  Loja:         ' + STORE_ID + ' (' + STORE_NAME + ')');
        console.log('  Firebase:     ' + FIREBASE_DB + '/' + DB_ROOT);
        console.log('==============================================');
    });
}
