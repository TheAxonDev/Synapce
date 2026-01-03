// === Глобальное состояние ===
var peer = null;
var myId = null;
var myStream = null; // Локальный аудиопоток
var connections = {}; // Активные P2P соединения
var mediaCalls = {}; // Активные звонки
var peerAvatars = {}; // Аватарки: { peerId: base64Data }

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
    // Динамический контейнер для списка участников звонка
    callParticipants: null 
};

// === Инициализация ===
function init() {
    loadSettings();
    createCallListUI(); // Создаем UI для списка звонящих
    setupEventListeners();
    // Генерация случайного ID
    if (els.myIdInput) {
        els.myIdInput.value = 'user-' + Math.floor(Math.random() * 10000);
    }
}

// Создание зоны для отображения участников звонка
function createCallListUI() {
    var sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) {
        var div = document.createElement('div');
        div.className = 'section';
        div.innerHTML = '<h3>В звонке:</h3><div id="active-callers-list" class="hint-text">Никого</div>';
        // Вставляем перед логом
        var logSection = document.querySelector('.status-log');
        if (logSection) {
            sidebarContent.insertBefore(div, logSection);
        } else {
            sidebarContent.appendChild(div);
        }
        els.callParticipants = document.getElementById('active-callers-list');
    }
}

function updateCallParticipantsList() {
    if (!els.callParticipants) return;
    
    var peersInCall = Object.keys(mediaCalls);
    
    if (peersInCall.length === 0) {
        els.callParticipants.innerHTML = 'Никого (только вы)';
        els.callParticipants.style.color = 'var(--text-muted)';
    } else {
        els.callParticipants.innerHTML = '';
        peersInCall.forEach(function(pid) {
            var p = document.createElement('div');
            p.style.display = 'flex';
            p.style.alignItems = 'center';
            p.style.gap = '5px';
            p.style.marginTop = '5px';
            p.style.color = '#3ba55c'; // Зеленый цвет
            
            // Иконка
            var icon = document.createElement('span');
            icon.className = 'material-icons';
            icon.style.fontSize = '14px';
icon.innerText = 'volume_up';
            
            var name = document.createElement('span');
            name.innerText = pid;
            
            p.appendChild(icon);
            p.appendChild(name);
            els.callParticipants.appendChild(p);
        });
    }
}

function loadSettings() {
    var savedSettings = localStorage.getItem('meshMessengerSettings');
    if (savedSettings) {
        try {
            var parsed = JSON.parse(savedSettings);
            appSettings = Object.assign({}, appSettings, parsed);
        } catch (e) {
            console.error("Error loading settings", e);
        }
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
    if (els.msgInput) {
        els.msgInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });
    }

    if (els.displayMyId) {
        els.displayMyId.addEventListener('click', function() {
            if (myId) {
                navigator.clipboard.writeText(myId).then(function() {
                    log("ID скопирован", "success");
                });
            }
        });
    }

    if (els.btnStartCall) els.btnStartCall.addEventListener('click', startMeshCall);
    if (els.btnEndCall) els.btnEndCall.addEventListener('click', endMeshCall);

    if (els.btnAttachImg) els.btnAttachImg.addEventListener('click', function() {
        els.imgUploadInput.click();
    });
    if (els.imgUploadInput) els.imgUploadInput.addEventListener('change', handleImageUpload);

    if (els.btnOpenSettings) els.btnOpenSettings.addEventListener('click', function() {
        els.settingsModal.classList.remove('hidden');
    });
    if (els.btnCloseSettings) els.btnCloseSettings.addEventListener('click', function() {
        els.settingsModal.classList.add('hidden');
    });
    if (els.themeSelect) els.themeSelect.addEventListener('change', function(e) {
        applyTheme(e.target.value);
    });
    if (els.avatarInput) els.avatarInput.addEventListener('change', handleAvatarChange);
}

function applyTheme(themeName) {
    document.body.className = ''; // Сброс классов
    document.body.classList.add(themeName);
    appSettings.theme = themeName;
    saveSettings();
}

// === Логика Аватарок ===
function handleAvatarChange(e) {
    var file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    var reader = new FileReader();
    reader.onload = function(event) {
        var base64Res = event.target.result;
        if (base64Res.length > 200000) {
            alert("Файл слишком большой.");
            return;
        }
        appSettings.avatar = base64Res;
        els.myAvatarDisplay.src = base64Res;
        els.settingsAvatarPreview.src = base64Res;
        saveSettings();
        log("Аватар обновлен", "success");
        broadcastMyAvatar();
    };
    reader.readAsDataURL(file);
}

function broadcastMyAvatar() {
    Object.values(connections).forEach(function(conn) {
        if (conn && conn.open) {
            conn.send({
                type: 'avatar-update',
                from: myId,
                data: appSettings.avatar
            });
        }
    });
}

