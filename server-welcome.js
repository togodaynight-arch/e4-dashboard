const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3002;
// URL do Firebase Realtime Database (ex: https://projeto-default-rtdb.firebaseio.com/)
// Se vazio, salva num arquivo local (bom para testes, mas no Render some ao reiniciar).
const DB_URL = process.env.CONFIG_DB_URL || '';
const ADMIN_PASS = process.env.ADMIN_PASS || 'togo2026';
const CONFIG_FILE = path.join(__dirname, 'welcome-config.json');

const DEFAULT_CONFIG = {
    loja: 'TRANS BUS',
    mensagem: 'BEM-VINDO',
    promocoes: [
        { titulo: 'OFERTA DO DIA', descricao: 'Confira as novidades da nossa loja', cor: '#d9b759' },
        { titulo: 'ACEITAMOS PIX', descricao: 'Pagamento rápido e seguro', cor: '#10b981' }
    ]
};

// ===== STORAGE: Firebase (se configurado) ou arquivo local =====
function getRemote(cb) {
    if (!DB_URL) { cb(null, null); return; }
    var req = https.get(DB_URL + '/config.json', function(res) {
        var body = '';
        res.on('data', function(c) { body += c; });
        res.on('end', function() {
            if (res.statusCode !== 200 || !body || body === 'null') { cb(null, null); return; }
            try { cb(null, JSON.parse(body)); } catch(e) { cb(null, null); }
        });
    });
    req.on('error', function() { cb(null, null); });
}

function putRemote(data, cb) {
    if (!DB_URL) { cb(new Error('sem banco configurado')); return; }
    var post = JSON.stringify(data);
    var opts = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(post) }
    };
    var req = https.request(DB_URL + '/config.json', opts, function(res) {
        res.on('data', function() {});
        res.on('end', function() { cb(null); });
    });
    req.on('error', function(e) { cb(e); });
    req.write(post);
    req.end();
}

function getFile(cb) {
    fs.readFile(CONFIG_FILE, 'utf8', function(err, d) {
        if (err) { cb(null, null); return; }
        try { cb(null, JSON.parse(d)); } catch(e) { cb(null, null); }
    });
}

function putFile(data, cb) {
    fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2), cb);
}

function lerConfig(cb) {
    if (DB_URL) { getRemote(cb); } else { getFile(cb); }
}

function salvarConfig(data, cb) {
    if (DB_URL) { putRemote(data, cb); } else { putFile(data, cb); }
}

// ===== HELPERS =====
function sendJSON(res, code, obj) {
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(obj));
}

function lerBody(req, cb) {
    var b = '';
    req.on('data', function(c) { b += c; });
    req.on('end', function() {
        try { cb(JSON.parse(b)); } catch(e) { cb(null); }
    });
}

function serveFile(res, f) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, f)));
}

// ===== SERVER =====
const server = http.createServer(function(req, res) {
    var url = req.url.split('?')[0];

    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
        res.end();
        return;
    }

    if (url === '/api/config' && req.method === 'GET') {
        lerConfig(function(err, data) {
            var cfg = Object.assign({}, DEFAULT_CONFIG, data || {});
            sendJSON(res, 200, cfg);
        });
        return;
    }

    if (url === '/api/config' && req.method === 'POST') {
        lerBody(req, function(body) {
            if (!body || body.senha !== ADMIN_PASS) {
                sendJSON(res, 401, { ok: false, error: 'Senha incorreta' });
                return;
            }
            var novo = {};
            if (typeof body.loja === 'string') novo.loja = body.loja;
            if (typeof body.mensagem === 'string') novo.mensagem = body.mensagem;
            if (Array.isArray(body.promocoes)) novo.promocoes = body.promocoes;

            salvarConfig(novo, function(err) {
                if (err) { sendJSON(res, 500, { ok: false, error: String(err.message || err) }); return; }
                sendJSON(res, 200, { ok: true });
            });
        });
        return;
    }

    if (url === '/' || url === '/welcome') { serveFile(res, 'welcome.html'); return; }
    if (url === '/admin') { serveFile(res, 'admin.html'); return; }

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('404');
});

server.listen(PORT, function() {
    console.log('Tela de Boas-vindas: http://localhost:' + PORT);
    console.log('Painel admin (conteudo): http://localhost:' + PORT + '/admin');
    console.log(DB_URL ? 'Banco: Firebase (' + DB_URL + ')' : 'Banco: arquivo local (aviso: some no Render ao reiniciar)');
});
