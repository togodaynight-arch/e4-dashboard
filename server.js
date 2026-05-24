const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const API_BASE = 'https://portal.e4sistemas.com.br';
const CLIENT_ID = '215';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRlIjoiMjE1IiwiZGF0YSI6IjIwMjYtMDQtMjkgMTU6NDU6MTQiLCJkb2N1bWVudG8iOiJ2cDAwMDA3MzUzLXAwMDEiLCJlbmRlcmVjbyI6InJ1YSB0cmFqYW5vIHJlaXMiLCJjb250YXRvIjoiY2xpZW50ZSIsInRlbGVmb25lIjoiMTE5OTk5OTkiLCJpc3MiOiJlNHNpc3RlbWFzLmNvbS5iciIsInN1YiI6IkF1dGVudGljYVx1MDBlN1x1MDBlM28iLCJhdWQiOiJUZXJjZWlyb3MgdmlhIEFQSSJ9.VKTPNRxHJauxQnSc/ur7cEpc9P6XO/lLYDacj8dj450=';

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
    let urlPath = req.url.split('?')[0];

    // Rota /conciliacao serve da pasta conciliacao/
    if (urlPath === '/conciliacao' || urlPath === '/conciliacao/') {
        urlPath = '/conciliacao/index.html';
    }

    // Rota /scanner -> public/scanner.html
    if (urlPath === '/scanner' || urlPath === '/scanner/') {
        urlPath = '/scanner.html';
    }

    let filePath;
    if (urlPath.startsWith('/conciliacao/')) {
        filePath = path.join(__dirname, 'conciliacao', urlPath.replace('/conciliacao/', '/'));
    } else {
        filePath = urlPath === '/' ? path.join(__dirname, 'public', 'index.html') : path.join(__dirname, 'public', urlPath);
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(__dirname, 'public', 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Pagina nao encontrada</h1>');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
        'Content-Type': contentType + '; charset=utf-8',
        'Cache-Control': 'no-cache'
    });
    res.end(data);
}

function proxyRequest(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        const fullUrl = `${API_BASE}${req.url}`;

        const options = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'X-Cliente-Id': CLIENT_ID,
                'Authorization': `Bearer ${TOKEN}`
            }
        };

        if (req.method === 'GET') {
            delete options.headers['Content-Type'];
        }

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

        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Erro na conexao com a API', details: err.message }));
        });

        if (body && req.method !== 'GET') {
            proxyReq.write(body);
        }
        proxyReq.end();
    });
}

function handleOptions(req, res) {
    res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cliente-Id',
        'Access-Control-Max-Age': '86400'
    });
    res.end();
}

const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        handleOptions(req, res);
        return;
    }

    if (req.url.startsWith('/api/')) {
        proxyRequest(req, res);
    } else {
        serveStatic(req, res);
    }
});

server.listen(PORT, () => {
    console.log('');
    console.log('  Dashboard de Vendas - E4 Sistemas');
    console.log('  =================================');
    console.log('');
    console.log('  Acesse no navegador:');
    console.log('');
    console.log('  ->  http://localhost:' + PORT);
    console.log('');
});