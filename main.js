// === Глобальное состояние ===
var peer = null;
var myId = null;
var myStream = null; // Локальный аудиопоток
var connections = {}; // Активные P2P соединения
var mediaCalls = {}; // Активные звонки
var peerAvatars = {}; // Аватарки

// == Аудио система (Web Audio API) ==
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var peerAudioNodes = {}; // Хранилище аудио-узлов

// Настройки по умолчанию
var appSettings = {
    theme: 'theme-minimal',
    avatar: 'default-avatar.png'
};

// === Кэширование элементов DOM ===
var els = {
    loginScreen: document.getElementById('login-screen'),
    chatScreen: document.getElementById('chat-screen'),
    myIdInput: document.getElementById('my-id-input'),
    btnLogin: document.getElementById('btn-login'),
    displayMyId: document.getElementById('display-my-id'),
    myAvatarDisplay: document.getElementById('my-avatar-display'),
    connectionCount: document.getElementById('connection-count'),
    statusLog: document.getElementById('status-log'),
    remoteIdInput: document.getElementById('remote-id-input'),
    btnConnect: document.getElementById('btn-connect'),
    btnStartCall: document.getElementById('btn-start-call'),
    btnEndCall: document.getElementById('btn-end-call'),
    remoteAudioContainer: document.getElementById('remote-audio-container'),
    msgContainer: document.getElementById('messages-container'),
    msgInput: document.getElementById('msg-input'),
    btnSend: document.getElementById('btn-send'),
    btnAttachImg: document.getElementById('btn-attach-img'),
    imgUploadInput: document.getElementById('img-upload-input'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    settingsModal: document.getElementById('settings-modal'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    themeSelect: document.getElementById('theme-select'),
    avatarInput: document.getElementById('avatar-input'),
    settingsAvatarPreview: document.getElementById('settings-avatar-preview'),
    callParticipants: null,
    // Мобильные кнопки
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    btnCloseSidebar: document.getElementById('btn-close-sidebar'),
    sidebar: document.getElementById('sidebar')
};

// === Инициализация ===
function init() {
    loadSettings();
    createCallListUI(); 
    setupEventListeners();
    if (els.myIdInput) {
        els.myIdInput.value = 'user-' + Math.floor(Math.random() * 10000);
    }
}

// Создание зоны для списка участников
function createCallListUI() {
    if (document.getElementById('active-callers-list')) {
        els.callParticipants = document.getElementById('active-callers-list');
        return;
    }
    var sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) {
        var div = document.createElement('div');
        div.className = 'section';
        div.innerHTML = '<h3>В звонке:</h3><div id="active-callers-list" class="hint-text">Никого</div>';
        var logSection = document.querySelector('.status-log');
        if (logSection) {
            sidebarContent.insertBefore(div, logSection);
        } else {
            sidebarContent.appendChild(div);
        }
        els.callParticipants = document.getElementById('active-callers-list');
    }
}

// Обновление списка (с ползунками)
function updateCallParticipantsList() {
    if (!els.callParticipants) return;
    var peersInCall = Object.keys(mediaCalls);
    
    if (peersInCall.length === 0) {
        els.callParticipants.innerHTML = 'Никого (только вы)';
        els.callParticipants.style.color = 'var(--text-muted)';
    } else {
        els.callParticipants.innerHTML = '';
        peersInCall.forEach(function(pid) {
            var card = document.createElement('div');
            card.className = 'caller-card';

            var header = document.createElement('div');
            header.className = 'caller-header';
            header.innerHTML = '<span class="material-icons caller-icon">graphic_eq</span> <span>' + pid + '</span>';
var controls = document.createElement('div');
            controls.className = 'volume-control';

            var slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'volume-slider';
            slider.min = 0;
            slider.max = 200;
            slider.value = 100;
            
            if (peerAudioNodes[pid] && peerAudioNodes[pid].gain) {
                slider.value = peerAudioNodes[pid].gain.gain.value * 100;
            }

            var label = document.createElement('span');
            label.className = 'volume-label';
            label.innerText = slider.value + '%';

            slider.addEventListener('input', function(e) {
                var val = e.target.value;
                label.innerText = val + '%';
                setPeerVolume(pid, val / 100); 
            });

            controls.appendChild(slider);
            controls.appendChild(label);
            
            card.appendChild(header);
            card.appendChild(controls);
            els.callParticipants.appendChild(card);
        });
    }
}

function setPeerVolume(peerId, value) {
    if (peerAudioNodes[peerId] && peerAudioNodes[peerId].gain) {
        peerAudioNodes[peerId].gain.gain.value = value;
    }
}

function loadSettings() {
    var saved = localStorage.getItem('meshMessengerSettings');
    if (saved) {
        try {
            appSettings = Object.assign({}, appSettings, JSON.parse(saved));
        } catch (e) {}
    }
    applyTheme(appSettings.theme);
    if (els.themeSelect) els.themeSelect.value = appSettings.theme;
    if (els.myAvatarDisplay) els.myAvatarDisplay.src = appSettings.avatar;
    if (els.settingsAvatarPreview) els.settingsAvatarPreview.src = appSettings.avatar;
}

function saveSettings() {
    localStorage.setItem('meshMessengerSettings', JSON.stringify(appSettings));
}

function setupEventListeners() {
    if (els.btnLogin) els.btnLogin.addEventListener('click', registerAndInitPeer);
    if (els.btnConnect) els.btnConnect.addEventListener('click', connectToPeer);
    if (els.btnSend) els.btnSend.addEventListener('click', sendMessage);
    if (els.msgInput) els.msgInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') sendMessage(); });

    if (els.displayMyId) els.displayMyId.addEventListener('click', function() {
        if (myId) navigator.clipboard.writeText(myId).then(function() { log("ID скопирован", "success"); });
    });

    if (els.btnStartCall) els.btnStartCall.addEventListener('click', startMeshCall);
    if (els.btnEndCall) els.btnEndCall.addEventListener('click', endMeshCall);

    if (els.btnAttachImg) els.btnAttachImg.addEventListener('click', function() { els.imgUploadInput.click(); });
    if (els.imgUploadInput) els.imgUploadInput.addEventListener('change', handleImageUpload);

    if (els.btnOpenSettings) els.btnOpenSettings.addEventListener('click', function() { els.settingsModal.classList.remove('hidden'); });
    if (els.btnCloseSettings) els.btnCloseSettings.addEventListener('click', function() { els.settingsModal.classList.add('hidden'); });
    if (els.themeSelect) els.themeSelect.addEventListener('change', function(e) { applyTheme(e.target.value); });
    if (els.avatarInput) els.avatarInput.addEventListener('change', handleAvatarChange);

    // === МОБИЛЬНОЕ МЕНЮ (ПРОСТОЕ ПЕРЕКЛЮЧЕНИЕ) ===
    if (els.btnToggleSidebar) {
        els.btnToggleSidebar.onclick = function() {
            if (els.sidebar) els.sidebar.classList.add('active');
        };
    }
    if (els.btnCloseSidebar) {
        els.btnCloseSidebar.onclick = function() {
            if (els.sidebar) els.sidebar.classList.remove('active');
        };
    }
}

function applyTheme(name) {
    document.body.className = '';
    document.body.classList.add(name);
    appSettings.theme = name;
    saveSettings();
}
function handleAvatarChange(e) {
    var file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
        var res = evt.target.result;
        if (res.length > 200000) { alert("Файл слишком большой."); return; }
        appSettings.avatar = res;
        els.myAvatarDisplay.src = res;
        els.settingsAvatarPreview.src = res;
        saveSettings();
        broadcastMyAvatar();
    };
    reader.readAsDataURL(file);
}

