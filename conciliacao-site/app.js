var API_CONFIG = {
    baseUrl: '/api',
    clientId: '215',
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRlIjoiMjE1IiwiZGF0YSI6IjIwMjYtMDQtMjkgMTU6NDU6MTQiLCJkb2N1bWVudG8iOiJ2cDAwMDA3MzUzLXAwMDEiLCJlbmRlcmVjbyI6InJ1YSB0cmFqYW5vIHJlaXMiLCJjb250YXRvIjoiY2xpZW50ZSIsInRlbGVmb25lIjoiMTE5OTk5OTkiLCJpc3MiOiJlNHNpc3RlbWFzLmNvbS5iciIsInN1YiI6IkF1dGVudGljYVx1MDBlN1x1MDBlM28iLCJhdWQiOiJUZXJjZWlyb3MgdmlhIEFQSSJ9.VKTPNRxHJauxQnSc/ur7cEpc9P6XO/lLYDacj8dj450='
};

var allSales = [];
var entradaData = [];
var excelColumns = [];
var excelFileName = '';
var vendasPage = 1;
var VENDAS_PAGE_SIZE = 30;
var entradasPage = 1;
var ENTRADAS_PAGE_SIZE = 30;
var ordemPorHora = false;

function formatarMoeda(v) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarData(dataStr) {
    if (!dataStr) return '--';
    var d = new Date(dataStr);
    if (isNaN(d.getTime())) return String(dataStr);
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
}

function dataLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function nomeLoja(s) {
    return s.unidadeNome || s.unidadeNombre || s.unidade || '';
}

function classificarPagamento(f) {
    var desc = (f.formaPagamentoDescricao || f.descricao || '').toLowerCase();
    if (desc.includes('pix') || desc.includes('carteira digital')) return 'pix';
    if (desc.includes('picpay') || desc.includes('pluxee') || desc.includes('ticket') || desc.includes('voucher') || desc.includes('alelo') || desc.includes('sodexo')) return 'picpay';
    return 'cartao';
}

function badgeStatus(cancelado, nome) {
    if (cancelado) return '<span class="sale-status-badge cancelado">Cancelado</span>';
    if (nome && nome.toLowerCase().includes('autorizado')) return '<span class="sale-status-badge autorizado">Autorizado</span>';
    return '--';
}

function apiHeaders() {
    return { 'Content-Type': 'application/json', 'X-Cliente-Id': API_CONFIG.clientId, 'Authorization': 'Bearer ' + API_CONFIG.token };
}

