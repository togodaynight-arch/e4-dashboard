const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3002;

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/welcome') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'welcome.html')));
    } else {
        res.writeHead(404);
        res.end('404');
    }
});

server.listen(PORT, () => {
    console.log('Monitor de Boas-vindas: http://localhost:' + PORT);
    console.log('Painel de controle: pressione C');
});
