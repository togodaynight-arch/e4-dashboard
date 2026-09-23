const https = require('https');

const API_BASE = 'https://portal.e4sistemas.com.br';
const CLIENT_ID = '215';
const TOKEN = process.env.E4_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRlIjoiMjE1IiwiZGF0YSI6IjIwMjYtMDktMjIgMTY6MzU6MjEiLCJkb2N1bWVudG8iOiJ0byBnbyIsImVuZGVyZWNvIjoiYSIsImNvbnRhdG8iOiJhIiwidGVsZWZvbmUiOiIyMTUiLCJpc3MiOiJlNHNpc3RlbWFzLmNvbS5iciIsInN1YiI6IkF1dGVudGljYVx1MDBlN1x1MDBlM28iLCJhdWQiOiJUZXJjZWlyb3MgdmlhIEFQSSJ9.b6xBNXFM3RdOkCZefiLrtX6zQ1N2Ibt9KZyjDrgIbKA=';

const TELEGRAM_TOKEN = '8816063248:AAEbIaQ-Yh6IybI-4iKn_ai4wQxk3MFSQrM';
const TELEGRAM_CHAT_ID = '589833097';

function formatarMoeda(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function exibicao(d) {
    return d.toLocaleDateString('pt-BR');
}

function dataAnterior() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
}