// ========== BUSCAR VENDAS ==========
async function loadVendas() {
    var range = getDateRange();
    if (!range.inicio || !range.fim) { alert('Selecione as datas.'); return; }

    var spinner = document.getElementById('global-spinner');
    spinner.classList.add('visible');

    var body = { unidade: null, dataInicial: range.inicio + ' 00:00:00', dataFinal: range.fim + ' 23:59:59' };
    var headers = apiHeaders();
    allSales = [];

    try {
        var firstRes = await fetch(API_CONFIG.baseUrl + '/vendas/listagem?pagina=1&quantidade=100', { method: 'POST', headers: headers, body: JSON.stringify(body) });
        if (!firstRes.ok) throw new Error('HTTP ' + firstRes.status);
        var firstData = await firstRes.json();
        var totalRecords = firstData.paginacao.qtdTotalRegistros;
        var totalPages = Math.ceil(totalRecords / 100);

        allSales = firstData.registros.slice();

        var batchSize = 5;
        for (var i = 2; i <= totalPages; i += batchSize) {
            var batch = [];
            for (var j = i; j < Math.min(i + batchSize, totalPages + 1); j++) {
                batch.push(fetch(API_CONFIG.baseUrl + '/vendas/listagem?pagina=' + j + '&quantidade=100', { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function(r){return r.json()}).then(function(d){return d.registros||[]}).catch(function(){return[]}));
            }
            var results = await Promise.all(batch);
            results.forEach(function(r) { allSales = allSales.concat(r); });
        }

        allSales.sort(function(a, b) { return new Date(b.dataEfetivacao) - new Date(a.dataEfetivacao); });
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar vendas. Verifique aconexao.');
    }

    spinner.classList.remove('visible');
    vendasPage = 1;
    populateLojaFilter();
    rebuild();
}

function getDateRange() {
    var inicio = document.getElementById('data-inicio').value;
    var fim = document.getElementById('data-fim').value;
    if (inicio && fim) return { inicio: inicio, fim: fim };
    var period = document.getElementById('filtro-periodo').value;
    var now = new Date();
    if(period==='day') return {inicio: dataLocal(now), fim: dataLocal(now)};
    if(period==='week'){var wa=new Date(now);wa.setDate(wa.getDate()-7);return {inicio: dataLocal(wa), fim: dataLocal(now)};}
    if(period==='mon') return {inicio: now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01', fim: dataLocal(now)};
    if(period==='all') return {inicio: '2025-01-01', fim: dataLocal(now)};
    return {inicio: dataLocal(now), fim: dataLocal(now)};
}

function aoMudarPeriodo() {
    var now = new Date();
    var period = document.getElementById('filtro-periodo').value;
    if(period==='day'){ document.getElementById('data-inicio').value = dataLocal(now); document.getElementById('data-fim').value = dataLocal(now); }
    else if(period==='week'){ var wa=new Date(now);wa.setDate(wa.getDate()-7); document.getElementById('data-inicio').value = dataLocal(wa); document.getElementById('data-fim').value = dataLocal(now); }
    else if(period==='mon'){ document.getElementById('data-inicio').value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01'; document.getElementById('data-fim').value = dataLocal(now); }
    else if(period==='all'){ document.getElementById('data-inicio').value = '2025-01-01'; document.getElementById('data-fim').value = dataLocal(now); }
    if (allSales.length > 0) { vendasPage = 1; rebuild(); }
}

function aoMudarData() {
    document.getElementById('filtro-periodo').value = 'custom';
    if (allSales.length > 0) { vendasPage = 1; rebuild(); }
}

function populateLojaFilter() {
    var lojas = [], seen = {};
    allSales.forEach(function(s) { var loja = nomeLoja(s); if(loja && !seen[loja]){seen[loja]=true; lojas.push(loja);} });
    entradaData.forEach(function(row) {
        var colMap = identifyColumns(excelColumns);
        if(colMap.loja && row[colMap.loja] && !seen[String(row[colMap.loja])]) { seen[String(row[colMap.loja])] = true; lojas.push(String(row[colMap.loja])); }
    });
    lojas.sort();
    var select = document.getElementById('filtro-loja');
    var current = select.value;
    select.innerHTML = '<option value="">Todas as lojas</option>';
    lojas.forEach(function(l){var o=document.createElement('option');o.value=l;o.textContent=l;select.appendChild(o);});
    if(current) select.value = current;
}

// ========== FILTRO DE VENDAS ==========
function getVendasFiltered() {
    var lojaFilter = document.getElementById('filtro-loja').value;
    var statusFilter = document.getElementById('filtro-status').value;
    var busca = document.getElementById('filtro-busca').value.toLowerCase();
    var range = getDateRange();
    var inicioTs = range.inicio ? new Date(range.inicio + 'T00:00:00').getTime() : 0;
    var fimTs = range.fim ? new Date(range.fim + 'T23:59:59').getTime() : Infinity;

    var items = allSales.filter(function(s) {
        if (statusFilter === 'cancelado' && !s.cancelado) return false;
        if (statusFilter === 'autorizado' && s.cancelado) return false;
        if (lojaFilter && nomeLoja(s) !== lojaFilter) return false;
        var d = new Date(s.dataEfetivacao).getTime();
        if (d < inicioTs || d > fimTs) return false;
        if (busca) {
            var txt = s.cupom + ' ' + nomeLoja(s) + ' ' + (s.produtos||[]).map(function(p){return (p.descricaoReduzida||'')+' '+(p.descricaoComercial||'')}).join(' ');
            if (txt.toLowerCase().indexOf(busca) === -1) return false;
        }
        return true;
    });
    items.sort(function(a, b) { return ordemPorHora ? (new Date(a.dataEfetivacao) - new Date(b.dataEfetivacao)) : (new Date(b.dataEfetivacao) - new Date(a.dataEfetivacao)); });
    return items;
}

// ========== RENDER VENDAS ==========
function renderVendas() {
    var items = getVendasFiltered();
    var start = (vendasPage - 1) * VENDAS_PAGE_SIZE;
    var pageData = items.slice(start, start + VENDAS_PAGE_SIZE);
    var el = document.getElementById('vendas-list');

    if (pageData.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="material-icons" style="font-size:48px;color:#ccc;display:block;margin-bottom:12px;">shopping_cart</i>' + (allSales.length === 0 ? 'Clique em "Atualizar" para carregar as vendas.' : 'Nenhuma venda no periodo.') + '</div>';
        document.getElementById('vendas-pagination-row').style.display = 'none';
        document.getElementById('vendas-count').textContent = '0 vendas | Receita: R$ 0,00';
        return;
    }

    var html = '';
    var lastHour = null;
    pageData.forEach(function(s) {
        var d = new Date(s.dataEfetivacao);
        var hora = String(d.getHours()).padStart(2,'0') + ':00';
        if (ordemPorHora && hora !== lastHour) {
            lastHour = hora;
            html += '<div class="hour-group-header">' + hora + '</div>';
        }

var prodsAtivos = (s.produtos||[]).filter(function(p){return !p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial});
        var prodsCancelados = (s.produtos||[]).filter(function(p){return p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial});
        var payMap = {'Cartao':0,'Pix':0,'PicPay':0};
        (s.finalizadoras||[]).forEach(function(f){var type=classificarPagamento(f);if(type==='pix')payMap['Pix']+=f.valorPago||0;else if(type==='picpay')payMap['PicPay']+=f.valorPago||0;else payMap['Cartao']+=f.valorPago||0;});
        var payLines = '';
        Object.keys(payMap).forEach(function(k){if(payMap[k]>0) payLines+='<span class="venda-mini-pay">'+k+': '+formatarMoeda(payMap[k])+'</span>';});
        if(!payLines) payLines='<span class="venda-mini-pay">Cartao: '+formatarMoeda(s.valorLiquido)+'</span>';

        var cancelClass = s.cancelado ? ' cancelado' : '';
        var cancelBadge = s.cancelado ? '<span class="venda-mini-cancelado-badge">CANCELADO</span>' : '';
        var produtosHtml = '';
        if (prodsAtivos.length > 0) produtosHtml += '<div class="venda-mini-prod">' + prodsAtivos.join(', ') + '</div>';
        if (prodsCancelados.length > 0) produtosHtml += '<div class="venda-mini-prod-cancelado">' + prodsCancelados.map(function(n){return '<span class="prod-cancelado">' + n + '</span>';}).join(', ') + '</div>';
        html += '<div class="venda-mini'+cancelClass+'" onclick="openDetail(\''+s.id+'\')">' +
            '<div class="venda-mini-top"><span class="venda-mini-date">'+formatarData(s.dataEfetivacao)+'</span><span class="venda-mini-cupom">#'+s.cupom+'</span>'+cancelBadge+'</div>' +
            '<div class="venda-mini-mid"><span class="venda-mini-total">'+formatarMoeda(s.valorLiquido)+'</span>' + payLines + '</div>' +
            (nomeLoja(s) ? '<span class="venda-mini-loja">'+nomeLoja(s)+'</span>' : '') +
            produtosHtml +
            '</div>';
    });
    el.innerHTML = html;

    var totalVendas = items.length;
    var totalReceita = items.reduce(function(sum,s){return sum+(s.valorLiquido||0)},0);
    document.getElementById('vendas-count').textContent = totalVendas.toLocaleString('pt-BR') + ' vendas | Receita: ' + formatarMoeda(totalReceita);

    var totalPages = Math.ceil(totalVendas / VENDAS_PAGE_SIZE);
    document.getElementById('vendas-pagination-row').style.display = totalPages > 1 ? 'flex' : 'none';
    document.getElementById('vendas-info').textContent = 'Mostrando '+(start+1)+'-'+Math.min(start+VENDAS_PAGE_SIZE, totalVendas)+' de '+totalVendas.toLocaleString('pt-BR');

    var pagination = document.getElementById('vendas-pagination');
    var btns = '<button '+(vendasPage===1?'disabled':'')+' onclick="mudarPaginaVendas('+(vendasPage-1)+')">◀</button>';
    var sp = Math.max(1, vendasPage-3), ep = Math.min(totalPages, sp+6); if(ep-sp<6) sp=Math.max(1, ep-6);
    for(var p=sp;p<=ep;p++) btns+='<button class="'+(p===vendasPage?'active':'')+'" onclick="mudarPaginaVendas('+p+')">'+p+'</button>';
    btns+='<button '+(vendasPage===totalPages?'disabled':'')+' onclick="mudarPaginaVendas('+(vendasPage+1)+')">▶</button>';
    pagination.innerHTML = btns;
}

function mudarPaginaVendas(page) { vendasPage = page; renderVendas(); }

function openDetail(saleId) {
    var s = allSales.find(function(x){return x.id===saleId}); if(!s) return;
    document.getElementById('modal-title').textContent = 'Cupom #' + s.cupom;
    var payMap = {'Cartao':0,'Pix':0,'PicPay/Voucher':0,'Dinheiro':0};
    (s.finalizadoras||[]).forEach(function(f){var type=classificarPagamento(f);if(type==='pix')payMap['Pix']+=f.valorPago||0;else if(type==='picpay')payMap['PicPay/Voucher']+=f.valorPago||0;else payMap['Cartao']+=f.valorPago||0;});
    var paymentRows='';
    Object.keys(payMap).forEach(function(k){var v=payMap[k];var icon=k==='Pix'?'store':(k==='PicPay/Voucher'?'local_parking':(k==='Dinheiro'?'account_balance_wallet':'credit_card'));paymentRows+='<div class="modal-payment-row"><i class="material-icons">'+icon+'</i> <span class="label"><b>'+k+':</b></span><span class="value'+(v===0?' zero':'')+'">'+formatarMoeda(v)+'</span></div>';});
    var productRows='';
    (s.produtos||[]).filter(function(p){return !p.cancelado}).forEach(function(p){productRows+='<tr><td class="name">'+(p.descricaoReduzida||p.descricaoComercial||'--')+'</td><td class="valor">'+formatarMoeda(p.valorUnitario)+'</td><td>'+p.quantidade+'</td><td class="valor">'+formatarMoeda(p.valorTotal)+'</td></tr>';});
    var cancelledRows = '';
    var prodsCanceladosModal = (s.produtos||[]).filter(function(p){return p.cancelado});
    if (prodsCanceladosModal.length > 0) {
        prodsCanceladosModal.forEach(function(p){
            cancelledRows += '<tr class="modal-cancelled-row"><td class="name">'+(p.descricaoReduzida||p.descricaoComercial||'--')+'</td><td class="valor">'+formatarMoeda(p.valorUnitario)+'</td><td>'+p.quantidade+'</td><td class="valor">'+formatarMoeda(p.valorTotal)+'</td></tr>';
        });
        cancelledRows = '<h4 style="margin-top:20px;color:var(--red)">Itens Cancelados ('+prodsCanceladosModal.length+')</h4><table class="modal-products-table cancelled"><thead><tr><th>Produto</th><th>Valor Unit.</th><th>Qtd</th><th>Total</th></tr></thead><tbody>'+cancelledRows+'</tbody></table>';
    }
    document.getElementById('modal-body').innerHTML = '<div class="modal-sale-header"><div class="modal-icon-circle"><i class="material-icons" style="font-size:28px;color:#3182ce">person</i></div><div><div class="modal-sale-date">'+formatarData(s.dataEfetivacao)+'</div><div class="modal-sale-meta">Totem '+(s.pdvCodigo||'')+' &middot; Loja: '+(nomeLoja(s)||'--')+' &middot; #'+s.cupom+'</div><div class="modal-sale-meta" style="margin-top:4px">'+badgeStatus(s.cancelado, s.nfceSituacaoNome)+'</div></div></div><div class="modal-total-section"><div class="modal-total-label">Total</div><div class="modal-total-value">'+formatarMoeda(s.valorLiquido)+'</div></div><div class="modal-payments"><h4>Forma de Pagamento</h4>'+paymentRows+'</div><div class="modal-products"><h4>Produtos</h4><table class="modal-products-table"><thead><tr><th>Produto</th><th>Valor Unit.</th><th>Qtd</th><th>Total</th></tr></thead><tbody>'+productRows+'</tbody></table></div>' + cancelledRows;
    document.getElementById('modal-overlay').classList.add('visible');
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('visible'); }

// ========== ENTRADAS ==========
function identifyColumns(cols) {
    var map = {date:null,name:null,loja:null,value:null,type:null,extra:null};
    var checks = {date:['data','date','data_entrada','data_hora','datetime','timestamp','hora','dataentrada','dia','Data','DATA','Data Entrada','Data/Hora','Horario','data_registro','datahora'],name:['nome','name','cliente','usuario','user','pessoa','visitante','Nome','CLIENTE','Cliente','Usuario','funcionario','colaborador'],loja:['loja','unidade','filial','store','Loja','LOJA','Unidade','unidade_id','loja_id'],value:['valor','value','preco','total','receita','Valor','VALOR','Total','Preco','valor_total'],type:['tipo','type','acao','acao','movimento','Tipo','TIPO','Type','Acao','Entrada/Saida','Direcao','sentido','direcao'],extra:['observacao','obs','observacao','descricao','descricao','description','Observacao','OBS','Descricao','cpf','documento','cartao','cartao']};
    cols.forEach(function(col){var lower=col.toLowerCase().trim();Object.keys(checks).forEach(function(key){if(!map[key]){checks[key].forEach(function(n){if(lower===n.toLowerCase()||lower.indexOf(n.toLowerCase())!==-1){if(!map[key])map[key]=col;}});}});});
    if(!map.date&&cols.length>0) map.date=cols[0];
    if(!map.name&&cols.length>1) map.name=cols[1];
    return map;
}

function parseDateFlex(val) {
    if(!val) return null;
    var d = new Date(val); if(!isNaN(d.getTime())) return d;
    if(typeof val==='string'&&val.indexOf('/')!==-1){var parts=val.split(/[\/\s:]/);if(parts.length>=3){var d2=new Date(parts[2],parseInt(parts[1])-1,parts[0],parts[3]||0,parts[4]||0,parts[5]||0);if(!isNaN(d2.getTime())) return d2;}}
    if(typeof val==='number'&&val>30000){var excelEpoch=new Date(1899,11,30);var d3=new Date(excelEpoch.getTime()+val*86400000);if(!isNaN(d3.getTime())) return d3;}
    return null;
}

function renderEntradas() {
    var colMap = identifyColumns(excelColumns);
    var el = document.getElementById('entradas-list');

    if (entradaData.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="material-icons" style="font-size:48px;color:#ccc;display:block;margin-bottom:12px;">login</i>Importe uma planilha para ver as entradas.</div>';
        document.getElementById('entradas-pagination-row').style.display = 'none';
        document.getElementById('entradas-count').textContent = '0 entradas';
        return;
    }

    var start = (entradasPage - 1) * ENTRADAS_PAGE_SIZE;
    if (ordemPorHora) {
        entradaData.sort(function(a, b) {
            var da = parseDateFlex(colMap.date ? a[colMap.date] : null);
            var db = parseDateFlex(colMap.date ? b[colMap.date] : null);
            return (da && db) ? (da - db) : 0;
        });
    }
    var pageData = entradaData.slice(start, start + ENTRADAS_PAGE_SIZE);

    var html = '';
    var lastHour = null;
    pageData.forEach(function(row) {
        var dateVal = colMap.date ? row[colMap.date] : null;
        var dateDisplay = dateVal || '--';
        var parsedDate = parseDateFlex(dateVal);
        if (parsedDate && !isNaN(parsedDate.getTime())) dateDisplay = formatarData(parsedDate.toISOString());
        if (ordemPorHora && parsedDate && !isNaN(parsedDate.getTime())) {
            var hora = String(parsedDate.getHours()).padStart(2,'0') + ':00';
            if (hora !== lastHour) {
                lastHour = hora;
                html += '<div class="hour-group-header">' + hora + '</div>';
            }
        }
        var nameVal = colMap.name ? (row[colMap.name]||'') : '';
        var lojaVal = colMap.loja ? (row[colMap.loja]||'') : '';
        var typeVal = colMap.type ? (row[colMap.type]||'') : '';
        var valueVal = colMap.value ? (row[colMap.value]||'') : '';
        var extraVal = colMap.extra ? (row[colMap.extra]||'') : '';
        var tagClass = 'entrada';
        if(typeVal){var tl=typeVal.toLowerCase();if(tl.includes('saida')||tl.includes('saida')||tl.includes('exit'))tagClass='saida';else if(tl.includes('visitante')||tl.includes('visitor'))tagClass='visitante';}
        var valueNum = parseFloat(String(valueVal).replace(',','.').replace(/[^\d.-]/g,''));
        var valueDisplay = valueVal ? (isNaN(valueNum)?valueVal:formatarMoeda(valueNum)) : '';
        var usedCols = [colMap.date, colMap.name, colMap.loja, colMap.value, colMap.type, colMap.extra].filter(Boolean);
        var extraHtml = '';
        excelColumns.forEach(function(col){if(usedCols.indexOf(col)===-1 && row[col] && String(row[col])!=='') extraHtml+='<span class="entrada-mini-extra"><b>'+col+':</b> '+row[col]+'</span>';});

        html += '<div class="entrada-mini">' +
            '<div class="entrada-mini-top"><span class="entrada-mini-date">'+dateDisplay+'</span><span class="entrada-mini-badge '+tagClass+'">'+(typeVal||'ENTRADA')+'</span></div>' +
            (nameVal?'<div class="entrada-mini-name">'+nameVal+'</div>':'') +
            (lojaVal?'<span class="entrada-mini-loja">'+lojaVal+'</span>':'') +
            (valueDisplay?'<div class="entrada-mini-valor">'+valueDisplay+'</div>':'') +
            (extraVal?'<span class="entrada-mini-extra">'+extraVal+'</span>':'') +
            (extraHtml?'<div style="margin-top:4px">'+extraHtml+'</div>':'') +
            '</div>';
    });
    el.innerHTML = html;

    document.getElementById('entradas-count').textContent = entradaData.length.toLocaleString('pt-BR') + ' entradas' + (excelFileName ? ' | ' + excelFileName : '');

    var totalPages = Math.ceil(entradaData.length / ENTRADAS_PAGE_SIZE);
    document.getElementById('entradas-pagination-row').style.display = totalPages > 1 ? 'flex' : 'none';
    document.getElementById('entradas-info').textContent = 'Mostrando '+(start+1)+'-'+Math.min(start+ENTRADAS_PAGE_SIZE, entradaData.length)+' de '+entradaData.length.toLocaleString('pt-BR');

    var pagination = document.getElementById('entradas-pagination');
    var btns = '<button '+(entradasPage===1?'disabled':'')+' onclick="mudarPaginaEntradas('+(entradasPage-1)+')">◀</button>';
    var sp = Math.max(1, entradasPage-3), ep = Math.min(totalPages, sp+6); if(ep-sp<6) sp=Math.max(1, ep-6);
    for(var p=sp;p<=ep;p++) btns+='<button class="'+(p===entradasPage?'active':'')+'" onclick="mudarPaginaEntradas('+p+')">'+p+'</button>';
    btns+='<button '+(entradasPage===totalPages?'disabled':'')+' onclick="mudarPaginaEntradas('+(entradasPage+1)+')">▶</button>';
    pagination.innerHTML = btns;
}

function mudarPaginaEntradas(page) { entradasPage = page; renderEntradas(); }

function rebuild() {
    vendasPage = 1;
    entradasPage = 1;
    renderVendas();
    renderEntradas();
    if (currentTab === 'timeline') renderTimeline();
    if (currentTab === 'verificacao') renderVerificacao();
}

function handleExcelUpload(event) {
    var file = event.target.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, {type:'array'});
            var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            var jsonData = XLSX.utils.sheet_to_json(firstSheet, {defval:''});
            if(jsonData.length===0){alert('Planilha vazia.'); return;}
            entradaData = jsonData;
            excelFileName = file.name;
            excelColumns = Object.keys(jsonData[0]);
            document.getElementById('upload-label').textContent = file.name + ' (' + jsonData.length.toLocaleString('pt-BR') + ' linhas)';
            entradasPage = 1;
            populateLojaFilter();
            rebuild();
        } catch(err) { alert('Erro ao ler planilha: '+err.message); }
    };
    reader.readAsArrayBuffer(file);
}

