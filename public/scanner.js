var currentMode = 'usb';
var scannerInstance = null;
var cameraStarted = false;
var lastScannedCode = '';
var lastScanTime = 0;
var SCAN_DEBOUNCE = 1500;

// =============================================
// Histórico (salvo no localStorage)
// =============================================

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('barcode_history') || '[]');
    } catch (e) {
        return [];
    }
}

function saveToHistory(item) {
    var history = getHistory();
    // Remove duplicado do mesmo código
    history = history.filter(function(h) { return h.codigo !== item.codigo; });
    history.unshift(item);
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem('barcode_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    var history = getHistory();
    var list = document.getElementById('history-list');
    var btnClear = document.getElementById('btn-clear-history');

    if (history.length === 0) {
        list.innerHTML = '<p class="history-empty">Nenhum código escaneado ainda</p>';
        btnClear.style.display = 'none';
        return;
    }

    btnClear.style.display = 'inline-flex';

    var html = '';
    history.forEach(function(item) {
        var name = item.nome || 'Produto não encontrado';
        var price = item.preco != null
            ? 'R$ ' + Number(item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '---';
        var date = item.data ? new Date(item.data).toLocaleString('pt-BR') : '';
        html += '<div class="history-item" onclick="reScan(\'' + item.codigo + '\')">';
        html += '<div class="history-item-left">';
        html += '<i class="material-icons">qr_code</i>';
        html += '<span class="history-cod">' + item.codigo + '</span>';
        html += '<span style="font-size:11px;color:#9e9e9e;">' + date + '</span>';
        html += '</div>';
        html += '<div class="history-item-right">';
        html += '<span class="history-name" title="' + name + '">' + name + '</span>';
        html += '<span class="history-price">' + price + '</span>';
        html += '</div>';
        html += '</div>';
    });
    list.innerHTML = html;
}

function clearHistory() {
    if (confirm('Limpar todo o histórico de leituras?')) {
        localStorage.removeItem('barcode_history');
        renderHistory();
    }
}

function reScan(codigo) {
    document.getElementById('usb-barcode-input').value = codigo;
    lookupProduct(codigo);
    switchMode('usb');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================
// CONSULTA DE PRODUTO (API REAL DO E4)
// =============================================

function lookupProduct(codigo) {
    codigo = codigo.trim();
    if (!codigo) return;

    var now = Date.now();
    if (codigo === lastScannedCode && now - lastScanTime < SCAN_DEBOUNCE) return;
    lastScannedCode = codigo;
    lastScanTime = now;

    var resultEl = document.getElementById('result-' + currentMode);
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div class="result-loading"><div class="spinner"></div><span style="font-size:13px;color:var(--text-secondary);">Consultando código <b>' + codigo + '</b>...</span></div>';
    resultEl.scrollIntoView({ behavior: 'smooth' });

    // Primeiro tenta API do E4
    fetch('/api/produtos/produto?ean=' + encodeURIComponent(codigo))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.descricaoComercial) {
                showProductResult(resultEl, codigo, data.descricaoComercial || data.descricaoReduzida, data.precoVenda || null);
                saveAndBeep(codigo, data.descricaoComercial || data.descricaoReduzida, data.precoVenda || null);
            } else {
                // Tenta buscar no Google/OpenFoodFacts
                buscarGoogle(codigo, resultEl);
            }
        })
        .catch(function() {
            buscarGoogle(codigo, resultEl);
        });
}

function buscarGoogle(codigo, resultEl) {
    resultEl.innerHTML = '<div class="result-loading"><div class="spinner"></div><span style="font-size:13px;color:var(--text-secondary);">Buscando no Google: <b>' + codigo + '</b>...</span></div>';

    // Tenta Open Food Facts (gratuito, sem autenticação)
    fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(codigo) + '.json')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.product && data.product.product_name) {
                var nome = data.product.product_name;
                showProductResult(resultEl, codigo, nome, null);
                saveAndBeep(codigo, nome, null);
            } else {
                // Fallback: abre busca no Google em nova aba
                var googleUrl = 'https://www.google.com/search?q=codigo+barras+' + encodeURIComponent(codigo);
                resultEl.innerHTML = '<div class="result-error">' +
                    '<i class="material-icons">search</i>' +
                    '<div>' +
                        '<h4>Produto não encontrado no sistema</h4>' +
                        '<p>Código <b>' + codigo + '</b></p>' +
                        '<a href="' + googleUrl + '" target="_blank" class="btn-google-search">' +
                            '<i class="material-icons" style="font-size:16px;">open_in_new</i> Buscar no Google' +
                        '</a>' +
                    '</div>' +
                '</div>';
                saveToHistory({ codigo: codigo, nome: 'Não encontrado', preco: null, data: new Date().toISOString() });
                beep(200, 0.15, 'square');
            }
        })
        .catch(function() {
            var googleUrl = 'https://www.google.com/search?q=codigo+barras+' + encodeURIComponent(codigo);
            resultEl.innerHTML = '<div class="result-error">' +
                '<i class="material-icons">error_outline</i>' +
                '<div>' +
                    '<h4>Produto não encontrado</h4>' +
                    '<p>Código <b>' + codigo + '</b></p>' +
                    '<a href="' + googleUrl + '" target="_blank" class="btn-google-search">' +
                        '<i class="material-icons" style="font-size:16px;">open_in_new</i> Buscar no Google' +
                    '</a>' +
                '</div>' +
            '</div>';
            saveToHistory({ codigo: codigo, nome: 'Não encontrado', preco: null, data: new Date().toISOString() });
            beep(200, 0.15, 'square');
        });
}

