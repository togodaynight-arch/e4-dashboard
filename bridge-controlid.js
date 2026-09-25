// ============================================================
//  PONTE: leitor facial (Control iD) -> Firebase -> tela da TV
//  Roda no mini PC da loja (Itautec), ligado no mesmo WiFi/rede
//  Como usar:  node bridge-controlid.js
// ============================================================

const http = require('http');
const https = require('https');

// ---------- CONFIGURAÇÃO (ajuste se precisar) ----------
const CID_HOST = '192.168.0.23';       // IP do leitor facial
const CID_USER = 'admin';              // login do leitor
const CID_PASS = 'admin';              // senha do leitor
const FIREBASE = 'https://loja-bemvindo-default-rtdb.firebaseio.com';
const INTERVALO_MS = 2500;             // checa o leitor a cada 2,5s
// ---------------------------------------------------------

let session = null;
let users = {};
let lastId = null;

function postCID(path, body, form) {
    return new Promise(function(resolve, reject) {
        var data = form ? body : JSON.stringify(body);
        var opts = {
            hostname: CID_HOST,
            port: 80,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        var req = http.request(opts, function(res) {
            var b = '';
            res.on('data', function(c) { b += c; });
            res.on('end', function() {
                try { resolve(JSON.parse(b)); } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function putFirebase(path, data) {
    return new Promise(function(resolve, reject) {
        var body = JSON.stringify(data);
        var req = https.request(FIREBASE + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, function(res) {
            res.resume();
            res.on('end', resolve);
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function cidLogin() {
    var r = await postCID('/login.fcgi', 'login=' + CID_USER + '&password=' + CID_PASS, true);
    session = r.session;
    if (!session) throw new Error('Login falhou');
}

async function cidCarregarUsuarios() {
    var r = await postCID('/load_objects.fcgi?session=' + session, { object: 'users' });
    users = {};
    (r.users || []).forEach(function(u) { users[u.id] = (u.name || '').trim(); });
}

async function cidUltimaEntrada() {
    var r = await postCID('/load_objects.fcgi?session=' + session, {
        object: 'access_logs',
        limit: 1,
        order: ['time', 'descending']
    });
    var log = (r.access_logs || [])[0];
    if (!log) return null;
    if (log.event !== 7 || !log.user_id) return null;   // só "acesso liberado" com usuário
    var nome = users[log.user_id];
    if (!nome) return null;
    return { id: log.id, nome: nome, time: log.time };
}

async function checar() {
    try {
        if (!session) await cidLogin();
        var ent = await cidUltimaEntrada();
        if (ent && ent.id !== lastId) {
            lastId = ent.id;
            await putFirebase('/entrada.json', { id: ent.id, nome: ent.nome, time: ent.time });
            var d = new Date(ent.time * 1000);
            console.log('[' + d.toLocaleString('pt-BR') + '] Entrada: ' + ent.nome);
        }
    } catch (e) {
        session = null; // força novo login na próxima tentativa
        console.log('Aviso: ' + e.message + ' (tentando de novo...)');
    }
    setTimeout(checar, INTERVALO_MS);
}

async function main() {
    console.log('Ponte Control iD -> Firebase iniciada.');
    console.log('Leitor: ' + CID_HOST + '  |  Firebase: ' + FIREBASE);
    try {
        await cidLogin();
        await cidCarregarUsuarios();
        console.log('Conectado ao leitor. Usuarios carregados: ' + Object.keys(users).length);
    } catch (e) {
        console.log('Nao conseguiu conectar de primeira: ' + e.message);
    }
    setInterval(async function() {
        try { await cidCarregarUsuarios(); } catch(e) {}
    }, 5 * 60 * 1000); // recarrega lista de usuarios a cada 5 min
    checar();
}

main();
