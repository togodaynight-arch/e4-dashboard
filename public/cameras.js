var allCameras = [];
var currentStream = null;
var EZVIZ_WEB = 'https://isa.ezvizlife.com';

function dataLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function horaLocal(d) {
    d = d || new Date();
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
}

function updateStatus(text, online) {
    document.getElementById('status-text').textContent = text;
    var dot = document.getElementById('status-dot');
    dot.className = 'status-dot ' + (online ? 'online' : 'offline');
}

async function loadCameras() {
    updateStatus('Carregando...', false);
    document.getElementById('cameras-grid').innerHTML = '<div class="empty-state"><div class="spinner"></div>Carregando câmeras...</div>';

    try {
        var res = await fetch('/api/ezviz/cameras');
        var data = await res.json();

        if (!data.ok) {
            updateStatus('Erro: ' + (data.error || 'desconhecido'), false);
            document.getElementById('cameras-grid').innerHTML = '<div class="empty-state error">Erro: ' + (data.error || 'Falha ao carregar cameras') + '</div>';
            return;
        }

        allCameras = data.cameras || [];
        updateStatus(allCameras.length + ' câmera(s) conectada(s)', true);
        renderCameras();
        populateSerialFilter();
    } catch (e) {
        updateStatus('Erro de conexão', false);
        document.getElementById('cameras-grid').innerHTML = '<div class="empty-state error">Erro de conexão: ' + e.message + '</div>';
    }
}

function renderCameras() {
    var grid = document.getElementById('cameras-grid');

    if (allCameras.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhuma câmera encontrada.<br><a href="' + EZVIZ_WEB + '" target="_blank" style="color:#32bcad;font-weight:600;">Abrir portal eZviz</a></div>';
        return;
    }

    var html = '';
    allCameras.forEach(function(c) {
        var signalIcon = c.signal >= 80 ? 'signal_wifi_4_bar' : c.signal >= 50 ? 'signal_wifi_3_bar' : 'signal_wifi_1_bar';

        html += '<div class="camera-card" id="cam-' + c.serial + '">' +
            '<div class="camera-thumb" onclick="toggleLive(\'' + c.serial + '\')">' +
                '<div class="camera-thumb-placeholder"><i class="material-icons">videocam</i></div>' +
                '<div class="camera-play-overlay"><i class="material-icons">play_circle_filled</i></div>' +
            '</div>' +
            '<div class="camera-info">' +
                '<div class="camera-name">' + (c.name || 'Sem nome') + '</div>' +
                '<div class="camera-model">' + (c.model || '') + '</div>' +
                '<div class="camera-serial">IP: ' + (c.ip || '--') + ' | RTSP:' + (c.streamPort || 554) + '</div>' +
                '<div class="camera-actions">' +
                    '<button class="btn-action btn-green btn-sm" onclick="toggleLive(\'' + c.serial + '\')"><i class="material-icons" style="font-size:14px;">videocam</i> Ao vivo</button>' +
                    '<button class="btn-action btn-black btn-sm" onclick="quickSearch(\'' + c.serial + '\')"><i class="material-icons" style="font-size:14px;">search</i> Buscar</button>' +
                '</div>' +
                '<div class="camera-meta"><span><i class="material-icons" style="color:#38a169;font-size:14px;">' + signalIcon + '</i> ' + (c.ip || c.wanIp || '--') + '</span></div>' +
            '</div>' +
        '</div>';
    });

    grid.innerHTML = html;
}

function populateSerialFilter() {
    var select = document.getElementById('search-serial');
    var currentVal = select.value;
    select.innerHTML = '<option value="">Todas as câmeras</option>';
    allCameras.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.serial;
        opt.textContent = c.name + ' (' + c.serial + ')';
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}

function getCamBySerial(serial) {
    for (var i = 0; i < allCameras.length; i++) {
        if (allCameras[i].serial === serial) return allCameras[i];
    }
    return null;
}

function quickSearch(serial) {
    document.getElementById('search-serial').value = serial;
    document.getElementById('search-data').value = dataLocal();
    var now = new Date();
    var oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    document.getElementById('search-inicio').value = horaLocal(oneHourAgo).substring(0, 5) + ':00';
    document.getElementById('search-fim').value = horaLocal(now).substring(0, 5) + ':00';
    document.querySelector('.search-section').scrollIntoView({ behavior: 'smooth' });
}

function setTimeRange(minutos) {
    var now = new Date();
    var ago = new Date(now.getTime() - minutos * 60 * 1000);
    document.getElementById('search-data').value = dataLocal();
    document.getElementById('search-inicio').value = horaLocal(ago).substring(0, 5) + ':00';
    document.getElementById('search-fim').value = horaLocal(now).substring(0, 5) + ':00';
}

async function toggleLive(serial) {
    var playerSection = document.getElementById('player-section');
    var video = document.getElementById('video-player');
    var liveSerial = document.getElementById('live-serial');

    if (currentStream === serial) {
        stopLive();
        return;
    }

    stopLive();

    var cam = getCamBySerial(serial);
    if (!cam) { alert('Camera nao encontrada'); return; }

    document.getElementById('live-title').textContent = 'Conectando ' + (cam.name || serial) + '...';
    document.getElementById('live-code').value = '';
    playerSection.style.display = 'block';
    liveSerial.value = serial;
    playerSection.scrollIntoView({ behavior: 'smooth' });

    try {
        var codeEl = document.getElementById('live-code');
        var code = codeEl.value.trim();

        var url = '/api/ezviz/ao-vivo?serial=' + encodeURIComponent(serial);
        if (code) url += '&code=' + encodeURIComponent(code);

        var res = await fetch(url);
        var data = await res.json();

        if (!data.ok || !data.hlsUrl) {
            alert('Erro ao conectar: ' + (data.error || 'Camera fora da rede local?'));
            document.getElementById('live-title').textContent = 'Erro de conexão';
            stopLive();
            return;
        }

        currentStream = serial;
        document.getElementById('live-title').textContent = 'Ao vivo: ' + (cam.name || serial) + ' (' + data.ip + ')';

        video.src = data.hlsUrl;
        video.style.display = 'block';
        video.play().catch(function() {});

        updateStatus('Ao vivo: ' + (cam.name || serial), true);
    } catch (e) {
        alert('Erro: ' + e.message);
        stopLive();
    }
}