function showProductResult(el, codigo, nome, preco) {
    var priceHtml = '';
    if (preco != null) {
        priceHtml = '<div class="result-price-tag">' +
            '<div class="result-price">R$ ' + Number(preco).toLocaleString('pt-BR', {minimumFractionDigits:2}) + '</div>' +
            '<div class="result-below">preço de venda</div>' +
        '</div>';
    }
    el.innerHTML = '<div class="result-success">' +
        '<div class="result-left">' +
            '<div class="result-icon"><i class="material-icons">check_circle</i></div>' +
            '<div>' +
                '<div class="result-name">' + nome + '</div>' +
                '<div class="result-cod">' + codigo + '</div>' +
            '</div>' +
        '</div>' +
        priceHtml +
    '</div>';
}

function saveAndBeep(codigo, nome, preco) {
    saveToHistory({ codigo: codigo, nome: nome, preco: preco != null ? Number(preco) : null, data: new Date().toISOString() });
    beep(800, 0.08, 'sine');
}

// =============================================
// Beep / Som de confirmação
// =============================================

function beep(freq, duration, type) {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch (e) {
        // audio não suportado, ignora
    }
}

// =============================================
// MODO 1: Scanner USB (captura de teclado)
// =============================================

function initUSBScanner() {
    var input = document.getElementById('usb-barcode-input');

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var codigo = input.value.trim();
            if (codigo) {
                lookupProduct(codigo);
                input.value = '';
            }
        }
    });

    // Foca automaticamente no input
    input.focus();
}

// =============================================
// MODO 2: Câmera (html5-qrcode)
// =============================================

function startCamera() {
    var placeholder = document.getElementById('camera-placeholder');
    var viewport = document.getElementById('camera-viewport');
    var controls = document.getElementById('camera-controls');
    var readerEl = document.getElementById('reader');

    if (typeof Html5Qrcode === 'undefined') {
        alert('Biblioteca html5-qrcode não carregada. Verifique sua conexão com a internet.');
        return;
    }

    placeholder.style.display = 'none';
    viewport.style.display = 'block';
    controls.style.display = 'flex';
    readerEl.innerHTML = '';

    scannerInstance = new Html5Qrcode('reader');

    var config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.3,
        formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODABAR
        ]
    };

    scannerInstance.start(
        { facingMode: 'environment' },
        config,
        function onScanSuccess(decodedText, decodedResult) {
            if (decodedText) {
                // Som de beep
                beep(800, 0.08, 'sine');
                lookupProduct(decodedText);
            }
        },
        function onScanFailure(error) {
            // Ignora falhas de frame
        }
    ).then(function() {
        cameraStarted = true;
        // Popula lista de câmeras
        Html5Qrcode.getCameras().then(function(cameras) {
            var select = document.getElementById('camera-select');
            select.innerHTML = '';
            cameras.forEach(function(cam, i) {
                var option = document.createElement('option');
                option.value = cam.id;
                option.textContent = cam.label || 'Câmera ' + (i + 1);
                select.appendChild(option);
            });
        }).catch(function() {});
    }).catch(function(err) {
        alert('Erro ao acessar a câmera: ' + (err.message || err));
        stopCamera();
    });
}

function stopCamera() {
    if (scannerInstance) {
        scannerInstance.stop().then(function() {
            scannerInstance.clear();
        }).catch(function() {}).finally(function() {
            scannerInstance = null;
            cameraStarted = false;
            document.getElementById('camera-placeholder').style.display = 'block';
            document.getElementById('camera-viewport').style.display = 'none';
            document.getElementById('camera-controls').style.display = 'none';
        });
    }
}

function switchCamera() {
    if (!scannerInstance || !cameraStarted) return;
    var select = document.getElementById('camera-select');
    var newId = select.value;
    scannerInstance.stop().then(function() {
        return scannerInstance.start(
            { deviceId: { exact: newId } },
            {
                fps: 10,
                qrbox: { width: 250, height: 150 },
                aspectRatio: 1.3,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.ITF,
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.CODABAR
                ]
            },
            function onScanSuccess(decodedText) {
                if (decodedText) {
                    beep(800, 0.08, 'sine');
                    lookupProduct(decodedText);
                }
            },
            function onScanFailure() {}
        );
    }).catch(function(err) {
        console.error('Erro ao trocar câmera:', err);
    });
}

// =============================================
// Troca de modo
// =============================================

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.mode === mode); });
    document.querySelectorAll('.mode-panel').forEach(function(p) { p.classList.remove('active'); });

    if (mode === 'usb') {
        document.getElementById('panel-usb').classList.add('active');
        document.getElementById('usb-barcode-input').focus();
        // Para a câmera se estiver ativa
        if (cameraStarted) stopCamera();
    } else if (mode === 'camera') {
        document.getElementById('panel-camera').classList.add('active');
        // Se o input USB tiver algum valor, limpa
        document.getElementById('usb-barcode-input').value = '';
    }
}

// =============================================
// Busca manual
// =============================================

function manualSearch() {
    var input = document.getElementById('usb-barcode-input');
    var codigo = input.value.trim();
    if (!codigo) {
        input.focus();
        return;
    }
    lookupProduct(codigo);
    input.value = '';
}

// =============================================
// Inicialização
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    initUSBScanner();
    renderHistory();

    // Atalho global para trocar modo
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'm') {
            e.preventDefault();
            switchMode(currentMode === 'usb' ? 'camera' : 'usb');
        }
    });
});
