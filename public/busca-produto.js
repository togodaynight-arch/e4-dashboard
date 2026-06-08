var lastEan = ''; var lastTime = 0;

function formatarMoeda(v) {
    if (v == null) return '---';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getHistory() { try { return JSON.parse(localStorage.getItem('bp_history') || '[]'); } catch(e) { return []; } }

function saveHistory(item) {
    var h = getHistory();
    h = h.filter(function(x) { return x.ean !== item.ean; });
    h.unshift(item);
    if (h.length > 100) h = h.slice(0, 100);
    localStorage.setItem('bp_history', JSON.stringify(h));
    renderHistory();
}

function renderHistory() {
    var h = getHistory();
    var el = document.getElementById('history-list');
    var btn = document.getElementById('btn-export');
    if (h.length === 0) { el.innerHTML = '<p class="history-empty">Nenhum produto consultado ainda</p>'; btn.style.display = 'none'; return; }
    btn.style.display = 'inline-flex';
    var html = '';
    h.forEach(function(item) {
        var nome = item.nome || 'Não encontrado';
        html += '<div class="history-item" onclick="document.getElementById(\'ean-input\').value=\'' + item.ean + '\';buscarProduto();">' +
            '<div class="history-item-left">' +
                '<i class="material-icons" style="font-size:16px;color:' + (item.encontrado ? '#48bb78' : '#e53e3e') + ';">' + (item.encontrado ? 'check_circle' : 'error') + '</i>' +
                '<span class="history-ean">' + item.ean + '</span>' +
                '<span class="history-name' + (item.encontrado ? '' : ' notfound') + '">' + nome + '</span>' +
            '</div>' +
            '<div class="history-right"><span class="history-price">' + (item.preco ? formatarMoeda(item.preco) : '') + '</span></div>' +
        '</div>';
    });
    el.innerHTML = html;
}

function exportarRelatorio() {
    var h = getHistory();
    if (h.length === 0) return;
    var csv = 'EAN;Nome;Preço Venda;Preço Custo;Marca;Categoria;Encontrado\n';
    h.forEach(function(item) {
        csv += item.ean + ';' + (item.nome || '') + ';' + (item.preco || '') + ';' + (item.custo || '') + ';' + (item.marca || '') + ';' + (item.categoria || '') + ';' + (item.encontrado ? 'Sim' : 'Não') + '\n';
    });
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'produtos_consulta.csv';
    a.click();
}

function buscarProduto() {
    var ean = document.getElementById('ean-input').value.trim();
    if (!ean) return;
    document.getElementById('ean-input').value = '';
    if (ean === lastEan && Date.now() - lastTime < 1500) return;
    lastEan = ean; lastTime = Date.now();

    var panel = document.getElementById('result-panel');
    panel.style.display = 'block';
    panel.innerHTML = '<div class="result-loading"><div class="spinner"></div>Buscando <b>' + ean + '</b> no sistema...</div>';

    fetch('/api/produtos/produto?ean=' + encodeURIComponent(ean))
        .then(function(r) { return r.json(); })
        .then(function(p) {
            if (p && p.id) {
                return fetch('/api/produtos/produto-fiscal?unidade=1&id=' + p.id)
                    .then(function(r) { return r.json(); })
                    .then(function(fiscal) { mostrarProdutoCompleto(ean, p, fiscal); });
            } else {
                mostrarNaoEncontrado(ean, panel);
            }
        })
        .catch(function() { mostrarNaoEncontrado(ean, panel); });
}

function mostrarProdutoCompleto(ean, p, fiscal) {
    var nome = (fiscal && fiscal.descricao) ? (fiscal.descricao.longa || fiscal.descricao.curta) : (p.nome || '');
    var precoVarejo = (fiscal && fiscal.preco) ? fiscal.preco.varejo : null;
    var custo = (fiscal && fiscal.custo) ? fiscal.custo.vl_custo_nf : null;
    var custoSemIcms = (fiscal && fiscal.custo) ? fiscal.custo.vl_custo_sem_icms_nf : null;
    var margem = (precoVarejo && custo) ? ((precoVarejo - custo) / custo * 100).toFixed(1) + '%' : '---';
    var marca = (fiscal && fiscal.marca) || '---';
    var categoria = (p && p.categoriaNome) || '---';
    var estoque = (p && p.estoque != null) ? p.estoque : '---';
    var imagem = (fiscal && fiscal.imagem) || '';

    saveHistory({ ean: ean, nome: nome, preco: precoVarejo, custo: custo, marca: marca, categoria: categoria, encontrado: true });

    var html = '<div class="product-card">' +
        '<div class="product-card-header"><span class="nome">' + nome + '</span><span class="ean">EAN: ' + ean + '</span></div>' +
        '<div class="product-card-body">' +
        '<div class="product-info-item"><span class="product-info-label">Preço Venda</span><span class="product-info-value preco">' + formatarMoeda(precoVarejo) + '</span></div>' +
        '<div class="product-info-item"><span class="product-info-label">Preço Custo (NF)</span><span class="product-info-value custo">' + formatarMoeda(custo) + '</span></div>' +
        '<div class="product-info-item"><span class="product-info-label">Custo s/ ICMS</span><span class="product-info-value custo">' + formatarMoeda(custoSemIcms) + '</span></div>' +
        '<div class="product-info-item"><span class="product-info-label">Margem</span><span class="product-info-value' + (parseFloat(margem) > 0 ? ' preco' : '') + '">' + margem + '</span></div>' +
        '<div class="product-info-item"><span class="product-info-label">Marca</span><span class="product-info-value">' + marca + '</span></div>' +
        '<div class="product-info-item"><span class="product-info-label">Categoria</span><span class="product-info-value">' + categoria + '</span></div>' +
        '<div class="product-info-item"><span class="product-info-label">Estoque</span><span class="product-info-value">' + estoque + '</span></div>' +
        '</div>';
    if (imagem) html += '<div style="padding:0 20px 16px;"><img src="' + imagem + '" style="max-width:120px;border-radius:8px;" onerror="this.style.display=\'none\'"></div>';
    html += '</div>';
    document.getElementById('result-panel').innerHTML = html;
}

function mostrarNaoEncontrado(ean, panel) {
    panel = panel || document.getElementById('result-panel');
    saveHistory({ ean: ean, nome: 'Não encontrado', preco: null, custo: null, marca: '', categoria: '', encontrado: false });

    var html = '<div class="product-card product-card-notfound">' +
        '<div class="product-card-header"><span class="nome">Produto não encontrado</span><span class="ean">EAN: ' + ean + '</span></div>' +
        '<div class="product-card-body">' +
        '<div class="product-info-item"><span class="product-info-label">Sistema E4</span><span class="product-info-value" style="color:#c53030;">Não cadastrado</span></div>' +
        '<div class="product-info-item"><span class="product-info-label">Notas Fiscais</span><span class="product-info-value" style="color:#c53030;">Não encontrado</span></div>' +
        '</div>' +
        '<div style="padding:0 20px 16px;"><a href="https://www.google.com/search?q=codigo+barras+' + encodeURIComponent(ean) + '" target="_blank" class="btn-google"><i class="material-icons" style="font-size:16px;">open_in_new</i> Buscar no Google</a></div>' +
        '</div>';
    panel.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function() {
    renderHistory();
    var input = document.getElementById('ean-input');
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); buscarProduto(); } });
});