function exportXLSX() {
    var vendas = getVendasFiltered();

    var vendasRows = [];
    vendas.forEach(function(s) {
        var produtos = (s.produtos||[]).filter(function(p){return !p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial}).join(', ');
        var prodsCanceladosCSV = (s.produtos||[]).filter(function(p){return p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial}).join(', ');
        var detalhes = produtos;
        if (prodsCanceladosCSV) detalhes += (detalhes ? ' | ' : '') + '[CANCELADO] ' + prodsCanceladosCSV;
        vendasRows.push({
            'Data': formatarData(s.dataEfetivacao),
            'Cupom': '#' + s.cupom,
            'Loja': nomeLoja(s) || '',
            'Valor': Number(s.valorLiquido || 0),
            'Cancelado': s.cancelado ? 'Sim' : 'N\u00e3o',
            'Detalhes': detalhes
        });
    });

    var colMap = identifyColumns(excelColumns);
    var entradasRows = [];
    entradaData.forEach(function(row) {
        var dateVal = colMap.date ? row[colMap.date] : '';
        var parsedDate = parseDateFlex(dateVal);
        var dateDisplay = dateVal || '--';
        if (parsedDate && !isNaN(parsedDate.getTime())) dateDisplay = formatarData(parsedDate.toISOString());
        entradasRows.push({
            'Data': dateDisplay,
            'Nome': colMap.name ? (row[colMap.name]||'') : '',
            'Loja': colMap.loja ? (row[colMap.loja]||'') : '',
            'Tipo': colMap.type ? (row[colMap.type]||'ENTRADA') : 'ENTRADA',
            'Valor': colMap.value ? (row[colMap.value]||'') : '',
            'Extra': colMap.extra ? (row[colMap.extra]||'') : ''
        });
    });

    var ocorrenciasRows = [];
    if (monitorAllData && monitorAllData.length > 0) {
        monitorAllData.forEach(function(o) {
            ocorrenciasRows.push({
                'Data': o.data || '',
                'Ocorrência': o.ocorrencia || '',
                'Código': o.codigo || '',
                'Loja': o.unidade || '',
                'PDV': o.pdv || '',
                'Cupom': o.cupom || '',
                'Cliente': o.cliente || '',
                'CPF': o.cpf || '',
                'Valor': o.valor || '',
                'Situação': o.situacao || ''
            });
        });
    }

    if (vendasRows.length === 0 && entradasRows.length === 0 && ocorrenciasRows.length === 0) { alert('Nenhum dado para exportar.'); return; }

    var wb = XLSX.utils.book_new();
    if (vendasRows.length > 0) {
        var wsVendas = XLSX.utils.json_to_sheet(vendasRows);
        XLSX.utils.book_append_sheet(wb, wsVendas, 'Vendas (' + vendasRows.length + ')');
    }
    if (entradasRows.length > 0) {
        var wsEntradas = XLSX.utils.json_to_sheet(entradasRows);
        XLSX.utils.book_append_sheet(wb, wsEntradas, 'Entradas (' + entradasRows.length + ')');
    }
    if (ocorrenciasRows.length > 0) {
        var wsOcorr = XLSX.utils.json_to_sheet(ocorrenciasRows);
        XLSX.utils.book_append_sheet(wb, wsOcorr, 'Ocorrências (' + ocorrenciasRows.length + ')');
    }
    XLSX.writeFile(wb, 'conciliacao_' + dataLocal() + '.xlsx');
}

