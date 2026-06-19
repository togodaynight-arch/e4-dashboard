var planilhaData = [];
var colunas = [];
var fileName = '';

function handleUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var wb = XLSX.read(data, { type: 'array' });
            var sheet = wb.Sheets[wb.SheetNames[0]];
            var json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (json.length === 0) { alert('Planilha vazia!'); return; }
            planilhaData = json;
            colunas = Object.keys(json[0]);
            fileName = file.name;
            document.getElementById('upload-label').innerHTML = '<i class="material-icons" style="font-size:14px;color:#38a169;">check_circle</i> ' + file.name + ' (' + json.length.toLocaleString('pt-BR') + ' linhas)';
            document.getElementById('info-rows').textContent = json.length.toLocaleString('pt-BR') + ' produtos | ' + file.name;
            document.getElementById('info-cols').textContent = colunas.length + ' colunas: ' + colunas.join(', ');
            document.getElementById('results').innerHTML = '<div class="no-data" style="color:#38a169;"><i class="material-icons" style="font-size:40px;display:block;margin-bottom:8px;">check_circle</i>Planilha carregada! Digite um EAN ou nome para buscar.</div>';
        } catch(err) {
            alert('Erro ao ler: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function encontrarColuna(nomes) {
    for (var i = 0; i < nomes.length; i++) {
        for (var j = 0; j < colunas.length; j++) {
            var col = colunas[j].toLowerCase().trim();
            var alvo = nomes[i].toLowerCase().trim();
            if (col === alvo || col.indexOf(alvo) !== -1) return colunas[j];
        }
    }
    return null;
}

function buscar() {
    var termo = document.getElementById('search-input').value.trim().toLowerCase();
    var el = document.getElementById('results');

    if (!termo) { el.innerHTML = '<div class="no-data">Digite algo para buscar</div>'; return; }
    if (planilhaData.length === 0) { el.innerHTML = '<div class="no-data">Importe uma planilha primeiro</div>'; return; }

    // Encontra colunas relevantes
    var colEan = encontrarColuna(['ean', 'ean13', 'codigo', 'codigo_barras', 'código', 'cod barras', 'gtin']);
    var colNome = encontrarColuna(['nome', 'produto', 'descricao', 'descrição', 'descricao_comercial', 'produto_nome']);
    var colPreco = encontrarColuna(['preco', 'preço', 'preco_venda', 'preço_venda', 'valor_venda', 'ticket_medio', 'ticket médio']);
    var colCusto = encontrarColuna(['custo', 'preco_custo', 'preço_custo', 'valor_custo']);
    var colMargem = encontrarColuna(['margem', 'margem_%', 'margem_estimada', 'margem_estimada_%']);
    var colLucro = encontrarColuna(['lucro', 'lucro_bruto', 'lucro_bruto_estimado']);
    var colQuant = encontrarColuna(['qtd', 'quantidade', 'qtd_vendida', 'estoque']);
    var colReceita = encontrarColuna(['receita', 'receita_total', 'faturamento']);

    var resultados = planilhaData.filter(function(row) {
        for (var k in row) {
            var val = String(row[k] || '').toLowerCase();
            if (val.indexOf(termo) !== -1) return true;
        }
        return false;
    });

    if (resultados.length === 0) {
        el.innerHTML = '<div class="no-data"><i class="material-icons" style="font-size:40px;display:block;margin-bottom:8px;color:#e53e3e;">search_off</i>Nenhum produto encontrado para "<b>' + termo + '</b>"</div>';
        return;
    }

    var html = '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">' + resultados.length + ' resultado(s) para "' + termo + '"</div>';

    resultados.forEach(function(row) {
        var ean = colEan ? row[colEan] : '';
        var nome = colNome ? row[colNome] : '';
        var preco = colPreco ? row[colPreco] : '';
        var custo = colCusto ? row[colCusto] : '';
        var margem = colMargem ? row[colMargem] : '';
        var lucro = colLucro ? row[colLucro] : '';
        var quant = colQuant ? row[colQuant] : '';
        var receita = colReceita ? row[colReceita] : '';

        if (!nome) {
            nome = Object.values(row).filter(function(v) { return String(v || '').length > 3; })[0] || '';
        }

        html += '<div class="result-card">' +
            '<h3>' + nome + (ean ? ' <span class="result-ean">EAN: ' + ean + '</span>' : '') + '</h3>' +
            '<table class="result-table">';

        if (ean) html += '<tr><td>EAN</td><td>' + ean + '</td></tr>';
        if (nome) html += '<tr><td>Nome</td><td>' + nome + '</td></tr>';
        if (preco) html += '<tr><td>Preço Venda</td><td style="font-weight:700;color:#276749;">' + formatarValor(preco) + '</td></tr>';
        if (custo) html += '<tr><td>Preço Custo</td><td>' + formatarValor(custo) + '</td></tr>';
        if (margem) html += '<tr><td>Margem</td><td>' + formatarValor(margem) + (String(margem).indexOf('%') === -1 ? '%' : '') + '</td></tr>';
        if (lucro) html += '<tr><td>Lucro Bruto</td><td style="font-weight:600;">' + formatarValor(lucro) + '</td></tr>';
        if (quant) html += '<tr><td>Qtd Vendida</td><td>' + quant + '</td></tr>';
        if (receita) html += '<tr><td>Receita Total</td><td style="font-weight:600;">' + formatarValor(receita) + '</td></tr>';

        // Mostra outras colunas relevantes
        colunas.forEach(function(col) {
            var val = row[col];
            if (!val || val === '' || val === '0') return;
            var colLower = col.toLowerCase();
            if ([ean, nome, preco, custo, margem, lucro, quant, receita].indexOf(val) !== -1) return;
            if (colLower.indexOf('rank') !== -1 || colLower.indexOf('frequencia') !== -1 || colLower.indexOf('semana') !== -1) {
                html += '<tr><td>' + col + '</td><td>' + val + '</td></tr>';
            }
        });

        html += '</table></div>';
    });

    el.innerHTML = html;
}

function formatarValor(v) {
    if (v == null || v === '') return '-';
    var n = parseFloat(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
    if (isNaN(n)) return v;
    if (n < 100 && String(v).indexOf('%') === -1 && String(v).indexOf('.') !== -1) {
        return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(v);
}

document.addEventListener('DOMContentLoaded', function() {
    var zone = document.getElementById('upload-zone');
    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            document.getElementById('file-input').files = e.dataTransfer.files;
            handleUpload({ target: { files: e.dataTransfer.files } });
        }
    });
});
