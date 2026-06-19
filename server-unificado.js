const http = require('http');
const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_BASE = 'https://portal.e4sistemas.com.br';
const CLIENT_ID = '215';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRlIjoiMjE1IiwiZGF0YSI6IjIwMjYtMDQtMjkgMTU6NDU6MTQiLCJkb2N1bWVudG8iOiJ2cDAwMDA3MzUzLXAwMDEiLCJlbmRlcmVjbyI6InJ1YSB0cmFqYW5vIHJlaXMiLCJjb250YXRvIjoiY2xpZW50ZSIsInRlbGVmb25lIjoiMTE5OTk5OTkiLCJpc3MiOiJlNHNpc3RlbWFzLmNvbS5iciIsInN1YiI6IkF1dGVudGljYVx1MDBlN1x1MDBlM28iLCJhdWQiOiJUZXJjZWlyb3MgdmlhIEFQSSJ9.VKTPNRxHJauxQnSc/ur7cEpc9P6XO/lLYDacj8dj450=';
const PORTAL_USER = 'togodaynight@gmail.com';
const PORTAL_PASS = '190690';
const OCCURRENCE_TYPES = ['1','2','8','13','32','41','42'];

let phpsessid = null;
let sessExpires = 0;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// ========== STATIC FILE SERVER ==========
function serveStatic(req, res) {
    let urlPath = req.url.split('?')[0];
    let filePath;

    if (urlPath.startsWith('/conciliacao')) {
        let subPath = urlPath.replace('/conciliacao', '');
        if (subPath === '' || subPath === '/') subPath = '/index.html';
        if (subPath.startsWith('/')) subPath = subPath.substring(1);
        filePath = path.join(__dirname, 'conciliacao-site', subPath);
    } else {
        if (urlPath === '/') urlPath = '/index.html';
        if (urlPath === '/scanner') urlPath = '/scanner.html';
        if (urlPath === '/busca-produto') urlPath = '/busca-produto.html';
        if (urlPath === '/busca-planilha') urlPath = '/busca-planilha.html';
        filePath = path.join(__dirname, 'public', urlPath);
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('404');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(data);
}

// ========== API PROXY ==========
function proxyAPI(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        const fullUrl = `${API_BASE}${req.url}`;
        const options = {
            method: req.method,
            headers: { 'Content-Type': 'application/json', 'X-Cliente-Id': CLIENT_ID, 'Authorization': `Bearer ${TOKEN}` }
        };
        if (req.method === 'GET') delete options.headers['Content-Type'];

        const proxyReq = https.request(fullUrl, options, (proxyRes) => {
            const headers = {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cliente-Id',
                'Cache-Control': 'no-cache'
            };
            res.writeHead(proxyRes.statusCode, headers);
            let data = '';
            proxyRes.on('data', chunk => { data += chunk; });
            proxyRes.on('end', () => { res.end(data); });
        });

        proxyReq.on('error', () => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Erro na API' }));
        });

        if (body && req.method !== 'GET') proxyReq.write(body);
        proxyReq.end();
    });
}

// ========== PORTAL SESSION ==========
function portalLogin() {
    return new Promise(function(resolve, reject) {
        https.get(API_BASE + '/central/index/login', function(res1) {
            var cookies = res1.headers['set-cookie'] || [];
            var phpsess = '';
            cookies.forEach(function(c) {
                var m = c.match(/^([^=]+)=([^;]+)/);
                if (m && m[1].trim() === 'PHPSESSID') phpsess = m[2];
            });
            if (!phpsess) { reject('Nao obteve cookie'); return; }

            var postData = querystring.stringify({usuario: PORTAL_USER, senha: PORTAL_PASS, modulo: ''});
            var opts = {
                hostname: 'portal.e4sistemas.com.br',
                path: '/central/index/logar',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cookie': 'PHPSESSID=' + phpsess,
                    'Referer': API_BASE + '/central/index/login'
                }
            };
            var req2 = https.request(opts, function(res2) {
                var body = '';
                res2.on('data', function(c) { body += c; });
                res2.on('end', function() {
                    try {
                        var j = JSON.parse(body);
                        if (j.sMensaje === true || j.sMensagem === true) {
                            phpsessid = phpsess;
                            sessExpires = Date.now() + 25 * 60 * 1000;
                            resolve(phpsess);
                        } else {
                            reject('Login falhou');
                        }
                    } catch(e) {
                        reject('Erro login');
                    }
                });
            });
            req2.on('error', function(e) { reject(e.message); });
            req2.write(postData);
            req2.end();
        }).on('error', function(e) { reject(e.message); });
    });
}

async function ensureSession() {
    if (!phpsessid || Date.now() > sessExpires) {
        await portalLogin();
    }
}