function toggleOrdemHora() {
    ordemPorHora = !ordemPorHora;
    var btn = document.getElementById('btn-hora');
    if (ordemPorHora) {
        btn.innerHTML = '<i class="material-icons" style="font-size:16px;">schedule</i> Por Hora (ON)';
        btn.classList.remove('btn-black');
        btn.classList.add('btn-green');
    } else {
        btn.innerHTML = '<i class="material-icons" style="font-size:16px;">schedule</i> Por Hora';
        btn.classList.remove('btn-green');
        btn.classList.add('btn-black');
    }
    rebuild();
}

// ========== ENTRADAS PORTA DE ACESSO ==========
function loadEntradasPorta() {
    var btn = document.getElementById('btn-entradas-api');
    btn.disabled = true;
    btn.innerHTML = '<i class="material-icons" style="font-size:14px;">hourglass_empty</i> Carregando...';

    fetch('/entradas-porta')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.ok || data.total === 0) {
                alert('Nenhuma entrada encontrada hoje.');
                btn.disabled = false;
                btn.innerHTML = '<i class="material-icons" style="font-size:14px;">cloud_download</i> Carregar da API';
                return;
            }
            entradaData = data.entradas.map(function(o) {
                return {
                    'Data': o.data || '',
                    'Nome': o.cliente || '',
                    'Loja': o.loja || '',
                    'CPF': o.cpf || '',
                    'Cartao': o.cartao || '',
                    'Telefone': o.telefone || '',
                    'Email': o.email || '',
                    'Apto': o.apartamento || '',
                    'Obs': o.obs || '',
                    'Trava': o.trava || '',
                    'Status': o.status || ''
                };
            });
            excelFileName = 'API - ' + data.total + ' entradas';
            excelColumns = ['Data', 'Nome', 'Loja', 'CPF', 'Cartao', 'Telefone', 'Email', 'Apto', 'Obs', 'Trava', 'Status'];
            document.getElementById('upload-label').textContent = excelFileName;
            entradasPage = 1;
            populateLojaFilter();
            rebuild();
            btn.disabled = false;
            btn.innerHTML = '<i class="material-icons" style="font-size:14px;">check_circle</i> ' + data.total + ' entradas';
            setTimeout(function() {
                btn.innerHTML = '<i class="material-icons" style="font-size:14px;">cloud_download</i> Carregar da API';
            }, 3000);
        })
        .catch(function() {
            alert('Erro ao carregar entradas da API.');
            btn.disabled = false;
            btn.innerHTML = '<i class="material-icons" style="font-size:14px;">cloud_download</i> Carregar da API';
        });
}

