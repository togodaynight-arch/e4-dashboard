var allCams = [];

function dataLocal(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

async function loadStatus() {
    try {
        var r = await fetch('/api/status');
        var d = await r.json();
        if (!d.ok) return;

        allCams = d.cameras;
        var active = d.cameras.filter(function(c) { return c.recording; }).length;
        var total = d.cameras.length;
        var gb = (d.totalSizeMB / 1024).toFixed(1);

        document.getElementById('rec-badge').textContent = active + '/' + total + ' gravando';
        document.getElementById('rec-badge').className = active > 0 ? 'badge badge-on' : 'badge badge-off';

        var pct = Math.min(100, (gb / 50) * 100);
        document.getElementById('disk-badge').innerHTML = '<div class="disk-bar"><div class="disk-fill" style="width:' + pct + '%;background:' + (pct > 80 ? '#ef4444' : '#22c55e') + ';"></div></div>' + gb + ' GB / 50 GB';

        renderCameras(d.cameras);
        populateSerials();
    } catch(e) {
        console.error(e);
    }
}

function renderCameras(cams) {
    var html = '';
    cams.forEach(function(c) {
        html += '<div class="cam-card' + (c.recording ? ' recording' : '') + '">' +
            '<div class="cam-name">' + c.name + '</div>' +
            '<div class="cam-ip">IP: ' + c.ip + '</div>' +
            '<div class="cam-status">' +
                (c.recording
                    ? '<span class="badge badge-on"><i class="material-icons" style="font-size:10px;">fiber_manual_record</i> Gravando</span>'
                    : '<span class="badge badge-off"><i class="material-icons" style="font-size:10px;">stop_circle</i> Parado</span>') +
            '</div>' +
            '<input type="text" id="code-' + c.serial + '" placeholder="Codigo verificacao" maxlength="6" style="text-transform:uppercase;">' +
            '<button onclick="iniciarCamera(\'' + c.serial + '\')" style="background:#166534;color:#86efac;">Iniciar</button>' +
            '</div>';
    });
    document.getElementById('cam-grid').innerHTML = html;
}

function populateSerials() {
    var sel = document.getElementById('search-serial');
    sel.innerHTML = '<option value="">Escolha camera...</option>';
    allCams.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.serial;
        opt.textContent = c.name + ' (' + c.serial + ')';
        sel.appendChild(opt);
    });
}

async function iniciarCamera(serial) {
    var code = document.getElementById('code-' + serial).value.trim();
    if (!code) { alert('Digite o codigo de verificacao da camera'); return; }

    try {
        var r = await fetch('/api/iniciar-camera?serial=' + serial + '&code=' + encodeURIComponent(code));
        var d = await r.json();
        alert(d.message || (d.ok ? 'Iniciada!' : d.error));
        loadStatus();
    } catch(e) { alert('Erro: ' + e.message); }
}

async function iniciarTodas() {
    var code = document.getElementById('global-code').value.trim();
    if (!code) { alert('Digite o codigo de verificacao'); return; }

    try {
        var r = await fetch('/api/iniciar?code=' + encodeURIComponent(code));
        var d = await r.json();
        alert(d.message || (d.ok ? 'Iniciadas!' : d.error));
        loadStatus();
    } catch(e) { alert('Erro: ' + e.message); }
}

async function pararTodas() {
    try {
        var r = await fetch('/api/parar');
        var d = await r.json();
        if (d.ok) { loadStatus(); }
    } catch(e) {}
}

async function loadDatas() {
    var serial = document.getElementById('search-serial').value;
    if (!serial) { document.getElementById('search-data').innerHTML = '<option value="">Escolha data...</option>'; return; }

    try {
        var r = await fetch('/api/datas?serial=' + serial);
        var d = await r.json();
        var sel = document.getElementById('search-data');
        sel.innerHTML = '<option value="">Escolha data...</option>';
        (d.datas || []).forEach(function(dt) {
            var opt = document.createElement('option');
            opt.value = dt;
            opt.textContent = dt.split('-').reverse().join('/');
            sel.appendChild(opt);
        });
    } catch(e) {}
}

async function loadGravacoes() {
    var serial = document.getElementById('search-serial').value;
    var data = document.getElementById('search-data').value;
    var el = document.getElementById('rec-list');

    if (!serial || !data) { el.innerHTML = '<div class="empty">Selecione camera e data</div>'; return; }

    el.innerHTML = '<div class="empty"><span class="spinner"></span> Buscando...</div>';

    try {
        var r = await fetch('/api/gravacoes?serial=' + serial + '&data=' + data);
        var d = await r.json();

        if (!d.ok || d.gravacoes.length === 0) {
            el.innerHTML = '<div class="empty">Nenhuma gravacao em ' + data.split('-').reverse().join('/') + '</div>';
            return;
        }

        var html = '';
        d.gravacoes.forEach(function(g) {
            html += '<div class="rec-card">' +
                '<div class="rec-icon"><i class="material-icons">play_circle</i></div>' +
                '<div class="rec-info">' +
                    '<div class="rec-time">' + g.inicio + ' - ' + g.fim + '</div>' +
                    '<div class="rec-meta">' + g.sizeMB + ' MB</div>' +
                '</div>' +
                '<div class="rec-actions">' +
                    '<button class="btn btn-blue btn-sm" onclick="playVideo(\'' + g.path + '\',\'' + g.inicio + ' - ' + g.fim + '\')"><i class="material-icons" style="font-size:14px;">play_arrow</i></button>' +
                    '<a href="' + g.path + '" class="btn btn-green btn-sm" download style="text-decoration:none;"><i class="material-icons" style="font-size:14px;">download</i></a>' +
                '</div>' +
            '</div>';
        });
        el.innerHTML = html;
    } catch(e) {
        el.innerHTML = '<div class="empty" style="color:#ef4444;">Erro: ' + e.message + '</div>';
    }
}

function playVideo(path, title) {
    var player = document.getElementById('player');
    var box = document.getElementById('player-box');
    player.src = path;
    box.style.display = 'block';
    document.getElementById('player-title').textContent = title;
    document.getElementById('download-link').href = path;
    player.play().catch(function(){});
    box.scrollIntoView({behavior:'smooth'});
}

function closePlayer() {
    var player = document.getElementById('player');
    player.pause();
    player.src = '';
    document.getElementById('player-box').style.display = 'none';
}

async function limparAntigas() {
    if (!confirm('Apagar gravacoes com mais de 7 dias?')) return;
    try {
        var r = await fetch('/api/limpar?dias=7');
        var d = await r.json();
        alert(d.limpos + ' pastas de gravacoes antigas removidas');
        loadStatus();
    } catch(e) { alert('Erro: ' + e.message); }
}

document.addEventListener('DOMContentLoaded', function() {
    loadStatus();
    setInterval(loadStatus, 15000);
});