function inicioSemana() {
    const d = new Date();
    const diaSemana = d.getDay();
    const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
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
                catch (e) { reject(new Error('Resposta invalida: ' + resp.slice(0, 200))); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function buscarPeriodo(inicio, fim) {
    const inicioStr = iso(inicio);
    const fimStr = iso(fim);
    console.log('Buscando vendas de ' + inicioStr + ' a ' + fimStr + '...');

    const body = {
        unidade: null,
        dataInicial: inicioStr + ' 00:00:00',
        dataFinal: fimStr + ' 23:59:59'
    };

    const vendas = [];
    const first = await apiPost('/vendas/listagem?pagina=1&quantidade=100', body);

    if (!first.registros) {
        console.log('Nenhuma venda encontrada ou erro na API.');
        return [];
    }

    vendas.push(...first.registros);
    const totalPages = Math.ceil((first.paginacao?.qtdTotalRegistros || 0) / 100);

    for (let i = 2; i <= Math.min(totalPages, 50); i++) {
        const page = await apiPost('/vendas/listagem?pagina=' + i + '&quantidade=100', body);
        if (page.registros) vendas.push(...page.registros);
    }

    return vendas.filter(v => !v.cancelado);
}

function linhaItem(nome, qtd, valor) {
    const info = qtd.toLocaleString('pt-BR') + ' un - ' + formatarMoeda(valor);
    const max = 30;
    let left = nome;
    if (left.length > max) left = left.slice(0, max - 1);
    const dots = '.'.repeat(Math.max(2, max - left.length));
    return '  ' + left + ' ' + dots + ' ' + info;
}

function separador(caractere, tamanho) {
    return caractere.repeat(tamanho);
}

function agruparPorLoja(vendas) {
    const porLoja = {};
    vendas.forEach(v => {
        const nome = v.unidadeNome || v.unidadeNombre || 'Sem loja';
        if (!porLoja[nome]) porLoja[nome] = { total: 0, qtdVendas: 0, qtdItens: 0, produtos: {} };
        porLoja[nome].total += (v.valorLiquido || 0);
        porLoja[nome].qtdVendas += 1;

        (v.produtos || []).filter(p => !p.cancelado).forEach(p => {
            const pnome = p.descricaoReduzida || p.descricaoComercial || '--';
            const qtd = Number(p.quantidade || 1);
            const valor = Number(p.valorTotal || 0);
            if (!porLoja[nome].produtos[pnome]) porLoja[nome].produtos[pnome] = { qtd: 0, valor: 0 };
            porLoja[nome].produtos[pnome].qtd += qtd;
            porLoja[nome].produtos[pnome].valor += valor;
            porLoja[nome].qtdItens += qtd;
        });
    });
    return porLoja;
}

function montarBloco(porLoja, titulo, rotulo, topN) {
    let totalGeral = 0;
    let itensGeral = 0;
    let vendasGeral = 0;

    let msg = titulo + '\n' + rotulo + '\n';

    Object.keys(porLoja).sort().forEach(loja => {
        const d = porLoja[loja];
        totalGeral += d.total;
        itensGeral += d.qtdItens;
        vendasGeral += d.qtdVendas;

        msg += '\n' + separador('-', 44) + '\n';
        msg += '  ' + loja.toUpperCase() + '\n';
        msg += separador('-', 44) + '\n';

        const itens = Object.entries(d.produtos).sort((a, b) => b[1].qtd - a[1].qtd);
        const lista = topN ? itens.slice(0, topN) : itens;

        lista.forEach(([pnome, pd]) => {
            msg += linhaItem(pnome, pd.qtd, pd.valor) + '\n';
        });

        if (topN && itens.length > topN) {
            msg += '  ... +' + (itens.length - topN).toLocaleString('pt-BR') + ' outros produtos\n';
        }

        msg += separador('-', 44) + '\n';
        msg += '  TOTAL ' + loja.toUpperCase() + ':  ' + formatarMoeda(d.total) + '   (' + d.qtdItens.toLocaleString('pt-BR') + ' itens | ' + d.qtdVendas.toLocaleString('pt-BR') + ' vendas)\n';
    });

    msg += '\n' + separador('=', 44) + '\n';
    msg += '  TOTAL GERAL:  ' + formatarMoeda(totalGeral) + '\n';
    msg += '  Itens: ' + itensGeral.toLocaleString('pt-BR') + '  |  Vendas: ' + vendasGeral.toLocaleString('pt-BR') + '\n';
    msg += separador('=', 44);

    return msg;
}

function enviarTelegram(mensagem) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensagem });
        const opts = {
            hostname: 'api.telegram.org',
            path: '/bot' + TELEGRAM_TOKEN + '/sendMessage',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        const req = https.request(opts, (res) => {
            let resp = '';
            res.on('data', c => { resp += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(resp)); }
                catch (e) { reject(new Error('Resposta invalida do Telegram: ' + resp.slice(0, 200))); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    const args = process.argv.slice(2);
    const soTeste = args.includes('--teste');

    const ontem = dataAnterior();
    const seg = inicioSemana();

    try {
        const mensagens = [];

        // 1) Dia anterior
        const vendasOntem = await buscarPeriodo(ontem, ontem);
        if (vendasOntem.length === 0) {
            mensagens.push('RELATORIO DE VENDAS - DIA ANTERIOR\n' + exibicao(ontem) + '\n\nNenhuma venda registrada.');
        } else {
            mensagens.push(montarBloco(agruparPorLoja(vendasOntem), 'VENDAS DO DIA ANTERIOR', exibicao(ontem), 0));
        }

        // 2) Acumulado da semana (segunda -> ontem)
        if (seg.getTime() <= ontem.getTime()) {
            const vendasSemana = await buscarPeriodo(seg, ontem);
            if (vendasSemana.length === 0) {
                mensagens.push('ACUMULADO DA SEMANA\n' + exibicao(seg) + ' a ' + exibicao(ontem) + '\n\nNenhuma venda registrada.');
            } else {
                mensagens.push(montarBloco(agruparPorLoja(vendasSemana), 'ACUMULADO DA SEMANA', exibicao(seg) + ' a ' + exibicao(ontem), 50));
            }
        }

        for (const m of mensagens) {
            console.log('=== MENSAGEM ===');
            console.log(m);
            console.log('================');
            if (!soTeste) await enviarTelegram(m);
        }

        console.log(soTeste ? 'Teste concluido (nenhuma mensagem enviada).' : 'Relatorios enviados com sucesso!');
    } catch (e) {
        console.error('Erro:', e.message);
        process.exit(1);
    }
}

main();