document.addEventListener('DOMContentLoaded', function() {
    aoMudarPeriodo();
    var uploadArea = document.getElementById('upload-area');
    uploadArea.addEventListener('dragover',function(e){e.preventDefault();uploadArea.classList.add('dragover');});
    uploadArea.addEventListener('dragleave',function(){uploadArea.classList.remove('dragover');});
    uploadArea.addEventListener('drop',function(e){e.preventDefault();uploadArea.classList.remove('dragover');if(e.dataTransfer.files.length>0){document.getElementById('excel-file').files=e.dataTransfer.files;handleExcelUpload({target:{files:e.dataTransfer.files}});}});
    document.addEventListener('keydown', function(e) { if(e.key==='Escape') closeModal(); });
});

// ========== MONITORAMENTO DE OCORRENCIAS ==========
var monitorTimer = null;
var monitorKnownIds = {};
var monitorRunning = false;
var monitorAllData = [];

// ========== TABS ==========
var currentTab = 'timeline';

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('tab-timeline-content').style.display = tab === 'timeline' ? 'block' : 'none';
    document.getElementById('tab-verificacao-content').style.display = tab === 'verificacao' ? 'block' : 'none';
    document.getElementById('tab-conciliacao-content').style.display = tab === 'conciliacao' ? 'block' : 'none';
    if (tab === 'timeline') renderTimeline();
    if (tab === 'verificacao') renderVerificacao();
}

// ========== VISÃO POR CLIENTE ==========
function limparCPF(cpf) {
    if (!cpf) return '';
    return String(cpf).replace(/[^\d]/g, '');
}