function broadcastMyAvatar() {
    Object.values(connections).forEach(function(c) {
        if (c.open) c.send({type: 'avatar-update', from: myId, data: appSettings.avatar});
    });
}

// === P2P Logic (MAXIMUM AGGRESSION) ===

// 1. Супер-список серверов для пробива NAT
var aggressiveIceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.ideasip.com' },
    { urls: 'stun:stun.schlund.de' },
    { urls: 'stun:stun.voiparound.com' },
    { urls: 'stun:stun.voipbuster.com' },
    { urls: 'stun:stun.voipstunt.com' },
    { urls: 'stun:global.stun.twilio.com:3478' }
];

function registerAndInitPeer() {
    var id = els.myIdInput.value.trim();
    if (!id) return log("Введите ID!", "error");

    els.btnLogin.disabled = true;
    els.btnLogin.innerText = 'Инициализация...';

    // 2. Уничтожаем старый пир, если он был (чистим хвосты)
    if (peer) {
        peer.destroy();
        peer = null;
    }

    peer = new Peer(id, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 1, // Меньше мусора в консоли, только важное
        config: {
            iceServers: aggressiveIceServers,
            sdpSemantics: 'unified-plan',
            iceTransportPolicy: 'all', // Разрешаем всё (и TCP и UDP)
            iceCandidatePoolSize: 10   // Заранее готовим кандидатов для скорости
        },
        pingInterval: 5000
    });

    peer.on('open', function(pid) {
        myId = pid;
        log('Успех! ID: ' + myId, "success");
        els.displayMyId.innerText = myId;
        els.loginScreen.classList.add('hidden');
        els.chatScreen.classList.remove('hidden');
    });

    peer.on('error', function(err) {
        console.error(err);
        var msg = "Ошибка: " + err.type;
        if (err.type === 'unavailable-id') msg = "ID уже занят.";
        if (err.type === 'peer-unavailable') msg = "Пользователь не найден (или NAT блокирует).";
        if (err.type === 'network') msg = "Проблема с сетью/VPN.";
        if (err.type === 'disconnected') msg = "Отключено от сервера.";
        
        log(msg, "error");
        
        // Авто-реконнект к серверу PeerJS при разрыве
        if (err.type === 'network' || err.type === 'disconnected') {
            log("Пробую переподключиться к серверу...", "info");
            setTimeout(function() { if(peer) peer.reconnect(); }, 3000);
        } else {
            els.btnLogin.disabled = false;
            els.btnLogin.innerText = 'Попробовать снова';
        }
    });

    peer.on('connection', function(c) {
        log('⚡ Входящий сигнал от: ' + c.peer);
        setupConnectionHandlers(c);
    });

    peer.on('call', function(call) {
        log('📞 Звонок от ' + call.peer);
        if (myStream) {
            call.answer(myStream);
            setupMediaCallHandlers(call);
        } else {
            log('Пропущен звонок от ' + call.peer + ' (сначала нажмите Start)', 'info');
        }
    });
}