// === P2P Logic ===
function registerAndInitPeer() {
    var inputId = els.myIdInput.value.trim();
    if (!inputId) {
        log("Введите ID!", "error");
        return;
    }

    els.btnLogin.disabled = true;
    els.btnLogin.innerText = 'Подключение...';
peer = new Peer(inputId, {
        debug: 1,
        config: {
            'iceServers': [
                { url: 'stun:stun1.l.google.com:19302' },
                { url: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', function(id) {
        myId = id;
        log('Ваш ID: ' + myId, "success");
        els.displayMyId.innerText = myId;
        els.loginScreen.classList.add('hidden');
        els.chatScreen.classList.remove('hidden');
    });

    peer.on('error', function(err) {
        console.error(err);
        log("Ошибка P2P: " + err.type, "error");
        els.btnLogin.disabled = false;
        els.btnLogin.innerText = 'Создать узел';
    });

    peer.on('connection', function(conn) {
        log('Входящее от: ' + conn.peer);
        setupConnectionHandlers(conn);
    });

    peer.on('call', function(call) {
        log('Звонок от ' + call.peer);
        if (myStream) {
            call.answer(myStream);
            setupMediaCallHandlers(call);
        } else {
            // Если мы не в звонке, можно либо отклонить, либо принять (здесь авто-отклонение для простоты)
            // Но лучше уведомить пользователя.
            log('Пропущен звонок от ' + call.peer + ' (начните звонок, чтобы ответить)', 'error');
            call.close();
        }
    });
}

function connectToPeer() {
    var remoteId = els.remoteIdInput.value.trim();
    if (!remoteId || remoteId === myId) return;

    log('Подключение к: ' + remoteId);
    var conn = peer.connect(remoteId);
    setupConnectionHandlers(conn);
}

function setupConnectionHandlers(conn) {
    conn.on('open', function() {
        if (connections[conn.peer]) return;
        connections[conn.peer] = conn;
        updateConnectionCount();
        log('Подключено к ' + conn.peer, "success");
        updateChatUIState(true);
        conn.send({
            type: 'avatar-update',
            from: myId,
            data: appSettings.avatar
        });
    });

    conn.on('data', function(data) {
        handleIncomingData(data);
    });

    conn.on('close', function() {
        handlePeerDisconnect(conn.peer);
    });

    conn.on('error', function(err) {
        handlePeerDisconnect(conn.peer);
    });
}

function handlePeerDisconnect(peerId) {
    if (connections[peerId]) {
        log('Отключен: ' + peerId, "error");
        delete connections[peerId];
    }
    updateConnectionCount();
    if (Object.keys(connections).length === 0) {
        updateChatUIState(false);
        if (myStream) endMeshCall();
    }
}

function handleIncomingData(data) {
    if (data.type === 'chat') {
        addMessageToUI(data.from, data.text, 'in');
    } else if (data.type === 'image') {
        addImageToUI(data.from, data.data, 'in');
    } else if (data.type === 'avatar-update') {
        peerAvatars[data.from] = data.data;
    }
}

function sendMessage() {
    var text = els.msgInput.value.trim();
    if (!text) return;

    broadcastData({
        type: 'chat',
        from: myId,
        text: text
    });
    addMessageToUI('Вы', text, 'out');
    els.msgInput.value = '';
}

function handleImageUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    els.imgUploadInput.value = '';

    var reader = new FileReader();
    reader.onload = function(event) {
        var base64Data = event.target.result;
        // Лимит 500KB
        if (base64Data.length > 500000) return;
        
        broadcastData({
            type: 'image',
            from: myId,
            data: base64Data
        });
        addImageToUI('Вы', base64Data, 'out');
    };
    reader.readAsDataURL(file);
}

function broadcastData(dataObj) {
    Object.values(connections).forEach(function(conn) {
        if (conn && conn.open) conn.send(dataObj);
    });
}
// === Звонки ===
function startMeshCall() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function(stream) {
            myStream = stream;
            log("Микрофон включен", "success");
            els.btnStartCall.classList.add('hidden');
            els.btnEndCall.classList.remove('hidden');

            Object.keys(connections).forEach(function(peerId) {
                var call = peer.call(peerId, myStream);
                setupMediaCallHandlers(call);
            });
            updateCallParticipantsList();
        })
        .catch(function(err) {
            log("Ошибка микрофона: " + err, "error");
        });
}

function endMeshCall() {
    if (myStream) {
        myStream.getTracks().forEach(function(t) { t.stop(); });
        myStream = null;
    }
    Object.values(mediaCalls).forEach(function(call) { call.close(); });
    mediaCalls = {}; // Очистка списка звонков
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
        var audio = document.createElement('audio');
        audio.id = 'audio-' + pid;
        audio.autoplay = true;
        audio.srcObject = remoteStream;
        els.remoteAudioContainer.appendChild(audio);
        audio.play().catch(function(e){});
    });

    call.on('close', function() {
        var el = document.getElementById('audio-' + pid);
        if (el) el.remove();
        delete mediaCalls[pid];
        updateCallParticipantsList();
    });
}

// === UI Helpers ===
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
    
    if (type === 'in') {
        row.appendChild(img);
        row.appendChild(bubble);
    } else {
        row.appendChild(bubble);
        row.appendChild(img);
    }
    return { row: row, content: bubble };
}

function addMessageToUI(author, text, type) {
    var obj = createMsgRow(author, type);
    var d = document.createElement('div');
    d.innerText = text;
    obj.content.appendChild(d);
    appendToChat(obj.row);
}

// Эта функция была сломана, восстановлена:
function addImageToUI(author, base64, type) {
    var obj = createMsgRow(author, type);
    var img = document.createElement('img');
    img.src = base64;
    img.className = 'msg-image';
    img.onclick = function() {
        var w = window.open("");
        if (w) {
             var i = w.document.createElement('img');
             i.src = base64;
             i.style.maxWidth = '100%';
             w.document.body.appendChild(i);
        }
    };
    obj.content.appendChild(img);
    appendToChat(obj.row);
}

function appendToChat(el) {
    if (els.msgContainer) {
        els.msgContainer.appendChild(el);
        els.msgContainer.scrollTop = els.msgContainer.scrollHeight;
    }
}
function log(text, type) {
    var div = document.createElement('div');
    div.className = 'log-item ' + (type || 'info');
    div.innerText = text;
    if (els.statusLog) {
        els.statusLog.appendChild(div);
        els.statusLog.scrollTop = els.statusLog.scrollHeight;
    }
}

// Запуск
document.addEventListener('DOMContentLoaded', init);