function renderClientes() {
    var vendas = getVendasFiltered();
    var el = document.getElementById('cliente-list');
    var summary = document.getElementById('cliente-summary');

    var logs = (monitorAllData || []).filter(function(o) {
        return o.codigo === '41' || o.codigo === '42';
    });

    var ocorrencias = (monitorAllData || []).filter(function(o) {
        return ['1','2','8','13','32'].indexOf(o.codigo) !== -1;
    });

    if (vendas.length === 0 && logs.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="material-icons" style="font-size:48px;color:#ccc;display:block;margin-bottom:12px;">person_search</i>Carregue vendas e inicie o monitoramento.</div>';
        summary.textContent = 'Carregue vendas e inicie o monitoramento';
        return;
    }

    var clientes = {};
    logs.forEach(function(log) {
        var cpf = limparCPF(log.cpf);
        var key = cpf || ('anon_' + log.id);
        if (!clientes[key]) clientes[key] = { nome: log.cliente || 'Sem nome', cpf: cpf, entradas: [], vendasProximas: [], ocorrencias: [] };
        clientes[key].entradas.push(log);
    });

    logs.forEach(function(log) {
        var cpf = limparCPF(log.cpf);
        var key = cpf || ('anon_' + log.id);
        if (!clientes[key]) return;
        var entryTime = new Date(log.data).getTime();

        ocorrencias.forEach(function(occ) {
            if (occ.cpf && limparCPF(occ.cpf) === cpf) {
                var already = clientes[key].ocorrencias.some(function(o) { return o.id === occ.id; });
                if (!already) clientes[key].ocorrencias.push(occ);
            }
            if (occ.cupom) {
                var cupom = String(occ.cupom).replace('#','');
                vendas.forEach(function(v) {
                    if (String(v.cupom) === cupom) {
                        var vTime = new Date(v.dataEfetivacao).getTime();
                        var diffMin = Math.abs(vTime - entryTime) / 60000;
                        if (diffMin <= 60) {
                            var already = clientes[key].vendasProximas.some(function(x) { return x.id === v.id; });
                            if (!already) clientes[key].vendasProximas.push({ cupom: v.cupom, valor: v.valorLiquido, data: v.dataEfetivacao, id: v.id });
                        }
                    }
                });
            }
        });

        vendas.forEach(function(v) {
            var vTime = new Date(v.dataEfetivacao).getTime();
            var diffMin = Math.abs(vTime - entryTime) / 60000;
            if (diffMin <= 5) {
                var already = clientes[key].vendasProximas.some(function(x) { return x.id === v.id; });
                if (!already) clientes[key].vendasProximas.push({ cupom: v.cupom, valor: v.valorLiquido, data: v.dataEfetivacao, id: v.id });
            }
        });
    });

    var todosClientes = [];
    Object.keys(clientes).forEach(function(k) { todosClientes.push(clientes[k]); });

    todosClientes.sort(function(a, b) {
        var da = a.entradas[0] ? new Date(a.entradas[0].data) : new Date(0);
        var db = b.entradas[0] ? new Date(b.entradas[0].data) : new Date(0);
        return db - da;
    });

    var verificar = 0, atencao = 0, ok = 0;

    var html = '';
    todosClientes.forEach(function(c) {
        var temVenda = c.vendasProximas.length > 0;
        var temOcorrencia = c.ocorrencias.length > 0;
        var risco, flagClass, flagText;

        if (temOcorrencia) {
            risco = 'risco-alto'; flagClass = 'verificar'; flagText = 'VERIFICAR';
            verificar++;
        } else if (!temVenda) {
            risco = 'risco-medio'; flagClass = 'atencao'; flagText = 'ATENÇÃO';
            atencao++;
        } else {
            risco = 'risco-baixo'; flagClass = 'ok'; flagText = 'OK';
            ok++;
        }

        html += '<div class="cliente-card ' + risco + '">' +
            '<div class="cliente-card-header">' +
                '<div><div class="cliente-card-nome">' + (c.nome || 'Sem nome') + '</div>' + (c.cpf ? '<div class="cliente-card-cpf">CPF: ' + c.cpf + '</div>' : '') + '</div>' +
                '<span class="cliente-flag ' + flagClass + '"><i class="material-icons" style="font-size:14px;">' + (risco === 'risco-alto' ? 'warning' : risco === 'risco-medio' ? 'error_outline' : 'check_circle') + '</i> ' + flagText + '</span>' +
            '</div>';

        c.entradas.forEach(function(e) {
            var d = new Date(e.data);
            html += '<div class="cliente-linha"><i class="material-icons">login</i><span class="cliente-hora">' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + '</span><span class="cliente-detalhe">Entrada' + (e.unidade ? ' | ' + e.unidade : '') + '</span></div>';
        });

        c.vendasProximas.forEach(function(v) {
            var d = new Date(v.data);
            html += '<div class="cliente-linha"><i class="material-icons">shopping_cart</i><span class="cliente-hora">' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + '</span><span class="cliente-detalhe">Cupom #' + v.cupom + ' | ' + formatarMoeda(v.valor) + '</span></div>';
        });

        c.ocorrencias.forEach(function(occ) {
            var d = new Date(occ.data);
            html += '<div class="cliente-linha erro"><i class="material-icons">warning</i><span class="cliente-hora">' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + '</span><span class="cliente-detalhe">' + occ.ocorrencia + '</span></div>';
        });

        html += '</div>';
    });

    el.innerHTML = html || '<div class="empty-state">Nenhum cliente encontrado com os filtros atuais.</div>';
    summary.textContent = '🔴 ' + verificar + ' Verificar | 🟡 ' + atencao + ' Atenção | 🟢 ' + ok + ' OK | ' + todosClientes.length + ' clientes';
}

function renderVerificacao() {
    var vendas = getVendasFiltered();
    var el = document.getElementById('verificacao-list');
    var info = document.getElementById('verificacao-info');

    var logs = (monitorAllData || []).filter(function(o) { return o.codigo === '41' || o.codigo === '42'; });
    var ocorrencias = (monitorAllData || []).filter(function(o) { return ['1','2','8','13','32'].indexOf(o.codigo) !== -1; });

    if (vendas.length === 0 && logs.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="material-icons" style="font-size:48px;color:#ccc;display:block;margin-bottom:12px;">security</i>Carregue vendas e inicie o monitoramento.</div>';
        info.textContent = 'Entradas sem compra + Vendas canceladas';
        return;
    }

    var html = '';
    var countSemVenda = 0, countCancelado = 0;

    logs.forEach(function(log) {
        var entryTime = new Date(log.data).getTime();
        var temVenda = vendas.some(function(v) {
            var vTime = new Date(v.dataEfetivacao).getTime();
            var diff = (vTime - entryTime) / 60000;
            return diff >= 0 && diff <= 15 && nomeLoja(v) === log.unidade;
        });

        if (!temVenda) {
            countSemVenda++;
            var d = new Date(log.data);
            html += '<div class="tl-row entrada">' +
                '<span class="tl-time">' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + '</span>' +
                '<span class="tl-tag aviso">⚠️ Sem compra</span>' +
                '<span class="tl-desc">' + (log.cliente || 'Visitante') + (log.cpf ? ' | CPF ' + log.cpf : '') + '</span>' +
                '<span class="tl-loja">' + (log.unidade || '') + '</span>' +
                '</div>';
        }
    });

    vendas.forEach(function(s) {
        if (!s.cancelado) {
            var cup = String(s.cupom);
            var temOcorr = ocorrencias.some(function(o) { return o.cupom && String(o.cupom) === cup; });
            if (!temOcorr) return;
        }
        countCancelado++;
        var d = new Date(s.dataEfetivacao);
        var prods = (s.produtos||[]).filter(function(p){return !p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial}).join(', ');
        var prodsCancel = (s.produtos||[]).filter(function(p){return p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial}).join(', ');
        var tagClass = s.cancelado ? 'ocorrencia' : 'aviso';
        var motivo = s.cancelado ? 'Venda Cancelada' : 'Com ocorrência';
        var desc = 'Cupom #' + s.cupom + ' | ' + formatarMoeda(s.valorLiquido) + ' | ' + nomeLoja(s);
        if (prods) desc += ' | Produtos: ' + prods;
        if (prodsCancel) desc += ' | CANCELADOS: ' + prodsCancel;

        html += '<div class="tl-row ' + (s.cancelado ? 'ocorrencia' : 'aviso') + '">' +
            '<span class="tl-time">' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + '</span>' +
            '<span class="tl-tag ' + tagClass + '">' + motivo + '</span>' +
            '<span class="tl-desc">' + desc + '</span>' +
            '</div>';
    });

    if (html === '') {
        html = '<div class="empty-state" style="padding:20px;color:#38a169;"><i class="material-icons" style="font-size:48px;color:#38a169;display:block;margin-bottom:12px;">check_circle</i>Nenhum item suspeito encontrado</div>';
    }

    el.innerHTML = html;
    info.textContent = countSemVenda + ' entradas sem compra | ' + countCancelado + ' vendas suspeitas';
}

