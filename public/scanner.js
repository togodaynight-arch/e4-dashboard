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
// CONSULTA DE PRODUTO (SIMULADA)
// =============================================

var DEMO_PRODUCTS = {
    '7891000247749': { nome: 'Biscoito Recheado Oreo 90g', preco: 5.99 },
    '7891910000197': { nome: 'Desodorante Rexona Men 150ml', preco: 14.90 },
    '7891155000114': { nome: 'Sabonete Lux Buquê 85g', preco: 2.49 },
    '7894900010015': { nome: 'Refrigerante Coca-Cola Lata 350ml', preco: 4.79 },
    '7891149410008': { nome: 'Feijão Carioca Camil 1kg', preco: 8.99 },
    '7891000053508': { nome: 'Arroz Tio João 5kg', preco: 22.90 },
    '7891040020087': { nome: 'Macarrão Espaguete Barilla 500g', preco: 7.49 },
    '7893000222032': { nome: 'Cerveja Heineken Long Neck 330ml', preco: 6.99 },
    '7891055307016': { nome: 'Leite Integral Italac 1L', preco: 5.49 },
    '7891096000851': { nome: 'Café Pilão Torrado e Moído 500g', preco: 18.90 },
    '7891200025202': { nome: 'Shampoo Seda Ceramidas 325ml', preco: 12.99 },
    '7896019600204': { nome: 'Açúcar Cristal União 1kg', preco: 4.49 },
    '7891520650027': { nome: 'Óleo de Soja Liza 900ml', preco: 7.29 },
    '7891152000254': { nome: 'Creme Dental Colgate Tripla Ação 90g', preco: 3.99 },
    '7898089500091': { nome: 'Guardanapo de Papel Snob 50un', preco: 2.99 }
};

function lookupProduct(codigo) {
    codigo = codigo.trim();
    if (!codigo) return;

    // Debounce: evita leitura dupla de scanners
    var now = Date.now();
    if (codigo === lastScannedCode && now - lastScanTime < SCAN_DEBOUNCE) return;
    lastScannedCode = codigo;
    lastScanTime = now;

    // Mostra loading no painel do modo ativo
    var resultEl = document.getElementById('result-' + currentMode);
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div class="result-loading"><div class="spinner"></div><span style="font-size:13px;color:var(--text-secondary);">Consultando código <b>' + codigo + '</b>...</span></div>';
    resultEl.scrollIntoView({ behavior: 'smooth' });

    // Simula delay de API (200-600ms)
    setTimeout(function() {
        var produto = DEMO_PRODUCTS[codigo];

        if (produto) {
            resultEl.innerHTML = '<div class="result-success">' +
                '<div class="result-left">' +
                    '<div class="result-icon"><i class="material-icons">check_circle</i></div>' +
                    '<div>' +
                        '<div class="result-name">' + produto.nome + '</div>' +
                        '<div class="result-cod">' + codigo + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="result-price-tag">' +
                    '<div class="result-price">R$ ' + produto.preco.toLocaleString('pt-BR', {minimumFractionDigits:2}) + '</div>' +
                    '<div class="result-below">preço de venda</div>' +
                '</div>' +
            '</div>';

            // Salva no histórico
            saveToHistory({
                codigo: codigo,
                nome: produto.nome,
                preco: produto.preco,
                data: new Date().toISOString()
            });

            // Som de confirmação (beep) via AudioContext
            beep(800, 0.08, 'sine');
        } else {
            resultEl.innerHTML = '<div class="result-error">' +
                '<i class="material-icons">error_outline</i>' +
                '<div>' +
                    '<h4>Código não encontrado</h4>' +
                    '<p>O código <b>' + codigo + '</b> não está cadastrado na base de produtos.</p>' +
                '</div>' +
            '</div>';

            // Som de erro
            beep(200, 0.15, 'square');
            beep(180, 0.15, 'square');

            // Salva no histórico sem preço
            saveToHistory({
                codigo: codigo,
                nome: 'Não encontrado',
                preco: null,
                data: new Date().toISOString()
            });
        }
    }, 300 + Math.random() * 300);
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