// ========== OCORRENCIAS ==========
function fetchOcorrencias(inicio, fim) {
    inicio = inicio || '';
    fim = fim || '';
    return new Promise(async function(resolve, reject) {
        try { await ensureSession(); } catch(e) { reject(e); return; }
        var hoje = new Date();
        var dataInicioStr = inicio || (String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0') + '/' + hoje.getFullYear());
        var dataFimStr = fim || dataInicioStr;
        var postData = querystring.stringify({
            draw: '1', start: '0', length: '200',
            'order[0][column]': '8', 'order[0][dir]': 'desc',
            'filtro-filtro-agrupamento': 'T',
            'filtro-filtro-tipo_data': '1',
            'filtro-filtro-data_inicio': dataInicioStr,
            'filtro-filtro-data_fim': dataFimStr,
            'filtro-avancado': 'SIM'
        });
        [1,2,3].forEach(function(id) { postData += '&filtro-filtro-id_lojas%5B%5D=' + id; });
        OCCURRENCE_TYPES.forEach(function(t) { postData += '&filtro-filtro-ws_ocorrencias_frente_caixa%5B%5D=' + t; });

        var opts = {
            hostname: 'portal.e4sistemas.com.br',
            path: '/basico/ocorrencias-pdv/retornar-dados',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': 'PHPSESSID=' + phpsessid,
                'Referer': API_BASE + '/basico/ocorrencias-pdv'
            }
        };
        var req = https.request(opts, function(res) {
            var body = '';
            res.on('data', function(c) { body += c; });
            res.on('end', function() {
                try {
                    var j = JSON.parse(body);
                    resolve(j.aDados || []);
                } catch(e) { reject('Erro parse'); }
            });
        });
        req.on('error', function(e) { reject(e.message); });
        req.write(postData);
        req.end();
    });
}

function handleOcorrencias(req, res) {
    var qs = querystring.parse((req.url.split('?')[1] || ''));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    fetchOcorrencias(qs.inicio, qs.fim).then(function(dados) {
        var simplified = dados.map(function(o) {
            return {
                id: o.id, data: o.data_ocorrencia, ocorrencia: o.ocorrencia,
                codigo: o.cod_operacao || o.ws_ocorrencias_frente_caixa || '',
                unidade: o.unidade, pdv: o.pdv, cupom: o.cupom, valor: o.cupons_vl_liquido,
                transacao: o.transacao, cancelado: o.cupons_cancelado,
                situacao: o.cupons_divergencias_status || o.status,
                cliente: o.cliente || '', cpf: o.cpf_cliente || ''
            };
        });
        res.end(JSON.stringify({ ok: true, total: simplified.length, ocorrencias: simplified }));
    }).catch(function(err) {
        res.end(JSON.stringify({ ok: false, error: err }));
    });
}

// ========== ENTRADAS PORTA ==========
function fetchEntradasPorta() {
    return new Promise(async function(resolve, reject) {
        try { await ensureSession(); } catch(e) { reject(e); return; }
        var hoje = new Date();
        var dataStr = String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0') + '/' + hoje.getFullYear();
        var postData = querystring.stringify({
            draw: '1', start: '0', length: '500',
            'order[0][column]': '3', 'order[0][dir]': 'asc',
            'filtro-filtro-tipo_periodo': '1',
            'filtro-filtro-periodo_inicio': dataStr,
            'filtro-filtro-periodo_final': dataStr,
            'filtro-avancado': 'SIM'
        });
        var opts = {
            hostname: 'portal.e4sistemas.com.br',
            path: '/basico/log-porta-acessos/retornar-dados',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': 'PHPSESSID=' + phpsessid,
                'Referer': API_BASE + '/basico/log-porta-acessos'
            }
        };
        var req = https.request(opts, function(res) {
            var body = '';
            res.on('data', function(c) { body += c; });
            res.on('end', function() {
                try {
                    var j = JSON.parse(body);
                    resolve(j.aDados || []);
                } catch(e) { reject('Erro parse'); }
            });
        });
        req.on('error', function(e) { reject(e.message); });
        req.write(postData);
        req.end();
    });
}

function handleEntradasPorta(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    fetchEntradasPorta().then(function(dados) {
        var simplified = dados.map(function(o) {
            return {
                id: o.id, data: o.datahora, loja: o.loja, cliente: o.cliente,
                cpf: o.cpf, cartao: o.cartao, telefone: o.telefone, email: o.email,
                apartamento: o.apartamento, obs: o.obs, trava: o.app_porta_cad_tmp_loja,
                status: o.status === '0' ? 'Liberado' : 'Erro'
            };
        });
        res.end(JSON.stringify({ ok: true, total: simplified.length, entradas: simplified }));
    }).catch(function(err) {
        res.end(JSON.stringify({ ok: false, error: err }));
    });
}

// ========== MAIN SERVER ==========
const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' });
        res.end();
        return;
    }
    if (req.url.startsWith('/ocorrencias')) { handleOcorrencias(req, res); return; }
    if (req.url.startsWith('/entradas-porta')) { handleEntradasPorta(req, res); return; }
    if (req.url.startsWith('/api/')) { proxyAPI(req, res); return; }
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log('Dashboard E4 rodando na porta ' + PORT);
    console.log('Vendas: http://localhost:' + PORT);
    console.log('Conciliacao: http://localhost:' + PORT + '/conciliacao');
});
