var API_CONFIG = {
    baseUrl: '/api',
    clientId: '215',
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnRlIjoiMjE1IiwiZGF0YSI6IjIwMjYtMDQtMjkgMTU6NDU6MTQiLCJkb2N1bWVudG8iOiJ2cDAwMDA3MzUzLXAwMDEiLCJlbmRlcmVjbyI6InJ1YSB0cmFqYW5vIHJlaXMiLCJjb250YXRvIjoiY2xpZW50ZSIsInRlbGVmb25lIjoiMTE5OTk5OTkiLCJpc3MiOiJlNHNpc3RlbWFzLmNvbS5iciIsInN1YiI6IkF1dGVudGljYVx1MDBlN1x1MDBlM28iLCJhdWQiOiJUZXJjZWlyb3MgdmlhIEFQSSJ9.VKTPNRxHJauxQnSc/ur7cEpc9P6XO/lLYDacj8dj450='
};

var allSales = [];
var filteredSales = [];
var currentPage = 1;
var PAGE_SIZE = 10;

function formatarMoeda(v) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function apiHeaders() {
    return { 'Content-Type': 'application/json', 'X-Cliente-Id': API_CONFIG.clientId, 'Authorization': 'Bearer ' + API_CONFIG.token };
}

async function fetchSales(dataInicio, dataFim) {
    var spinner = document.getElementById('global-spinner');
    var progressContainer = document.getElementById('progress-container');
    var progressFill = document.getElementById('progress-fill');
    var progressText = document.getElementById('progress-text');
    var progressPercent = document.getElementById('progress-percent');

    spinner.classList.add('visible');
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressFill.style.background = '';
    progressPercent.textContent = '0%';

    var body = { unidade: null, dataInicial: dataInicio + ' 00:00:00', dataFinal: dataFim + ' 23:59:59' };
    var headers = apiHeaders();

    try {
        var firstRes = await fetch(API_CONFIG.baseUrl + '/vendas/listagem?pagina=1&quantidade=100', { method: 'POST', headers: headers, body: JSON.stringify(body) });
        if (!firstRes.ok) throw new Error('HTTP ' + firstRes.status);
        var firstData = await firstRes.json();
        var totalRecords = firstData.paginacao.qtdTotalRegistros;
        var totalPages = Math.ceil(totalRecords / 100);

        allSales = firstData.registros.slice();
        progressFill.style.width = '5%'; progressPercent.textContent = '5%';
        progressText.textContent = 'Carregando ' + allSales.length.toLocaleString('pt-BR') + ' de ' + totalRecords.toLocaleString('pt-BR') + '...';

        var batchSize = 5;
        for (var i = 2; i <= totalPages; i += batchSize) {
            var batch = [];
            for (var j = i; j < Math.min(i + batchSize, totalPages + 1); j++) {
                batch.push(fetch(API_CONFIG.baseUrl + '/vendas/listagem?pagina=' + j + '&quantidade=100', { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function(r){return r.json()}).then(function(d){return d.registros||[]}).catch(function(){return[]}));
            }
            var results = await Promise.all(batch);
            results.forEach(function(r) { allSales = allSales.concat(r); });
            var pct = Math.min(Math.round((allSales.length / totalRecords) * 100), 100);
            progressFill.style.width = pct + '%'; progressPercent.textContent = pct + '%';
            progressText.textContent = 'Carregando ' + allSales.length.toLocaleString('pt-BR') + ' de ' + totalRecords.toLocaleString('pt-BR') + '...';
        }

        allSales.sort(function(a, b) { return new Date(b.dataEfetivacao) - new Date(a.dataEfetivacao); });
        progressFill.style.width = '100%'; progressPercent.textContent = '100%';
        progressText.textContent = allSales.length.toLocaleString('pt-BR') + ' registros carregados!';
    } catch (error) {
        console.error('Erro:', error);
        progressText.textContent = 'Erro ao carregar. Verifique a conexao.';
        progressFill.style.width = '100%'; progressFill.style.background = '#f44336';
    }

    spinner.classList.remove('visible');
    setTimeout(function() { progressContainer.style.display = 'none'; progressFill.style.background = ''; }, 2000);
}

function updatePaymentCards() {
    var storeFilter = document.getElementById('loja-filter').value;
    var sales = allSales.filter(function(s) { if (s.cancelado) return false; if (storeFilter && nomeLoja(s) !== storeFilter) return false; return true; });
    var payments = { cartao: 0, picpay: 0, pix: 0 };
    var counts = { cartao: 0, picpay: 0, pix: 0 };
    sales.forEach(function(s) {
        if ((s.finalizadoras || []).length === 0) { payments.cartao += s.valorLiquido || 0; counts.cartao++; return; }
        (s.finalizadoras || []).forEach(function(f) { var type = classificarPagamento(f); payments[type] += f.valorPago || 0; counts[type]++; });
    });
    document.getElementById('val-cartao').textContent = formatarMoeda(payments.cartao);
    document.getElementById('count-cartao').textContent = counts.cartao.toLocaleString('pt-BR') + ' transações';
    document.getElementById('val-picpay').textContent = formatarMoeda(payments.picpay);
    document.getElementById('count-picpay').textContent = counts.picpay.toLocaleString('pt-BR') + ' transações';
    document.getElementById('val-pix').textContent = formatarMoeda(payments.pix);
    document.getElementById('count-pix').textContent = counts.pix.toLocaleString('pt-BR') + ' transações';
}

function updateMetrics() {
    var storeFilter = document.getElementById('loja-filter').value;
    var filtered = allSales.filter(function(s) { return storeFilter ? nomeLoja(s) === storeFilter : true; });
    var validSales = filtered.filter(function(s) { return !s.cancelado; });
    var totalRevenue = validSales.reduce(function(sum, s) { return sum + (s.valorLiquido || 0); }, 0);
    var avgTicket = validSales.length > 0 ? totalRevenue / validSales.length : 0;
    var carteira = 0;
    validSales.forEach(function(s) { (s.finalizadoras || []).forEach(function(f) { if ((f.formaPagamentoDescricao || '').toLowerCase().includes('dinheiro')) carteira += f.valorPago || 0; }); });
    document.getElementById('metric-compras').textContent = filtered.length.toLocaleString('pt-BR');
    document.getElementById('metric-receita').textContent = formatarMoeda(totalRevenue);
    document.getElementById('metric-ticket').textContent = formatarMoeda(avgTicket);
    document.getElementById('metric-carteira').textContent = formatarMoeda(carteira);
}

function applyFilters() {
    var storeFilter = document.getElementById('loja-filter').value;
    var search = document.getElementById('cupom-search').value.toLowerCase();
    var statusFilter = document.getElementById('status-filter').value;
    filteredSales = allSales.filter(function(s) {
        if (storeFilter && nomeLoja(s) !== storeFilter) return false;
        if (statusFilter === 'autorizado' && (s.cancelado || !(s.nfceSituacaoNome || '').toLowerCase().includes('autorizado'))) return false;
        if (statusFilter === 'cancelado' && !s.cancelado) return false;
        if (search) {
            var produtos = (s.produtos || []).map(function(p) { return (p.descricaoReduzida || '').toLowerCase() + ' ' + (p.descricaoComercial || '').toLowerCase(); }).join(' ');
            var pagamentos = (s.finalizadoras || []).map(function(f) { return (f.descricao || '').toLowerCase() + ' ' + (f.formaPagamentoDescricao || '').toLowerCase(); }).join(' ');
            var str = s.cupom + ' ' + nomeLoja(s) + ' ' + produtos + ' ' + pagamentos;
            if (str.toLowerCase().indexOf(search) === -1) return false;
        }
        return true;
    });
    currentPage = 1; renderCupons(); updatePaymentCards(); updateMetrics();
}

function renderCupons() {
    var listEl = document.getElementById('sales-list');
    var start = (currentPage - 1) * PAGE_SIZE;
    var pageData = filteredSales.slice(start, start + PAGE_SIZE);
    if (pageData.length === 0) { listEl.innerHTML = '<div class="empty-state">Nenhuma venda encontrada</div>'; document.getElementById('pagination-row').style.display = 'none'; return; }
    var html = '';
    var entradasUsadas = {};
    pageData.forEach(function(s) {
        // Busca entrada correspondente (até 5 min antes, mesma loja)
        if (logPortaAtivo && logPortaData.length > 0) {
            var saleTime = new Date(s.dataEfetivacao).getTime();
            var saleLoja = nomeLoja(s);
            var melhor = null;
            logPortaData.forEach(function(e) {
                if (entradasUsadas[e.id]) return;
                var entryTime = new Date(e.data).getTime();
                var diff = (saleTime - entryTime) / 60000;
                if (diff >= 0 && diff <= 5 && e.unidade === saleLoja) {
                    if (!melhor || diff < (saleTime - new Date(melhor.data).getTime()) / 60000) {
                        melhor = e;
                    }
                }
            });
            if (melhor) {
                entradasUsadas[melhor.id] = true;
                var ed = new Date(melhor.data);
                html += '<div class="entry-badge">' +
                    '<i class="material-icons" style="font-size:14px;color:#38a169;">login</i>' +
                    '<span class="entry-badge-nome">' + (melhor.cliente || 'Entrada') + '</span>' +
                    '<span class="entry-badge-loja">' + (melhor.unidade || '') + '</span>' +
                    '<span class="entry-badge-time">' + String(ed.getHours()).padStart(2,'0') + ':' + String(ed.getMinutes()).padStart(2,'0') + '</span>' +
                    '</div>';
            }
        }

        var produtos = (s.produtos || []).filter(function(p){return !p.cancelado}).map(function(p){return p.descricaoReduzida || p.descricaoComercial}).join(', ');
        var payMap = { 'Cartão': 0, 'Carteira': 0, 'Picpay': 0, 'Pix': 0 };
        (s.finalizadoras || []).forEach(function(f) { var type = classificarPagamento(f); if(type==='pix') payMap['Pix']+=f.valorPago||0; else if(type==='picpay') payMap['Picpay']+=f.valorPago||0; else if(type==='cartao') payMap['Cartão']+=f.valorPago||0; else payMap['Cartão']+=f.valorPago||0; });
        var paymentLines = '';
        Object.keys(payMap).forEach(function(k) { if(payMap[k]>0){var icon=k==='Pix'?'store':(k==='Picpay'?'local_parking':(k==='Carteira'?'account_balance_wallet':'credit_card')); paymentLines+='<p class="sale-pay-method"><i class="material-icons" style="font-size:14px;">'+icon+'</i> <b>'+k+':</b> '+formatarMoeda(payMap[k])+'</p>';} });
        if(!paymentLines) paymentLines='<p class="sale-pay-method"><i class="material-icons" style="font-size:14px;">credit_card</i> <b>Cartão:</b> '+formatarMoeda(s.valorLiquido)+'</p>';
        var productRows = '';
        (s.produtos||[]).filter(function(p){return !p.cancelado}).forEach(function(p){ productRows+='<tr><td class="name">'+(p.descricaoReduzida||p.descricaoComercial||'--')+'</td><td>'+formatarMoeda(p.valorUnitario)+'</td><td>'+p.quantidade+'</td></tr>'; });
        var userName = 'Totem '+(nomeLoja(s)||''); if(s.pdvId) userName+=' '+s.pdvCodigo;
        html+='<div class="sale-card" onclick="openDetail(\''+s.id+'\')"><div class="sale-card-inner"><div class="sale-avatar"><i class="material-icons">person</i></div><div class="sale-left"><p class="sale-date">'+formatarData(s.dataEfetivacao)+'</p><p class="sale-meta">Usuário: '+userName+'</p><p class="sale-meta">Loja: '+(nomeLoja(s)||'--')+'</p><p class="sale-meta">#'+s.cupom+'</p></div><div class="sale-center"><p class="sale-total-line"><b>Total: '+formatarMoeda(s.valorLiquido)+'</b></p>'+paymentLines+'</div><div class="sale-right"><table class="sale-products-table"><thead><tr><th>Produto</th><th>Valor</th><th>Qtd</th></tr></thead><tbody>'+productRows+'</tbody></table></div></div></div>';
    });
    // Entradas sem venda correspondente
    if (logPortaAtivo && logPortaData.length > 0) {
        logPortaData.forEach(function(e) {
            if (!entradasUsadas[e.id]) {
                var ed = new Date(e.data);
                html += '<div class="entry-badge sem-compra">' +
                    '<i class="material-icons" style="font-size:14px;color:#e53e3e;">login</i>' +
                    '<span class="entry-badge-nome">' + (e.cliente || 'Entrada') + '</span>' +
                    '<span class="entry-badge-loja">' + (e.unidade || '') + '</span>' +
                    '<span class="entry-badge-time">' + String(ed.getHours()).padStart(2,'0') + ':' + String(ed.getMinutes()).padStart(2,'0') + '</span>' +
                    '<span class="entry-badge-sem">Sem compra</span>' +
                    '</div>';
            }
        });
    }
    listEl.innerHTML = html;
    var totalPages = Math.ceil(filteredSales.length / PAGE_SIZE);
    document.getElementById('cupons-info').textContent = 'Mostrando '+(start+1)+'-'+Math.min(start+PAGE_SIZE, filteredSales.length)+' de '+filteredSales.length.toLocaleString('pt-BR');
    document.getElementById('pagination-row').style.display = totalPages > 1 ? 'flex' : 'none';
    var pagination = document.getElementById('pagination');
    var btns = '<button '+(currentPage===1?'disabled':'')+' onclick="changePage('+(currentPage-1)+')">◀</button>';
    var sp = Math.max(1, currentPage-3), ep = Math.min(totalPages, sp+6); if(ep-sp<6) sp=Math.max(1, ep-6);
    for(var p=sp; p<=ep; p++) btns+='<button class="'+(p===currentPage?'active':'')+'" onclick="changePage('+p+')">'+p+'</button>';
    btns+='<button '+(currentPage===totalPages?'disabled':'')+' onclick="changePage('+(currentPage+1)+')">▶</button>';
    pagination.innerHTML = btns;
}

function changePage(page) { currentPage = page; renderCupons(); document.querySelector('.sales-list').scrollIntoView({behavior:'smooth'}); }

function openDetail(saleId) {
    var s = allSales.find(function(x){return x.id===saleId}); if(!s) return;
    document.getElementById('modal-title').textContent = 'Cupom #' + s.cupom;
    var payMap = {'Cartão':0,'Pix':0,'PicPay/Voucher':0,'Dinheiro':0};
    (s.finalizadoras||[]).forEach(function(f){var type=classificarPagamento(f);if(type==='pix')payMap['Pix']+=f.valorPago||0;else if(type==='picpay')payMap['PicPay/Voucher']+=f.valorPago||0;else payMap['Cartão']+=f.valorPago||0;});
    var paymentRows='';
    Object.keys(payMap).forEach(function(k){var v=payMap[k];var icon=k==='Pix'?'store':(k==='PicPay/Voucher'?'local_parking':(k==='Dinheiro'?'account_balance_wallet':'credit_card'));paymentRows+='<div class="modal-payment-row"><i class="material-icons">'+icon+'</i> <span class="label"><b>'+k+':</b></span><span class="value'+(v===0?' zero':'')+'">'+formatarMoeda(v)+'</span></div>';});
    var productRows='';
    (s.produtos||[]).filter(function(p){return !p.cancelado}).forEach(function(p){productRows+='<tr><td class="name" title="'+(p.descricaoComercial||'')+'">'+(p.descricaoReduzida||p.descricaoComercial||'--')+'</td><td class="valor">'+formatarMoeda(p.valorUnitario)+'</td><td>'+p.quantidade+'</td><td class="valor">'+formatarMoeda(p.valorTotal)+'</td></tr>';});
    var userName='Totem '+(nomeLoja(s)||'');if(s.pdvId) userName+=' '+s.pdvCodigo;
    document.getElementById('modal-body').innerHTML = '<div class="modal-sale-header"><div class="modal-icon-circle"><i class="material-icons" style="font-size:28px;color:#9e9e9e">person</i></div><div><div class="modal-sale-date">'+formatarData(s.dataEfetivacao)+'</div><div class="modal-sale-meta">'+userName+' &middot; Loja: '+(nomeLoja(s)||'--')+' &middot; #'+s.cupom+'</div><div class="modal-sale-meta" style="margin-top:4px">'+badgeStatus(s.cancelado, s.nfceSituacaoNome)+'</div></div></div><div class="modal-total-section"><div class="modal-total-label">Total</div><div class="modal-total-value">'+formatarMoeda(s.valorLiquido)+'</div></div><div class="modal-payments"><h4>Forma de Pagamento</h4>'+paymentRows+'</div><div class="modal-products"><h4>Produtos</h4><table class="modal-products-table"><thead><tr><th>Produto</th><th>Valor Unit.</th><th>Qtd</th><th>Total</th></tr></thead><tbody>'+productRows+'</tbody></table></div>';
    document.getElementById('modal-overlay').classList.add('visible');
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('visible'); }

function populateStoreFilter() {
    var stores = [], seen = {};
    allSales.forEach(function(s) { var loja = nomeLoja(s); if(loja && !seen[loja]){seen[loja]=true; stores.push(loja);} });
    stores.sort();
    var select = document.getElementById('loja-filter');
    var current = select.value;
    select.innerHTML = '<option value="">Todas as lojas</option>';
    stores.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=s;select.appendChild(o);});
    if(current && stores.indexOf(current)!==-1) select.value=current;
}

