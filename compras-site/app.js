var currentDias = '7';
var currentView = 'categoria';
var vendas = [];
var produtos = [];
var categorias = {};
var estado = {};
var renderLimit = 500;

var ESTADO_KEY = 'e4_compras_estado_v1';

// ========== HELPERS ==========
function fmt(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtQtd(n) {
    n = Number(n) || 0;
    return Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
function fmtValor(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function attr(s) {
    return esc(s).replace(/"/g, '&quot;');
}
function rangeFor(label) {
    var fim = new Date();
    if (label === 'ontem') fim.setDate(fim.getDate() - 1);
    var ini = new Date(fim);
    if (label === 'ontem') ini = new Date(fim);
    else ini.setDate(ini.getDate() - (Number(label) - 1));
    return { ini: ini, fim: fim };
}
function numDiasFor(label) {
    return label === 'ontem' ? 1 : Number(label);
}
function periodoTexto(label, range) {
    var f = String(range.ini.getDate()).padStart(2,'0') + '/' + String(range.ini.getMonth()+1).padStart(2,'0') + '/' + range.ini.getFullYear();
    var t = String(range.fim.getDate()).padStart(2,'0') + '/' + String(range.fim.getMonth()+1).padStart(2,'0') + '/' + range.fim.getFullYear();
    var nomes = { 'ontem': 'Dia anterior', '7': 'Últimos 7 dias', '10': 'Últimos 10 dias', '15': 'Últimos 15 dias', '30': 'Últimos 30 dias' };
    return (nomes[label] || label) + ' · ' + f + (f === t ? '' : ' a ' + t);
}

function loadEstado() {
    try { estado = JSON.parse(localStorage.getItem(ESTADO_KEY)) || {}; } catch (e) { estado = {}; }
}
function setCompra(key, val) {
    if (val) estado[key] = val; else delete estado[key];
    try { localStorage.setItem(ESTADO_KEY, JSON.stringify(estado)); } catch (e) {}
}

function showProgress(show, text) {
    var w = document.getElementById('progress-wrap');
    if (show) {
        w.style.display = 'block';
        if (text) document.getElementById('progress-text').textContent = text;
    } else {
        w.style.display = 'none';
    }
}

// ========== CATEGORIAS ==========
async function loadCategorias() {
    if (Object.keys(categorias).length) return;
    try {
        var r = await fetch('/api/categorias/listagem?pagina=1&quantidade=1000', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        var data = await r.json();
        var arr = Array.isArray(data) ? data : (data && Array.isArray(data.registros) ? data.registros : []);
        arr.forEach(function(c) {
            if (c && c.id != null) categorias[c.id] = c.nome || ('Categoria ' + c.id);
        });
    } catch (e) {
        console.error('Erro ao carregar categorias:', e);
    }
}

// ========== CARREGAR VENDAS ==========
async function carregarDados() {
    var label = currentDias;
    var range = rangeFor(label);
    var body = { unidade: null, dataInicial: fmt(range.ini) + ' 00:00:00', dataFinal: fmt(range.fim) + ' 23:59:59' };

    showProgress(true, 'Carregando vendas...');
    document.getElementById('nav-date').textContent = 'Período: ' + periodoTexto(label, range);
    try {
        await loadCategorias();
        var todos = [];
        var page = 1, per = 500, totalPaginas = 1;
        while (true) {
            showProgress(true, 'Carregando vendas... página ' + page + (totalPaginas > 1 ? ' de ' + totalPaginas : ''));
            var r = await fetch('/api/vendas/listagem?pagina=' + page + '&quantidade=' + per, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            var data = await r.json();
            if (data && data.messagem) throw new Error(data.messagem);
            if (!data || !Array.isArray(data.registros)) throw new Error('Resposta inválida da API.');
            todos = todos.concat(data.registros);
            totalPaginas = (data.paginacao && data.paginacao.qtdTotalPaginas) || 1;
            if (page >= totalPaginas) break;
            page++;
        }
        vendas = todos;
        produtos = agregar(todos, numDiasFor(label));
        renderLista();
    } catch (e) {
        alert('Erro ao carregar vendas: ' + e.message);
    } finally {
        showProgress(false);
    }
}

// ========== AGREGAÇÃO POR PRODUTO ==========
function agregar(registros, numDias) {
    var map = {};
    var d = numDias > 0 ? numDias : 1;
    registros.forEach(function(s) {
        (s.produtos || []).forEach(function(p) {
            if (!p) return;
            var q = Number(p.quantidade) || 0;
            var valor = Number(p.valorLiquido != null ? p.valorLiquido : p.valorTotal) || 0;
            var key = p.ean || p.codigo || ('id' + p.id + '_' + (p.descricaoReduzida || p.descricaoComercial || ''));
            var rec = map[key];
            if (!rec) {
                rec = map[key] = {
                    key: key,
                    ean: p.ean || '',
                    codigo: p.codigo || '',
                    nome: p.descricaoReduzida || p.descricaoComercial || '(sem nome)',
                    nomeCompleto: p.descricaoComercial || p.descricaoReduzida || '',
                    categoriaId: p.categoriaId,
                    unidadeMedida: p.unidadeMedidaDescricao || '',
                    qtd: 0, qtdCancelada: 0, valor: 0, vendas: 0
                };
            }
            if (p.cancelado) { rec.qtdCancelada += q; }
            else { rec.qtd += q; rec.valor += valor; rec.vendas++; }
        });
    });
    var list = Object.keys(map).map(function(k) { return map[k]; });
    list.forEach(function(r) {
        r.mediaDia = r.qtd / d;
        r.mediaMes = r.mediaDia * 30;
        r.sugestao = Math.max(1, Math.ceil(r.mediaMes));
        r.altaRotatividade = r.mediaDia >= 1;
        r.urgente = r.mediaDia >= 3;
        r.categoriaNome = r.categoriaId != null && categorias[r.categoriaId] ? categorias[r.categoriaId] : 'Sem categoria';
    });
    return list;
}

// ========== FILTROS ==========
function getFiltrados() {
    var statusF = document.getElementById('filtro-status').value;
    var busca = document.getElementById('filtro-busca').value.toLowerCase();
    return produtos.filter(function(r) {
        if (statusF === 'comprado' && estado[r.key] !== 'c') return false;
        if (statusF === 'faltou' && estado[r.key] !== 'f') return false;
        if (statusF === 'nao_marcado' && estado[r.key]) return false;
        if (busca) {
            var txt = (r.nome + ' ' + r.nomeCompleto + ' ' + r.codigo + ' ' + r.ean).toLowerCase();
            if (txt.indexOf(busca) === -1) return false;
        }
        return true;
    });
}

function summarize() {
    var qtd = produtos.reduce(function(s, r) { return s + r.qtd; }, 0);
    var valor = produtos.reduce(function(s, r) { return s + r.valor; }, 0);
    var alertas = produtos.filter(function(r) { return r.altaRotatividade; }).length;
    document.getElementById('st-produtos').textContent = produtos.length.toLocaleString('pt-BR');
    document.getElementById('st-qtd').textContent = fmtQtd(qtd);
    document.getElementById('st-valor').textContent = fmtValor(valor);
    document.getElementById('st-alerta').textContent = alertas.toLocaleString('pt-BR');
}

// ========== RENDERIZAÇÃO ==========
function buildTable(items) {
    if (!items.length) return '<div class="empty-state">Sem itens neste grupo.</div>';
    var h = '<table class="product-table"><thead><tr>' +
        '<th>Produto</th>' +
        '<th style="text-align:center;">Qtd período</th>' +
        '<th style="text-align:center;">Média/mês</th>' +
        '<th style="text-align:center;">Sugestão compra</th>' +
        '<th style="text-align:right;">Valor (R$)</th>' +
        '<th>Alerta</th>' +
        '<th style="text-align:center;min-width:150px;">Status compra</th>' +
        '</tr></thead><tbody>';
    items.forEach(function(r) {
        var st = estado[r.key];
        var rowCls = st === 'f' ? 'linha-faltou' : (st === 'c' ? 'linha-comprado' : '');
        var alta = r.altaRotatividade
            ? '<span class="badge-alta' + (r.urgente ? ' urgente' : '') + '">' + (r.urgente ? '<i class="material-icons" style="font-size:12px;vertical-align:middle;">error_outline</i> URGENTE' : '<i class="material-icons" style="font-size:12px;vertical-align:middle;">warning</i> ALTA ROT.') + '</span>'
            : '--';
        var produtoCol = '<div class="prod-nome">' + esc(r.nome) + '</div>' +
            (r.nomeCompleto && r.nomeCompleto !== r.nome ? '<div class="prod-codigo">' + esc(r.nomeCompleto) + '</div>' : '') +
            ((r.codigo || r.ean) ? '<div class="prod-codigo">' + esc(r.codigo) + (r.codigo && r.ean ? ' · ' : '') + (r.ean ? 'EAN ' + esc(r.ean) : '') + '</div>' : '');
        h += '<tr class="' + rowCls + '">' +
            '<td>' + produtoCol + '</td>' +
            '<td class="qty">' + fmtQtd(r.qtd) + (r.qtdCancelada ? ' <span class="qty-neg">(' + r.qtdCancelada + ' canc.)</span>' : '') + '</td>' +
            '<td class="qty">' + fmtQtd(r.mediaMes) + '</td>' +
            '<td class="qty" style="color:var(--teal-dark);font-weight:800;">' + fmtQtd(r.sugestao) + '</td>' +
            '<td class="valor">' + fmtValor(r.valor) + '</td>' +
            '<td>' + alta + '</td>' +
            '<td><div class="compra-toggle">' +
            '<button data-key="' + attr(r.key) + '" data-act="c" class="' + (st === 'c' ? 'comprado' : '') + '"><i class="material-icons" style="font-size:14px;">check</i> Comprei</button>' +
            '<button data-key="' + attr(r.key) + '" data-act="f" class="' + (st === 'f' ? 'faltou' : '') + '"><i class="material-icons" style="font-size:14px;">close</i> Faltou</button>' +
            '</div></td>' +
            '</tr>';
    });
    h += '</tbody></table>';
    return h;
}

function showMoreBtn(remaining) {
    return '<div class="empty-state" style="cursor:pointer;padding:18px;" onclick="renderLimit+=500;renderLista();">Mostrar mais (' + remaining.toLocaleString('pt-BR') + ' restantes) — clique aqui</div>';
}

function renderLista() {
    var list = getFiltrados();
    var el = document.getElementById('list-area');
    summarize();
    var range = rangeFor(currentDias);

    var html = '<div class="aviso-periodo">Período analisado: <b>' + periodoTexto(currentDias, range) + '</b> · ' + list.length.toLocaleString('pt-BR') + ' produtos' + (produtos.length > list.length ? ' (de ' + produtos.length.toLocaleString('pt-BR') + ' no total)' : '') + '</div>';

    if (produtos.length === 0) {
        html += '<div class="empty-state"><i class="material-icons" style="font-size:48px;color:#ccc;display:block;margin-bottom:12px;">shopping_basket</i>Clique em "Atualizar" para carregar as vendas.</div>';
        el.innerHTML = html;
        return;
    }
    if (list.length === 0) {
        html += '<div class="empty-state">Nenhum produto para os filtros selecionados.</div>';
        el.innerHTML = html;
        return;
    }

    if (currentView === 'categoria') {
        var byCat = {};
        list.forEach(function(r) { (byCat[r.categoriaNome] = byCat[r.categoriaNome] || []).push(r); });
        Object.keys(byCat).sort(function(a, b) {
            if (a === 'Sem categoria') return 1;
            if (b === 'Sem categoria') return -1;
            return a.localeCompare(b);
        }).forEach(function(cat) {
            var items = byCat[cat].slice().sort(function(a, b) { return b.qtd - a.qtd; });
            var subQtd = items.reduce(function(s, r) { return s + r.qtd; }, 0);
            var subVal = items.reduce(function(s, r) { return s + r.valor; }, 0);
            html += '<div class="categoria-group">' +
                '<div class="categoria-header"><span class="nome"><i class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px;">folder</i>' + esc(cat) + '</span>' +
                '<span class="meta">' + items.length + ' produtos · ' + fmtQtd(subQtd) + ' un · ' + fmtValor(subVal) + '</span></div>' +
                buildTable(items) + '</div>';
        });
    } else {
        var sorted = list.slice();
        if (currentView === 'alfa') sorted.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
        else sorted.sort(function(a, b) { return b.qtd - a.qtd || b.valor - a.valor; });
        var page = sorted.slice(0, renderLimit);
        var rest = sorted.length - renderLimit;
        html += buildTable(page);
        if (rest > 0) html += showMoreBtn(rest);
    }

    el.innerHTML = html;
}

// ========== RELATÓRIO (novo impresso) ==========
function renderRelatorioHTML() {
    var range = rangeFor(currentDias);
    var list = getFiltrados().slice().sort(function(a, b) {
        var ca = a.categoriaNome, cb = b.categoriaNome;
        if (ca !== cb) return ca.localeCompare(cb);
        return b.qtd - a.qtd;
    });
    var qtd = list.reduce(function(s, r) { return s + r.qtd; }, 0);
    var valor = list.reduce(function(s, r) { return s + r.valor; }, 0);

    var body = '';
    var byCat = {};
    list.forEach(function(r) { (byCat[r.categoriaNome] = byCat[r.categoriaNome] || []).push(r); });
    var cats = Object.keys(byCat).sort(function(a, b) { return a.localeCompare(b); });
    cats.forEach(function(cat) {
        var items = byCat[cat];
        body += '<h2 class="r-cat">' + esc(cat) + ' <span class="r-meta">(' + items.length + ' produtos · ' + fmtQtd(items.reduce(function(s,r){return s+r.qtd;},0)) + ' un)</span></h2>';
        body += '<table><thead><tr><th class="c-st">Status</th><th>Produto</th><th>Código/EAN</th><th class="num">Qtd período</th><th class="num">Média/mês</th><th class="num">Sugestão compra</th><th class="num">Valor (R$)</th></tr></thead><tbody>';
        items.forEach(function(r) {
            var st = estado[r.key] === 'c' ? '<span class="st-c">✔ COMPRADO</span>' : (estado[r.key] === 'f' ? '<span class="st-f">✘ FALTOU</span>' : '<span class="st-n">☐ pendente</span>');
            body += '<tr><td class="c-st">' + st + '</td>' +
                '<td>' + esc(r.nome) + (r.nomeCompleto && r.nomeCompleto !== r.nome ? '<div class="r-sub">' + esc(r.nomeCompleto) + '</div>' : '') + '</td>' +
                '<td class="r-sub">' + esc(r.codigo) + (r.ean ? ' / ' + esc(r.ean) : '') + '</td>' +
                '<td class="num">' + fmtQtd(r.qtd) + '</td>' +
                '<td class="num">' + fmtQtd(r.mediaMes) + '</td>' +
                '<td class="num">' + fmtQtd(r.sugestao) + '</td>' +
                '<td class="num">' + fmtValor(r.valor) + '</td></tr>';
        });
        body += '</tbody></table>';
    });

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Compras</title>' +
        '<style>' +
        'body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#222;}h1{font-size:20px;margin:0 0 4px;}' +
        '.r-sub{font-size:11px;color:#666;}.r-head{color:#555;font-size:12px;margin-bottom:16px;}' +
        '.r-cat{font-size:15px;margin:22px 0 6px;border-bottom:2px solid #32bcad;padding-bottom:4px;}.r-meta{font-weight:400;color:#888;font-size:12px;}' +
        'table{width:100%;border-collapse:collapse;margin:4px 0 8px;font-size:12px;}th{background:#eef7f6;text-align:left;padding:6px 8px;border:1px solid #ccc;}td{padding:5px 8px;border:1px solid #ddd;}' +
        'td.num,th.num{text-align:right;}td.c-st,th.c-st{width:110px;text-align:center;}' +
        '.st-c{color:#278a4c;font-weight:bold;}.st-f{color:#c53030;font-weight:bold;}.st-n{color:#999;}' +
        '.fo{font-size:11px;color:#888;margin-top:18px;}' +
        '@media print{.no-print{display:none;}}' +
        '</style></head><body>' +
        '<button class="no-print" onclick="window.print()" style="float:right;padding:8px 16px;font-size:14px;">Imprimir / Salvar PDF</button>' +
        '<h1>Relatório de Compras</h1>' +
        '<div class="r-head">Período: <b>' + esc(periodoTexto(currentDias, range)) + '</b> · ' + list.length + ' produtos · ' + fmtQtd(qtd) + ' unidades · ' + fmtValor(valor) + ' gerado em ' + new Date().toLocaleString('pt-BR') + '</div>' +
        body +
        '<div class="fo">E4 Relatório de Compras — sugestão de reposição = média por mês (arredondada para cima). Coluna Status reflete o que você marcou no site.</div>' +
        '</body></html>';
}

function gerarRelatorio() {
    var w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para gerar o relatório.'); return; }
    w.document.write(renderRelatorioHTML());
    w.document.close();
}

// ========== EXCEL ==========
function exportarExcel() {
    var list = getFiltrados();
    if (list.length === 0) { alert('Nenhum dado para exportar.'); return; }
    var rows = list.map(function(r) {
        var st = estado[r.key] === 'c' ? 'Comprado' : (estado[r.key] === 'f' ? 'Faltou' : 'Não marcado');
        return {
            'Categoria': r.categoriaNome,
            'Produto': r.nome,
            'Descrição': r.nomeCompleto,
            'Código': r.codigo,
            'EAN': r.ean,
            'Qtd Período': r.qtd,
            'Qtd Cancelada': r.qtdCancelada,
            'Média/mês': Math.round(r.mediaMes * 10) / 10,
            'Sugestão Compra': r.sugestao,
            'Valor R$': Number(r.valor),
            'Status Compra': st
        };
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Compras (' + list.length + ')');
    var range = rangeFor(currentDias);
    XLSX.writeFile(wb, 'relatorio_compras_' + fmt(range.fim) + '.xlsx');
}

// ========== EVENTOS ==========
document.addEventListener('DOMContentLoaded', function() {
    loadEstado();
    document.getElementById('nav-date').textContent = 'Período: ' + periodoTexto(currentDias, rangeFor(currentDias));

    document.getElementById('period-select').addEventListener('click', function(e) {
        var btn = e.target.closest('button[data-dias]');
        if (!btn) return;
        currentDias = btn.getAttribute('data-dias');
        document.querySelectorAll('#period-select button').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        carregarDados();
    });

    document.getElementById('view-toggle').addEventListener('click', function(e) {
        var btn = e.target.closest('button[data-view]');
        if (!btn) return;
        currentView = btn.getAttribute('data-view');
        document.querySelectorAll('#view-toggle button').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderLista();
    });

    document.getElementById('list-area').addEventListener('click', function(e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        var key = btn.getAttribute('data-key');
        var act = btn.getAttribute('data-act');
        var next = estado[key] === act ? null : act;
        setCompra(key, next);
        renderLista();
    });

    carregarDados();
});