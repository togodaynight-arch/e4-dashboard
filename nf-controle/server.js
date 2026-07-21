const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3002;
const DATA_FILE = path.join(__dirname, 'data.json');

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

function lerDados() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, '{"notas":[],"nextId":1}');
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
}

function salvarDados(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function lerBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
        });
    });
}

function send(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
    let file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    let filePath = path.join(__dirname, 'public', file);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Página não encontrada</h1>');
        return;
    }
    const ext = path.extname(filePath);
    const ct = MIME[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': ct + '; charset=utf-8' });
    res.end(data);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        });
        return res.end();
    }

    const url = new URL(req.url, 'http://localhost');

    // GET /api/notas
    if (req.method === 'GET' && url.pathname === '/api/notas') {
        const dados = lerDados();
        return send(res, 200, dados);
    }

    // POST /api/notas
    if (req.method === 'POST' && url.pathname === '/api/notas') {
        const dados = lerDados();
        const body = await lerBody(req);

        const nota = {
            id: dados.nextId++,
            numero: body.numero || '',
            fornecedor: body.fornecedor || '',
            dataEmissao: body.dataEmissao || '',
            valorTotal: parseFloat(body.valorTotal) || 0,
            boletos: (body.boletos || []).map(b => ({
                vencimento: b.vencimento || '',
                valor: parseFloat(b.valor) || 0,
                pago: false,
            })),
            observacao: body.observacao || '',
            criadoEm: new Date().toISOString(),
        };

        dados.notas.push(nota);
        salvarDados(dados);
        return send(res, 201, nota);
    }

    // PUT /api/notas/:id
    const putMatch = url.pathname.match(/^\/api\/notas\/(\d+)$/);
    if (req.method === 'PUT' && putMatch) {
        const id = parseInt(putMatch[1]);
        const dados = lerDados();
        const body = await lerBody(req);
        const nota = dados.notas.find(n => n.id === id);
        if (!nota) return send(res, 404, { error: 'Nota não encontrada' });

        if (body.numero !== undefined) nota.numero = body.numero;
        if (body.fornecedor !== undefined) nota.fornecedor = body.fornecedor;
        if (body.dataEmissao !== undefined) nota.dataEmissao = body.dataEmissao;
        if (body.valorTotal !== undefined) nota.valorTotal = parseFloat(body.valorTotal) || 0;
        if (body.boletos !== undefined) nota.boletos = body.boletos;
        if (body.observacao !== undefined) nota.observacao = body.observacao;

        salvarDados(dados);
        return send(res, 200, nota);
    }

    // DELETE /api/notas/:id
    const delMatch = url.pathname.match(/^\/api\/notas\/(\d+)$/);
    if (req.method === 'DELETE' && delMatch) {
        const id = parseInt(delMatch[1]);
        const dados = lerDados();
        const idx = dados.notas.findIndex(n => n.id === id);
        if (idx === -1) return send(res, 404, { error: 'Nota não encontrada' });

        dados.notas.splice(idx, 1);
        salvarDados(dados);
        return send(res, 200, { ok: true });
    }

    // Static files
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('  🧾 Controle de Notas Fiscais e Boletos');
    console.log('  =======================================');
    console.log('');
    console.log(`  👉 http://localhost:${PORT}`);
    console.log('');
});