function renderTimeline() {
    var vendas = getVendasFiltered();
    var el = document.getElementById('timeline-list');
    var info = document.getElementById('timeline-info');

    var items = [];

    // Log-porta entries
    (monitorAllData || []).forEach(function(o) {
        if (o.codigo === '41' || o.codigo === '42') {
            var d = new Date(o.data);
            if (isNaN(d.getTime())) return;
            items.push({
                hora: d.getHours(),
                minutos: d.getMinutes(),
                time: String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'),
                type: 'entrada',
                nome: o.cliente || 'Visitante',
                loja: o.unidade || '',
                cpf: o.cpf || ''
            });
        }
    });

    // Vendas with full details
    vendas.forEach(function(s) {
        var d = new Date(s.dataEfetivacao);
        var prods = (s.produtos||[]).filter(function(p){return !p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial});
        var prodsCancel = (s.produtos||[]).filter(function(p){return p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial});
        var payMethod = '';
        (s.finalizadoras||[]).forEach(function(f){
            var desc = (f.formaPagamentoDescricao || f.descricao || '').toLowerCase();
            if (desc.includes('pix')||desc.includes('carteira digital')) payMethod = 'Totem Pix';
            else if (desc.includes('debito')||desc.includes('débito')) payMethod = 'Totem Cartão de Débito';
            else if (desc.includes('credito')||desc.includes('crédito')) payMethod = 'Totem Cartão de Crédito';
            else if (desc.includes('picpay')||desc.includes('pluxee')||desc.includes('ticket')||desc.includes('voucher')) payMethod = 'Totem PicPay/Voucher';
        });
        if (!payMethod) payMethod = 'Totem Cartão';

        items.push({
            hora: d.getHours(),
            minutos: d.getMinutes(),
            time: String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'),
            type: 'venda',
            nome: nomeLoja(s) || '',
            loja: 'Totem ' + nomeLoja(s),
            valor: s.valorLiquido || 0,
            cupom: s.cupom,
            cancelado: s.cancelado,
            payMethod: payMethod,
            prods: prods,
            prodsCancel: prodsCancel
        });
    });

    // Occurrences
    (monitorAllData || []).forEach(function(o) {
        if (['1','2','8','13','32'].indexOf(o.codigo) !== -1) {
            var d = new Date(o.data);
            if (isNaN(d.getTime())) return;
            items.push({
                hora: d.getHours(),
                minutos: d.getMinutes(),
                time: String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'),
                type: 'ocorrencia',
                nome: o.ocorrencia || '',
                loja: o.unidade || '',
                cupom: o.cupom || ''
            });
        }
    });

    // Entradas from Excel
    entradaData.forEach(function(row) {
        var dateVal = row['Data'] || row['data'] || row['Data/Hora'] || row['datahora'] || '';
        var pd = parseDateFlex(dateVal);
        if (pd && !isNaN(pd.getTime())) {
            items.push({
                hora: pd.getHours(),
                minutos: pd.getMinutes(),
                time: String(pd.getHours()).padStart(2,'0') + ':' + String(pd.getMinutes()).padStart(2,'0'),
                type: 'entrada-excel',
                nome: (row['Nome'] || row['Cliente'] || '') + ' | ' + (row['Tipo'] || row['Ação'] || 'ENTRADA'),
                loja: row['Loja'] || row['Unidade'] || ''
            });
        }
    });

    items.sort(function(a, b) { return (a.hora * 60 + a.minutos) - (b.hora * 60 + b.minutos); });

    if (items.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="material-icons" style="font-size:48px;color:#ccc;display:block;margin-bottom:12px;">timeline</i>Carregue vendas e inicie o monitoramento.</div>';
        info.textContent = 'Tudo por hora';
        return;
    }

    var counts = {venda:0, ocorrencia:0, entrada:0, 'entrada-excel':0};
    items.forEach(function(i) { counts[i.type] = (counts[i.type]||0) + 1; });
    info.textContent = counts.venda + ' vendas | ' + counts.entrada + ' entradas | ' + counts.ocorrencia + ' ocorrências';

    var html = '';
    var lastHour = null;

    // Agrupa: entrada + vendas próximas em até 5 min
    var processedVendas = {};
    items.forEach(function(item) {
        if (item.hora !== lastHour) {
            lastHour = item.hora;
            html += '<div class="timeline-hour">' + String(item.hora).padStart(2,'0') + ':00</div>';
        }

        if (item.type === 'entrada') {
            // Encontra vendas próximas (até 5 min depois, mesma loja)
            var entryLoja = item.loja;
            var entryMin = item.hora * 60 + item.minutos;
            var vendasProximas = [];
            items.forEach(function(v) {
                if (v.type === 'venda' && !processedVendas[v.cupom]) {
                    var vMin = v.hora * 60 + v.minutos;
                    var diff = vMin - entryMin;
                    if (diff >= 0 && diff <= 5 && v.nome === entryLoja) {
                        vendasProximas.push(v);
                        processedVendas[v.cupom] = true;
                    }
                }
            });

            html += '<div class="tl-row entrada">' +
                '<span class="tl-time">' + item.time + '</span>' +
                '<span class="tl-tag entrada">Entrada</span>' +
                '<span class="tl-desc">' + item.nome + (item.cpf ? ' | CPF ' + item.cpf : '') + '</span>' +
                '<span class="tl-loja">' + item.loja + '</span>' +
                '</div>';

            vendasProximas.forEach(function(v) {
                var statusTag = v.cancelado ? '<span class="tl-status cancelado">Cancelado</span>' : '<span class="tl-status pago">Pago</span>';
                var prodList = v.prods.join(', ');
                if (v.prodsCancel.length > 0) {
                    prodList += ' <span class="tl-cancel-prod">| CANCELADOS: ' + v.prodsCancel.join(', ') + '</span>';
                }
                html += '<div class="tl-row venda child' + (v.cancelado ? ' cancelado' : '') + '">' +
                    '<span class="tl-time">' + v.time + '</span>' +
                    '<span class="tl-tag venda">▼ Venda</span>' +
                    '<div class="tl-detalhe">' +
                        '<div class="tl-pay">' + v.payMethod + ' | ' + formatarMoeda(v.valor) + ' ' + statusTag + '</div>' +
                        '<div class="tl-prod">' + prodList + '</div>' +
                    '</div>' +
                    '<span class="tl-loja">' + v.loja + '</span>' +
                    '</div>';
            });

            if (vendasProximas.length === 0) {
                html += '<div class="tl-row aviso">' +
                    '<span class="tl-time"></span>' +
                    '<span class="tl-tag aviso">⚠️</span>' +
                    '<span class="tl-desc" style="color:#c53030;">Sem compra nos próximos 5 min</span>' +
                    '</div>';
            }

        } else if (item.type === 'venda' && !processedVendas[item.cupom]) {
            // Venda sem entrada correspondente
            var statusTag = item.cancelado ? '<span class="tl-status cancelado">Cancelado</span>' : '<span class="tl-status pago">Pago</span>';
            var prodList = item.prods.join(', ');
            if (item.prodsCancel.length > 0) {
                prodList += ' <span class="tl-cancel-prod">| CANCELADOS: ' + item.prodsCancel.join(', ') + '</span>';
            }
            html += '<div class="tl-row venda orphan">' +
                '<span class="tl-time">' + item.time + '</span>' +
                '<span class="tl-tag venda">Venda</span>' +
                '<div class="tl-detalhe">' +
                    '<div class="tl-pay">' + item.payMethod + ' | ' + formatarMoeda(item.valor) + ' ' + statusTag + '</div>' +
                    '<div class="tl-prod">' + prodList + '</div>' +
                '</div>' +
                '<span class="tl-loja">' + item.loja + '</span>' +
                '</div>';
            processedVendas[item.cupom] = true;

        } else if (item.type === 'ocorrencia') {
            html += '<div class="tl-row ocorrencia">' +
                '<span class="tl-time">' + item.time + '</span>' +
                '<span class="tl-tag ocorrencia">Alerta</span>' +
                '<span class="tl-desc">' + item.nome + (item.cupom ? ' | Cupom ' + item.cupom : '') + '</span>' +
                '<span class="tl-loja">' + item.loja + '</span>' +
                '</div>';
        } else if (item.type === 'entrada-excel') {
            html += '<div class="tl-row entrada-excel">' +
                '<span class="tl-time">' + item.time + '</span>' +
                '<span class="tl-tag entrada-excel">Planilha</span>' +
                '<span class="tl-desc">' + item.nome + '</span>' +
                '<span class="tl-loja">' + item.loja + '</span>' +
                '</div>';
        }
    });
    el.innerHTML = html;
}