function connectToPeer() {
    var rid = els.remoteIdInput.value.trim();
    if (!rid || rid === myId) return;

    log('⏳ Попытка пробиться к: ' + rid + '...');
    
    // 3. Агрессивные настройки соединения
    var conn = peer.connect(rid, {
        reliable: true,         // Гарантированная доставка
        serialization: 'json',  // Иногда стабильнее, чем binary
        metadata: { info: 'connect-request' }
    });

    // 4. Трюк с тайм-аутом (Если через 8 сек не подключилось - пробуем снова)
    var connectionTimer = setTimeout(function() {
        if (!conn.open) {
            log("⚠️ Долгое подключение... Попробуйте еще раз или смените сеть (Wi-Fi <-> 4G).", "error");
            conn.close();
        }
    }, 8000);

    setupConnectionHandlers(conn, connectionTimer);
}
function setupConnectionHandlers(conn, timerId) {
    conn.on('open', function() {
        if (timerId) clearTimeout(timerId); // Отменяем таймер паники
        
        if (connections[conn.peer]) return; // Уже подключены
        
        connections[conn.peer] = conn;
        updateConnectionCount();
        log('✅ КАНАЛ ОТКРЫТ: ' + conn.peer, "success");
        updateChatUIState(true);
        
        // Сразу шлем свои данные
        conn.send({type: 'avatar-update', from: myId, data: appSettings.avatar});
        
        // Пинг-понг для поддержания жизни канала
        keepAlive(conn);
    });

    conn.on('data', handleIncomingData);
    
    conn.on('close', function() { 
        handlePeerDisconnect(conn.peer); 
    });
    
    conn.on('error', function(err) {
        console.error("Conn Error:", err);
        // Не пишем ошибку в лог пользователю, чтобы не пугать, просто пробуем закрыть
        handlePeerDisconnect(conn.peer);
    });
}

