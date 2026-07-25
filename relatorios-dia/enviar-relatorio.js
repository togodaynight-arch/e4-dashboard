const https = require('https');

const API_BASE = 'https://portal.e4sistemas.com.br';
const CLIENT_ID = '215';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRlIjoiMjE1IiwiZGF0YSI6IjIwMjYtMDQtMjkgMTU6NDU6MTQiLCJkb2N1bWVudG8iOiJ2cDAwMDA3MzUzLXAwMDEiLCJlbmRlcmVjbyI6InJ1YSB0cmFqYW5vIHJlaXMiLCJjb250YXRvIjoiY2xpZW50ZSIsInRlbGVmb25lIjoiMTE5OTk5OTkiLCJpc3MiOiJlNHNpc3RlbWFzLmNvbS5iciIsInN1YiI6IkF1dGVudGljYVx1MDBlN1x1MDBlM28iLCJhdWQiOiJUZXJjZWlyb3MgdmlhIEFQSSJ9.VKTPNRxHJauxQnSc/ur7cEpc9P6XO/lLYDacj8dj450=';

// Configure seu telefone com DDD:
const TELEFONE = '55SEU_TELEFONE_AQUI';

function formatarMoeda(v) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataHoje() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function apiPost(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const opts = {
            hostname: 'portal.e4sistemas.com.br',
            path: '/api' + path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Cliente-Id': CLIENT_ID,
                'Authorization': 'Bearer ' + TOKEN
            }
        };
        const req = https.request(opts, (res) => {
            let resp = '';
            res.on('data', c => { resp += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(resp)); }
                catch(e) { reject(new Error('Resposta invalida: ' + resp.slice(0, 200))); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function buscarHoje() {
    console.log('Buscando vendas de hoje...');
    const hoje = dataHoje();
    const vendas = [];
    const first = await apiPost('/vendas/listagem?pagina=1&quantidade=100', {
        unidade: null,
        dataInicial: hoje + ' 00:00:00',
        dataFinal: hoje + ' 23:59:59'
    });

    if (!first.registros) {
        console.log('Nenhuma venda encontrada ou erro na API.');
        return [];
    }

    vendas.push(...first.registros);
    const totalPages = Math.ceil((first.paginacao?.qtdTotalRegistros || 0) / 100);

    for (let i = 2; i <= Math.min(totalPages, 10); i++) {
        const page = await apiPost('/vendas/listagem?pagina=' + i + '&quantidade=100', {
            unidade: null,
            dataInicial: hoje + ' 00:00:00',
            dataFinal: hoje + ' 23:59:59'
        });
        if (page.registros) vendas.push(...page.registros);
    }

    return vendas.filter(v => !v.cancelado);
}

function montarMensagem(vendas) {
    const total = vendas.reduce((s, v) => s + (v.valorLiquido || 0), 0);
    const qtd = vendas.length;
    const itens = vendas.reduce((s, v) => s + (v.produtos || []).filter(p => !p.cancelado).reduce((ss, p) => ss + (p.quantidade || 1), 0), 0);
    const ticket = qtd > 0 ? total / qtd : 0;

    // Por loja
    const porLoja = {};
    vendas.forEach(v => {
        const nome = v.unidadeNome || v.unidadeNombre || 'Sem loja';
        porLoja[nome] = (porLoja[nome] || 0) + (v.valorLiquido || 0);
    });

    // Top 5 produtos
    const produtoMap = {};
    vendas.forEach(v => {
        (v.produtos || []).filter(p => !p.cancelado).forEach(p => {
            const nome = p.descricaoReduzida || p.descricaoComercial || '--';
            produtoMap[nome] = (produtoMap[nome] || 0) + (p.quantidade || 1);
        });
    });
    const top5 = Object.entries(produtoMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const data = new Date().toLocaleDateString('pt-BR');
    let msg = 'Relatorio de Vendas - ' + data + '\n\n';
    msg += 'Total: ' + formatarMoeda(total) + '\n';
    msg += 'Vendas: ' + qtd.toLocaleString('pt-BR') + '\n';
    msg += 'Itens: ' + itens.toLocaleString('pt-BR') + '\n';
    msg += 'Ticket Medio: ' + formatarMoeda(ticket) + '\n\n';

    if (Object.keys(porLoja).length > 0) {
        msg += 'Por Loja:\n';
        Object.entries(porLoja).sort((a, b) => b[1] - a[1]).forEach(([loja, v]) => {
            msg += '  ' + loja + ': ' + formatarMoeda(v) + '\n';
        });
    }
    if (top5.length > 0) {
        msg += '\nTop 5 Produtos:\n';
        top5.forEach(([nome, q], i) => {
            msg += '  ' + (i+1) + '. ' + nome + ': ' + q.toLocaleString('pt-BR') + ' un\n';
        });
    }
    return msg;
}

async function enviarWhatsApp(mensagem) {
    console.log('Enviando WhatsApp...');
    try {
        const res = await apiPost('/alertas/whatsapp', {
            telefone: TELEFONE,
            mensagem: mensagem
        });
        console.log('Resposta:', JSON.stringify(res));
        return res;
    } catch(e) {
        console.error('Erro ao enviar WhatsApp:', e.message);
        throw e;
    }
}

async function main() {
    const args = process.argv.slice(2);

    // Verifica se tem telefone nos argumentos
    const telefoneArg = args.find(a => a.startsWith('--fone='));
    const fone = telefoneArg ? telefoneArg.replace('--fone=', '') : TELEFONE;

    if (fone === '55SEU_TELEFONE_AQUI') {
        console.log('========================================');
        console.log('Configure seu telefone no script!');
        console.log('Edite o arquivo enviar-relatorio.js');
        console.log('Ou use: node enviar-relatorio.js --fone=SEU_NUMERO');
        console.log('');
        console.log('Exemplo: node enviar-relatorio.js --fone=11999999999');
        console.log('========================================');
        process.exit(1);
    }

    try {
        const vendas = await buscarHoje();

        if (vendas.length === 0) {
            console.log('Nenhuma venda encontrada hoje.');
            await enviarWhatsApp('Hoje (' + new Date().toLocaleDateString('pt-BR') + ') ainda nao ha vendas registradas no sistema.');
        } else {
            const msg = montarMensagem(vendas);
            console.log('=== MENSAGEM ===');
            console.log(msg);
            console.log('================');
            await enviarWhatsApp(msg);
        }
        console.log('Relatorio enviado com sucesso!');
    } catch(e) {
        console.error('Erro:', e.message);
        process.exit(1);
    }
}

main();