function atualizarFiltroTipos() {
    if (!monitorRunning) return;
    renderOcorrencias(monitorAllData);
}

function toggleMonitor() {
    if (monitorRunning) {
        stopMonitor();
    } else {
        startMonitor();
    }
}

function startMonitor() {
    monitorRunning = true;
    monitorKnownIds = {};
    document.getElementById('btn-monitor').innerHTML = '<i class="material-icons" style="font-size:16px;">stop</i> Parar';
    document.getElementById('btn-monitor').classList.remove('btn-green');
    document.getElementById('btn-monitor').classList.add('btn-black');
    document.getElementById('monitor-status-text').textContent = 'Conectando...';
    document.getElementById('monitor-dot').className = 'monitor-dot offline';
    pollOcorrencias();
    monitorTimer = setInterval(pollOcorrencias, 10000);
}

function stopMonitor() {
    monitorRunning = false;
    if (monitorTimer) clearInterval(monitorTimer);
    document.getElementById('btn-monitor').innerHTML = '<i class="material-icons" style="font-size:16px;">play_arrow</i> Iniciar';
    document.getElementById('btn-monitor').classList.remove('btn-black');
    document.getElementById('btn-monitor').classList.add('btn-green');
    document.getElementById('monitor-status-text').textContent = 'Parado';
    document.getElementById('monitor-dot').className = 'monitor-dot offline';
}

function pollOcorrencias() {
    if (!monitorRunning) return;
    var range = getDateRange();
    var url = '/ocorrencias';
    if (range.inicio) url += '?inicio=' + range.inicio.split('-').reverse().join('/');
    if (range.fim && range.inicio !== range.fim) url += (range.inicio ? '&' : '?') + 'fim=' + range.fim.split('-').reverse().join('/');
    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.ok) {
                document.getElementById('monitor-status-text').textContent = 'Erro';
                document.getElementById('monitor-dot').className = 'monitor-dot offline';
                return;
            }
            document.getElementById('monitor-dot').className = 'monitor-dot online';
            document.getElementById('monitor-status-text').textContent = 'Online';
            var now = new Date();
            document.getElementById('monitor-last').textContent = 'Última atualização: ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
            document.getElementById('monitor-count').textContent = data.total + ' ocorrências hoje';
            monitorAllData = data.ocorrencias;
            renderOcorrencias(monitorAllData);
        })
        .catch(function() {
            document.getElementById('monitor-status-text').textContent = 'Erro';
            document.getElementById('monitor-dot').className = 'monitor-dot offline';
        });
}

function renderOcorrencias(dados) {
    var selectedTypes = [];
    document.querySelectorAll('#monitor-filtro-tipos input[type=checkbox]:checked').forEach(function(cb) {
        selectedTypes.push(cb.value);
    });

    var newCount = 0;
    var html = '';
    dados.forEach(function(o) {
        if (selectedTypes.length > 0 && selectedTypes.indexOf(o.codigo) === -1) return;
        var isNew = !monitorKnownIds[o.id];
        if (isNew) newCount++;
        monitorKnownIds[o.id] = true;
        var dataFmt = o.data ? formatarData(o.data) : '--';
        html += '<div class="ocorrencia-mini' + (isNew ? ' nova' : '') + '">' +
            '<div class="ocorrencia-mini-top">' +
                '<span class="ocorrencia-mini-tipo">' + o.ocorrencia + '</span>' +
                '<span class="ocorrencia-mini-data">' + dataFmt + '</span>' +
            '</div>' +
            '<div class="ocorrencia-mini-mid">' +
                (o.unidade ? '<span class="ocorrencia-mini-loja">' + o.unidade + '</span>' : '') +
                (o.pdv ? '<span class="ocorrencia-mini-pdv">' + o.pdv + '</span>' : '') +
                (o.cupom ? '<span class="ocorrencia-mini-cupom">Cupom #' + o.cupom + '</span>' : '') +
                (o.cliente ? '<span class="ocorrencia-mini-cliente">' + o.cliente + '</span>' : '') +
                (o.cpf ? '<span class="ocorrencia-mini-cpf">CPF: ' + o.cpf + '</span>' : '') +
                (o.valor && o.valor !== '1.00' ? '<span class="ocorrencia-mini-valor">' + formatarMoeda(o.valor) + '</span>' : '') +
            '</div>' +
            '</div>';
    });

    if (newCount > 0) {
        document.title = '(' + newCount + ') Ocorrências - E4 Conciliação';
    }

    if (html === '') {
        html = '<div class="empty-state" style="padding:20px;">Nenhuma ocorrência hoje para os filtros selecionados.</div>';
    }

    document.getElementById('monitor-list').innerHTML = html;
    if (currentTab === 'timeline') renderTimeline();
    if (currentTab === 'verificacao') renderVerificacao();
}