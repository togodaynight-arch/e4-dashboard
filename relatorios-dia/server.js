const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3003;
const API_BASE = 'https://portal.e4sistemas.com.br';
const CLIENT_ID = '215';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRlIjoiMjE1IiwiZGF0YSI6IjIwMjYtMDQtMjkgMTU6NDU6MTQiLCJkb2N1bWVudG8iOiJ2cDAwMDA3MzUzLXAwMDEiLCJlbmRlcmVjbyI6InJ1YSB0cmFqYW5vIHJlaXMiLCJjb250YXRvIjoiY2xpZW50ZSIsInRlbGVmb25lIjoiMTE5OTk5OTkiLCJpc3MiOiJlNHNpc3RlbWFzLmNvbS5iciIsInN1YiI6IkF1dGVudGljYVx1MDBlN1x1MDBlM28iLCJhdWQiOiJUZXJjZWlyb3MgdmlhIEFQSSJ9.VKTPNRxHJauxQnSc/ur7cEpc9P6XO/lLYDacj8dj450=';

const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
    let file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    let filePath = path.join(__dirname, 'public', file);
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Pagina nao encontrada</h1>');
        return;
    }
    const ext = path.extname(filePath);
    const ct = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': ct + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
}

function apiHeaders() {
    return { 'Content-Type': 'application/json', 'X-Cliente-Id': CLIENT_ID, 'Authorization': 'Bearer ' + TOKEN };
}

function proxyE4(req, res, apiPath) {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
        const fullUrl = API_BASE + '/api' + apiPath;
        const opts = { method: req.method, headers: apiHeaders() };
        if (req.method === 'GET') delete opts.headers['Content-Type'];

        const proxyReq = https.request(fullUrl, opts, (proxyRes) => {
            const headers = {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cliente-Id',
                'Cache-Control': 'no-cache'
            };
            res.writeHead(proxyRes.statusCode, headers);
            let data = '';
            proxyRes.on('data', c => { data += c; });
            proxyRes.on('end', () => { res.end(data); });
        });
        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Erro na API E4: ' + err.message }));
        });
        if (body && req.method !== 'GET') proxyReq.write(body);
        proxyReq.end();
    });
}

const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cliente-Id',
            'Access-Control-Max-Age': '86400',
        });
        return res.end();
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/e4/')) {
        const apiPath = url.pathname.replace('/api/e4', '') + url.search;
        return proxyE4(req, res, apiPath);
    }

    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('   Relatorios Diarios');
    console.log('  ====================');
    console.log('');
    console.log('   http://localhost:' + PORT);
    console.log('');
});