// 5. Функция поддержания жизни (Keep-Alive)
// Некоторые роутеры закрывают "молчащие" каналы. Мы будем шуметь.
function keepAlive(conn) {
    var pingInterval = setInterval(function() {
        if (conn.open) {
            conn.send({type: 'ping'});
        } else {
            clearInterval(pingInterval);
        }
    }, 10000); // Каждые 10 секунд
}

function handlePeerDisconnect(pid) {
    if (connections[pid]) {
        log('❌ Связь потеряна: ' + pid, "error");
        delete connections[pid];
    }
    if (mediaCalls[pid]) {
        mediaCalls[pid].close();
        cleanupPeerAudio(pid);
        delete mediaCalls[pid];
    }
    updateConnectionCount();
    updateCallParticipantsList();
    if (Object.keys(connections).length === 0) {
        updateChatUIState(false);
        if (myStream) endMeshCall();
    }
}

function connectToPeer() {
    var rid = els.remoteIdInput.value.trim();
    if (!rid || rid === myId) return;
    log('Подключение к: ' + rid);
    setupConnectionHandlers(peer.connect(rid));
}

function setupConnectionHandlers(conn) {
    conn.on('open', function() {
        if (connections[conn.peer]) return;
        connections[conn.peer] = conn;
        updateConnectionCount();
        log('Подключено: ' + conn.peer, "success");
        updateChatUIState(true);
        conn.send({type: 'avatar-update', from: myId, data: appSettings.avatar});
    });
    conn.on('data', handleIncomingData);
    conn.on('close', function() { handlePeerDisconnect(conn.peer); });
    conn.on('error', function() { handlePeerDisconnect(conn.peer); });
}

function handlePeerDisconnect(pid) {
    if (connections[pid]) {
        log('Отключен: ' + pid, "error");
        delete connections[pid];
    }
    if (mediaCalls[pid]) {
        mediaCalls[pid].close();
        cleanupPeerAudio(pid);
        delete mediaCalls[pid];
    }
    updateConnectionCount();
    updateCallParticipantsList();
    if (Object.keys(connections).length === 0) {
        updateChatUIState(false);
        if (myStream) endMeshCall();
    }
}

// ЗВУК УВЕДОМЛЕНИЙ
function playNotification() {
    var audio = document.getElementById('notify-sound');
    if (audio) {
        audio.currentTime = 0; 
        audio.play().catch(function(e){});
    }
}
function handleIncomingData(data) {
    if (data.type === 'ping') return; // Игнорируем технические пакеты
    var needNotify = false;
    
    if (data.type === 'chat') {
        addMessageToUI(data.from, data.text, 'in');
        needNotify = true;
    } else if (data.type === 'image') {
        addImageToUI(data.from, data.data, 'in');
        needNotify = true;
    } else if (data.type === 'avatar-update') {
        peerAvatars[data.from] = data.data;
    }

    if (needNotify && document.hidden) {
        playNotification();
        var oldTitle = document.title;
        document.title = "📩 Новое сообщение!";
        var onFocus = function() {
            document.title = oldTitle;
            window.removeEventListener('focus', onFocus);
        };
        window.addEventListener('focus', onFocus);
    }
}

function sendMessage() {
    var txt = els.msgInput.value.trim();
    if (!txt) return;
    broadcastData({type: 'chat', from: myId, text: txt});
    addMessageToUI('Вы', txt, 'out');
    els.msgInput.value = '';
}

function handleImageUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    els.imgUploadInput.value = '';
    var reader = new FileReader();
    reader.onload = function(evt) {
        var d = evt.target.result;
        if (d.length > 500000) return; 
        broadcastData({type: 'image', from: myId, data: d});
        addImageToUI('Вы', d, 'out');
    };
    reader.readAsDataURL(file);
}

function broadcastData(d) {
    Object.values(connections).forEach(function(c) { if (c.open) c.send(d); });
}

// === ЗВОНКИ ===
function startMeshCall() {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function(stream) {
            myStream = stream;
            log("Микрофон активен", "success");
            els.btnStartCall.classList.add('hidden');
            els.btnEndCall.classList.remove('hidden');

            Object.keys(connections).forEach(function(pid) {
                var call = peer.call(pid, myStream);
                setupMediaCallHandlers(call);
            });
            updateCallParticipantsList();
        })
        .catch(function(e) { log("Ошибка микрофона: " + e, "error"); });
}