function stopLive() {
    var video = document.getElementById('video-player');
    video.pause();
    video.src = '';
    video.style.display = 'none';

    if (currentStream) {
        fetch('/api/ezviz/parar-stream?serial=' + encodeURIComponent(currentStream)).catch(function(){});
        currentStream = null;
    }

    document.getElementById('live-title').textContent = 'Player';
    document.getElementById('player-section').style.display = 'none';
}

async function buscarGravacoes() {
    var serial = document.getElementById('search-serial').value;
    var date = document.getElementById('search-data').value;
    var inicio = document.getElementById('search-inicio').value;
    var fim = document.getElementById('search-fim').value;

    if (!date || !inicio || !fim) { alert('Preencha data e horários.'); return; }
    if (!serial && allCameras.length > 0) serial = allCameras[0].serial;
    if (!serial) { alert('Nenhuma câmera disponível.'); return; }

    document.getElementById('recordings-section').style.display = 'block';
    document.getElementById('recordings-list').innerHTML = '<div class="empty-state"><div class="spinner"></div>Buscando gravações...</div>';

    try {
        var url = '/api/ezviz/gravacoes?serial=' + encodeURIComponent(serial) +
            '&data=' + encodeURIComponent(date) +
            '&inicio=' + encodeURIComponent(inicio) +
            '&fim=' + encodeURIComponent(fim);
        var res = await fetch(url);
        var data = await res.json();

        if (!data.ok) {
            document.getElementById('recordings-list').innerHTML = '<div class="empty-state error">Erro: ' + (data.error || '') + '</div>';
            document.getElementById('rec-count').textContent = '';
            return;
        }

        var recordings = data.recordings || [];
        document.getElementById('rec-count').textContent = recordings.length + ' gravação(ões)';

        if (recordings.length === 0) {
            document.getElementById('recordings-list').innerHTML = '<div class="empty-state">Nenhuma gravação na nuvem neste período.<br><small><a href="' + EZVIZ_WEB + '" target="_blank" style="color:#32bcad;font-weight:600;">Abrir portal eZviz</a> para ver gravações do cartão SD</small></div>';
            return;
        }

        var html = '';
        recordings.forEach(function(r) {
            var start = r.startTime || '';
            var stop = r.stopTime || '';
            var startShort = start.indexOf('T') !== -1 ? start.split('T')[1].substring(0, 8) : start;
            var stopShort = stop.indexOf('T') !== -1 ? stop.split('T')[1].substring(0, 8) : stop;

            html += '<div class="recording-card">' +
                '<div class="rec-thumb"><i class="material-icons">videocam</i></div>' +
                '<div class="rec-info">' +
                    '<div class="rec-time">' + startShort + ' - ' + stopShort + '</div>' +
                    '<div class="rec-meta">' + (r.duration || 0) + 's | ' + (r.type || 'gravação') + '</div>' +
                '</div>' +
                '<div class="rec-actions">' +
                    '<a href="' + EZVIZ_WEB + '" target="_blank" class="btn-action btn-green btn-sm" style="text-decoration:none;"><i class="material-icons" style="font-size:14px;">play_arrow</i> Portal</a>' +
                '</div>' +
            '</div>';
        });
        document.getElementById('recordings-list').innerHTML = html;
    } catch (e) {
        document.getElementById('recordings-list').innerHTML = '<div class="empty-state error">Erro: ' + e.message + '</div>';
    }
}

async function abrirApp() {
    try {
        var res = await fetch('/api/ezviz/abrir-app');
        var data = await res.json();
        if (data.ok) {
            updateStatus('EZVIZ HD aberto', true);
        } else {
            alert('Erro ao abrir: ' + data.error);
        }
    } catch(e) {
        alert('Erro: ' + e.message);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var now = new Date();
    var oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    var params = new URLSearchParams(window.location.search);
    var paramData = params.get('data');
    var paramHora = params.get('hora');

    if (paramData && paramHora) {
        var parts = paramData.split('-');
        if (parts.length === 3) paramData = parts[2] + '-' + parts[1] + '-' + parts[0];
        var hp = paramHora.split(':');
        var h = parseInt(hp[0]) || 0, m = parseInt(hp[1]) || 0;
        document.getElementById('search-data').value = paramData;
        document.getElementById('search-inicio').value = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':00';
        document.getElementById('search-fim').value = String(h).padStart(2,'0') + ':' + String(Math.min(m + 5, 59)).padStart(2,'0') + ':00';
    } else {
        document.getElementById('search-data').value = dataLocal();
        document.getElementById('search-inicio').value = horaLocal(oneHourAgo).substring(0, 5) + ':00';
        document.getElementById('search-fim').value = horaLocal(now).substring(0, 5) + ':00';
    }

    loadCameras();

    if (paramData && paramHora) {
        setTimeout(function() { buscarGravacoes(); }, 2000);
    }
});