function getDateRange() {
    var period = document.getElementById('period-filter').value;
    var now = new Date();
    if(period==='day') return {inicio: dataLocal(now), fim: dataLocal(now)};
    if(period==='week'){var wa=new Date(now);wa.setDate(wa.getDate()-7);return {inicio: dataLocal(wa), fim: dataLocal(now)};}
    if(period==='mon') return {inicio: now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01', fim: dataLocal(now)};
    if(period==='custom') return {inicio: document.getElementById('dataInicio').value, fim: document.getElementById('dataFim').value};
    return {inicio: '2025-01-01', fim: dataLocal(now)};
}

async function loadDashboard() {
    var btn = document.querySelector('.btn-filter');
    if(btn) btn.disabled = true;
    var range = getDateRange();
    document.getElementById('dataInicio').value = range.inicio;
    document.getElementById('dataFim').value = range.fim;
    await fetchSales(range.inicio, range.fim);
    populateStoreFilter();
    applyFilters();
    if(btn) btn.disabled = false;
}

function changePageSize(size) {
    PAGE_SIZE = parseInt(size);
    currentPage = 1;
    renderCupons();
}

function exportXLSX() {
    var vendas = filteredSales;
    if (vendas.length === 0) { alert('Nenhum dado para exportar.'); return; }
    var vendasRows = [];
    vendas.forEach(function(s) {
        var produtos = (s.produtos||[]).filter(function(p){return !p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial}).join(', ');
        var prodsCancel = (s.produtos||[]).filter(function(p){return p.cancelado}).map(function(p){return p.descricaoReduzida||p.descricaoComercial}).join(', ');
        var detalhes = produtos;
        if (prodsCancel) detalhes += (detalhes ? ' | ' : '') + '[CANC] ' + prodsCancel;
        vendasRows.push({
            'Data': formatarData(s.dataEfetivacao),
            'Cupom': '#' + s.cupom,
            'Loja': nomeLoja(s) || '',
            'Valor': Number(s.valorLiquido || 0),
            'Cancelado': s.cancelado ? 'Sim' : 'Não',
            'Produtos': detalhes
        });
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(vendasRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    XLSX.writeFile(wb, 'vendas_' + dataLocal() + '.xlsx');
}

var logPortaData = [];
var logPortaAtivo = false;
var logPortaTimer = null;

function toggleLogPorta() {
    logPortaAtivo = !logPortaAtivo;
    var btn = document.getElementById('btn-logporta');
    if (logPortaAtivo) {
        btn.innerHTML = '<i class="material-icons" style="font-size:14px;">visibility_off</i> Entradas ON';
        btn.style.background = '#38a169';
        carregarLogPorta();
        logPortaTimer = setInterval(carregarLogPorta, 30000);
    } else {
        btn.innerHTML = '<i class="material-icons" style="font-size:14px;">visibility</i> Entradas';
        btn.style.background = '';
        if (logPortaTimer) clearInterval(logPortaTimer);
        logPortaData = [];
        renderCupons();
    }
}

function carregarLogPorta() {
    var range = getDateRange();
    var url = '/ocorrencias?inicio=' + range.inicio.split('-').reverse().join('/') + '&fim=' + range.fim.split('-').reverse().join('/');
    fetch(url).then(function(r){return r.json()}).then(function(d){
        if (d.ok) {
            logPortaData = d.ocorrencias.filter(function(o){ return o.codigo === '41' || o.codigo === '42'; });
            renderCupons();
        }
    }).catch(function(){});
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('period-filter').addEventListener('change', function() {
        document.getElementById('custom-dates').style.display = this.value === 'custom' ? 'flex' : 'none';
    });
    document.getElementById('loja-filter').addEventListener('change', applyFilters);
    document.getElementById('cupom-search').addEventListener('input', applyFilters);
    document.getElementById('status-filter').addEventListener('change', applyFilters);
    document.addEventListener('keydown', function(e) { if(e.key==='Escape') closeModal(); });
    loadDashboard();
});