function endMeshCall() {
    if (myStream) {
        myStream.getTracks().forEach(function(t) { t.stop(); });
        myStream = null;
    }
    Object.values(mediaCalls).forEach(function(c) { c.close(); });
    Object.keys(peerAudioNodes).forEach(cleanupPeerAudio);
    
    mediaCalls = {};
    els.remoteAudioContainer.innerHTML = '';
    els.btnStartCall.classList.remove('hidden');
    els.btnEndCall.classList.add('hidden');
    updateCallParticipantsList();
}

function setupMediaCallHandlers(call) {
    var pid = call.peer;
    mediaCalls[pid] = call;
    updateCallParticipantsList();

    call.on('stream', function(remoteStream) {
        var audioEl = document.createElement('audio');
        audioEl.srcObject = remoteStream;
        audioEl.autoplay = true;
        audioEl.muted = true; 
        els.remoteAudioContainer.appendChild(audioEl);
        
        var source = audioCtx.createMediaStreamSource(remoteStream);
        var gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.0; 
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        peerAudioNodes[pid] = {
            source: source,
            gain: gainNode,
            audioEl: audioEl
        };
        
        updateCallParticipantsList();
    });

    call.on('close', function() {
        cleanupPeerAudio(pid);
        delete mediaCalls[pid];
        updateCallParticipantsList();
    });
}

function cleanupPeerAudio(pid) {
    if (peerAudioNodes[pid]) {
        var nodes = peerAudioNodes[pid];
        if (nodes.source) nodes.source.disconnect();
        if (nodes.gain) nodes.gain.disconnect();
        if (nodes.audioEl) nodes.audioEl.remove();
        delete peerAudioNodes[pid];
    }
}
// === UI ===
function updateChatUIState(isActive) {
    var count = Object.keys(connections).length;
    els.msgInput.disabled = count === 0;
    els.btnSend.disabled = count === 0;
    els.btnAttachImg.disabled = count === 0;
    els.btnStartCall.disabled = count === 0;
    if (isActive && count > 0) els.msgInput.focus();
}

function updateConnectionCount() {
    var count = Object.keys(connections).length;
    els.connectionCount.innerText = count + ' peers';
    updateChatUIState(count > 0);
}

function getAvatarFor(id) {
    if (id === 'Вы') return appSettings.avatar;
    return peerAvatars[id] || 'default-avatar.png';
}

function createMsgRow(author, type) {
    var row = document.createElement('div');
    row.className = 'msg-row ' + type;
    var img = document.createElement('img');
    img.src = getAvatarFor(author);
    img.className = 'msg-avatar';
    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    var meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerText = author;
    bubble.appendChild(meta);
    if (type === 'in') { row.appendChild(img); row.appendChild(bubble); }
    else { row.appendChild(bubble); row.appendChild(img); }
    return {row: row, content: bubble};
}

function addMessageToUI(author, text, type) {
    var o = createMsgRow(author, type);
    var d = document.createElement('div');
    d.innerText = text;
    o.content.appendChild(d);
    appendToChat(o.row);
}

function addImageToUI(author, base64, type) {
    var o = createMsgRow(author, type);
    var img = document.createElement('img');
    img.src = base64;
    img.className = 'msg-image';
    img.onclick = function() {
        var w = window.open("");
        if(w) { var i=w.document.createElement('img'); i.src=base64; i.style.maxWidth='100%'; w.document.body.appendChild(i); }
    };
    o.content.appendChild(img);
    appendToChat(o.row);
}

function appendToChat(el) {
    if (els.msgContainer) { els.msgContainer.appendChild(el); els.msgContainer.scrollTop = els.msgContainer.scrollHeight; }
}

function log(text, type) {
    var div = document.createElement('div');
    div.className = 'log-item ' + (type || 'info');
    div.innerText = text;
    if (els.statusLog) { els.statusLog.appendChild(div); els.statusLog.scrollTop = els.statusLog.scrollHeight; }
}

document.addEventListener('DOMContentLoaded', init);