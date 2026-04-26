/**
 * 正点闹钟 - 手机端网页APP
 * 支持：时钟、闹钟、倒计时、秒表、世界时钟、记忆游戏
 */

(function() {
    'use strict';

    // ======== 数据存储 ========
    const Storage = {
        get(key, def) {
            try {
                const val = localStorage.getItem('zd_' + key);
                return val ? JSON.parse(val) : def;
            } catch(e) { return def; }
        },
        set(key, val) {
            localStorage.setItem('zd_' + key, JSON.stringify(val));
        }
    };

    // ======== 全局状态 ========
    const State = {
        alarms: Storage.get('alarms', []),
        timers: Storage.get('timers', []),
        cities: Storage.get('cities', [
            { name: '北京', zone: 'Asia/Shanghai', offset: 0 },
            { name: '东京', zone: 'Asia/Tokyo', offset: 1 },
            { name: '纽约', zone: 'America/New_York', offset: -13 },
            { name: '伦敦', zone: 'Europe/London', offset: -8 },
            { name: '巴黎', zone: 'Europe/Paris', offset: -7 },
            { name: '悉尼', zone: 'Australia/Sydney', offset: 2 }
        ]),
        settings: Storage.get('settings', {
            fadeIn: true,
            vibrate: true,
            tts: true,
            format24h: true,
            memoryGame: false,
            snoozeMinutes: 5,
            theme: 'dark'
        }),
        stopwatch: { running: false, startTime: 0, elapsed: 0, laps: [] },
        activeRing: null,
        audioCtx: null,
        currentVolume: 1,
        ttsUtterance: null
    };

    // ======== 工具函数 ========
    const $ = id => document.getElementById(id);
    const pad = n => String(n).padStart(2, '0');
    const playBeep = (freq = 800, duration = 200, type = 'sine') => {
        try {
            if (!State.audioCtx) State.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = State.audioCtx.createOscillator();
            const gain = State.audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.value = State.currentVolume * 0.3;
            osc.connect(gain);
            gain.connect(State.audioCtx.destination);
            osc.start();
            osc.stop(State.audioCtx.currentTime + duration / 1000);
        } catch(e) {}
    };

    const vibrate = pattern => {
        if (State.settings.vibrate && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    };

    const speak = text => {
        if (!State.settings.tts || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1;
        u.pitch = 1;
        window.speechSynthesis.speak(u);
    };

    const formatTime = (h, m, use24h) => {
        if (use24h) return `${pad(h)}:${pad(m)}`;
        const ap = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${pad(h12)}:${pad(m)} ${ap}`;
    };

    const getDayName = d => ['周日','周一','周二','周三','周四','周五','周六'][d];

    const getRepeatText = days => {
        if (!days || days.length === 0) return '仅一次';
        if (days.length === 7) return '每天';
        if (days.length === 5 && days.every(d => d >= 1 && d <= 5)) return '工作日';
        if (days.length === 2 && days.includes(0) && days.includes(6)) return '周末';
        return '周' + days.sort().map(d => '日一二三四五六'[d]).join('');
    };

    // ======== 主题管理 ========
    const applyTheme = theme => {
        document.documentElement.setAttribute('data-theme', theme);
        State.settings.theme = theme;
        Storage.set('settings', State.settings);
    };

    // ======== 导航切换 ========
    const switchTab = tabName => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const tab = $('tab-' + tabName);
        const nav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
        if (tab) tab.classList.add('active');
        if (nav) nav.classList.add('active');
    };

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // ======== 大时钟 ========
    const updateClock = () => {
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        $('clock-time').textContent = formatTime(h, m, State.settings.format24h);
        $('clock-seconds').textContent = pad(s);
        const month = now.getMonth() + 1, date = now.getDate();
        $('clock-date').textContent = `${month}月${date}日 ${getDayName(now.getDay())}`;
        updateNextAlarm(now);
        checkAlarms(now);
        updateBattery();
    };

    const updateBattery = async () => {
        if (!navigator.getBattery) return;
        try {
            const bat = await navigator.getBattery();
            $('battery').textContent = Math.round(bat.level * 100) + '%';
        } catch(e) {}
    };

    // ======== 闹钟管理 ========
    const renderAlarms = () => {
        const list = $('alarms-list');
        if (State.alarms.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔔</div>
                    <p>还没有闹钟</p>
                    <p style="font-size:13px;margin-top:4px;">点击右上角 + 添加</p>
                </div>`;
            $('alarm-badge').classList.add('hidden');
            return;
        }
        State.alarms.sort((a, b) => {
            const ta = a.hour * 60 + a.minute;
            const tb = b.hour * 60 + b.minute;
            return ta - tb;
        });
        list.innerHTML = State.alarms.map((alarm, idx) => `
            <div class="alarm-item" data-index="${idx}">
                <div class="alarm-info">
                    <div class="alarm-time">${formatTime(alarm.hour, alarm.minute, State.settings.format24h)}</div>
                    <div class="alarm-details">
                        <span class="alarm-label">${alarm.label || '闹钟'}</span>
                        <span class="alarm-repeat">${getRepeatText(alarm.repeat)}</span>
                    </div>
                </div>
                <div class="alarm-toggle ${alarm.enabled ? 'on' : ''}" data-index="${idx}"></div>
            </div>
        `).join('');

        const activeCount = State.alarms.filter(a => a.enabled).length;
        $('alarm-badge').textContent = activeCount;
        $('alarm-badge').classList.toggle('hidden', activeCount === 0);

        // 绑定事件
        list.querySelectorAll('.alarm-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.classList.contains('alarm-toggle')) return;
                editAlarm(parseInt(item.dataset.index));
            });
        });
        list.querySelectorAll('.alarm-toggle').forEach(tog => {
            tog.addEventListener('click', () => {
                const idx = parseInt(tog.dataset.index);
                State.alarms[idx].enabled = !State.alarms[idx].enabled;
                Storage.set('alarms', State.alarms);
                renderAlarms();
            });
        });
    };

    let editingAlarmIndex = -1;

    const openAlarmModal = (alarm = null) => {
        editingAlarmIndex = alarm ? State.alarms.indexOf(alarm) : -1;
        $('alarm-modal-title').textContent = alarm ? '编辑闹钟' : '添加闹钟';
        $('alarm-hour').value = pad(alarm ? alarm.hour : 7);
        $('alarm-minute').value = pad(alarm ? alarm.minute : 0);
        $('alarm-label').value = alarm ? (alarm.label || '') : '';
        $('alarm-sound').value = alarm ? (alarm.sound || 'default') : 'default';

        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.classList.toggle('active', alarm && alarm.repeat && alarm.repeat.includes(parseInt(btn.dataset.day)));
        });
        $('alarm-modal').classList.remove('hidden');
    };

    const saveAlarm = () => {
        const hour = parseInt($('alarm-hour').value) || 0;
        const minute = parseInt($('alarm-minute').value) || 0;
        const label = $('alarm-label').value.trim();
        const sound = $('alarm-sound').value;
        const repeat = Array.from(document.querySelectorAll('.day-btn.active')).map(b => parseInt(b.dataset.day));
        const alarm = { hour, minute, label, sound, repeat, enabled: true, id: Date.now() };
        if (editingAlarmIndex >= 0) {
            alarm.enabled = State.alarms[editingAlarmIndex].enabled;
            State.alarms[editingAlarmIndex] = alarm;
        } else {
            State.alarms.push(alarm);
        }
        Storage.set('alarms', State.alarms);
        renderAlarms();
        $('alarm-modal').classList.add('hidden');
    };

    const editAlarm = idx => {
        if (idx >= 0 && idx < State.alarms.length) {
            openAlarmModal(State.alarms[idx]);
        }
    };

    const deleteAlarm = () => {
        if (editingAlarmIndex >= 0) {
            State.alarms.splice(editingAlarmIndex, 1);
            Storage.set('alarms', State.alarms);
            renderAlarms();
            $('alarm-modal').classList.add('hidden');
        }
    };

    $('btn-add-alarm').addEventListener('click', () => openAlarmModal());
    $('btn-close-alarm').addEventListener('click', () => $('alarm-modal').classList.add('hidden'));
    $('btn-save-alarm').addEventListener('click', saveAlarm);

    // 时间选择器按钮
    document.querySelectorAll('.time-up, .time-down').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.field;
            const input = $(field === 'hour' ? 'alarm-hour' : 'alarm-minute');
            let val = parseInt(input.value) || 0;
            const max = field === 'hour' ? 23 : 59;
            if (btn.classList.contains('time-up')) {
                val = (val + 1) > max ? 0 : val + 1;
            } else {
                val = (val - 1) < 0 ? max : val - 1;
            }
            input.value = pad(val);
        });
    });

    // 周几按钮
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    // 重复预设
    document.querySelectorAll('.repeat-presets button').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            const days = { once: [], workday: [1,2,3,4,5], weekend: [0,6], everyday: [0,1,2,3,4,5,6] }[preset] || [];
            document.querySelectorAll('.day-btn').forEach(b => {
                b.classList.toggle('active', days.includes(parseInt(b.dataset.day)));
            });
        });
    });

    // ======== 响铃逻辑 ========
    const checkAlarms = now => {
        if (State.activeRing) return;
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        if (s !== 0) return;
        State.alarms.forEach(alarm => {
            if (!alarm.enabled) return;
            if (alarm.hour !== h || alarm.minute !== m) return;
            if (alarm.repeat && alarm.repeat.length > 0 && !alarm.repeat.includes(now.getDay())) return;
            triggerAlarm(alarm);
        });
    };

    const triggerAlarm = alarm => {
        State.activeRing = alarm;
        $('ring-time').textContent = formatTime(alarm.hour, alarm.minute, State.settings.format24h);
        $('ring-label').textContent = alarm.label || '起床';
        $('btn-snooze').textContent = `贪睡 ${State.settings.snoozeMinutes} 分钟`;
        $('alarm-ring').classList.remove('hidden');
        $('main-page').classList.add('hidden');

        // 渐进音量
        State.currentVolume = 0.1;
        const fadeInterval = setInterval(() => {
            if (!State.activeRing) { clearInterval(fadeInterval); return; }
            if (State.settings.fadeIn && State.currentVolume < 1) {
                State.currentVolume = Math.min(1, State.currentVolume + 0.05);
            }
        }, 1000);

        // 持续响铃
        const ringInterval = setInterval(() => {
            if (!State.activeRing) { clearInterval(ringInterval); return; }
            playBeep(800 + Math.random() * 400, 300);
            vibrate([500, 200, 500]);
        }, 1500);

        // 语音播报
        setTimeout(() => {
            if (State.activeRing) {
                speak(`现在是${alarm.hour}点${alarm.minute}分，${alarm.label || '该起床了'}`);
            }
        }, 2000);

        // 10分钟后自动贪睡
        setTimeout(() => {
            if (State.activeRing) snoozeAlarm();
        }, 600000);
    };

    const dismissAlarm = () => {
        if (!State.activeRing) return;
        if (State.settings.memoryGame) {
            $('alarm-ring').classList.add('hidden');
            startMemoryGame();
            return;
        }
        doDismiss();
    };

    const doDismiss = () => {
        State.activeRing = null;
        State.currentVolume = 1;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        $('alarm-ring').classList.add('hidden');
        $('main-page').classList.remove('hidden');
    };

    const snoozeAlarm = () => {
        if (!State.activeRing) return;
        const alarm = State.activeRing;
        const now = new Date();
        const snoozeMin = parseInt(State.settings.snoozeMinutes) || 5;
        const snoozeTime = new Date(now.getTime() + snoozeMin * 60000);
        alarm.hour = snoozeTime.getHours();
        alarm.minute = snoozeTime.getMinutes();
        alarm._snoozed = true;
        Storage.set('alarms', State.alarms);
        doDismiss();
        renderAlarms();
    };

    $('btn-dismiss').addEventListener('click', dismissAlarm);
    $('btn-snooze').addEventListener('click', snoozeAlarm);

    // ======== 记忆游戏 ========
    const EMOJIS = ['🍎','🍌','🍓','🍒','🍈','🍉','🍍','🍇'];
    let gameCards = [], gameFlipped = [], gameMatches = 0, gameFlips = 0;

    const startMemoryGame = () => {
        $('memory-game').classList.remove('hidden');
        gameMatches = 0; gameFlips = 0; gameFlipped = [];
        $('matches').textContent = '0';
        $('flips').textContent = '0';

        const pairs = [...EMOJIS, ...EMOJIS];
        for (let i = pairs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
        }
        gameCards = pairs;
        renderGameGrid();
    };

    const renderGameGrid = () => {
        $('game-grid').innerHTML = gameCards.map((emoji, i) => `
            <div class="game-card" data-index="${i}"></div>
        `).join('');
        $('game-grid').querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', () => flipCard(card));
        });
    };

    const flipCard = card => {
        const idx = parseInt(card.dataset.index);
        if (card.classList.contains('flipped') || card.classList.contains('matched') || gameFlipped.length >= 2) return;
        card.classList.add('flipped');
        card.textContent = gameCards[idx];
        gameFlipped.push({ idx, card, emoji: gameCards[idx] });
        gameFlips++;
        $('flips').textContent = gameFlips;
        playBeep(600, 100);

        if (gameFlipped.length === 2) {
            const [a, b] = gameFlipped;
            if (a.emoji === b.emoji) {
                setTimeout(() => {
                    a.card.classList.remove('flipped');
                    a.card.classList.add('matched');
                    b.card.classList.remove('flipped');
                    b.card.classList.add('matched');
                    gameMatches++;
                    $('matches').textContent = gameMatches;
                    gameFlipped = [];
                    playBeep(1000, 200);
                    if (gameMatches === 8) {
                        setTimeout(() => {
                            speak('恭喜你完成了游戏！');
                            $('memory-game').classList.add('hidden');
                            doDismiss();
                        }, 500);
                    }
                }, 400);
            } else {
                setTimeout(() => {
                    a.card.classList.remove('flipped');
                    a.card.textContent = '';
                    b.card.classList.remove('flipped');
                    b.card.textContent = '';
                    gameFlipped = [];
                }, 800);
            }
        }
    };

    $('btn-giveup').addEventListener('click', () => {
        $('memory-game').classList.add('hidden');
        doDismiss();
    });

    // ======== 倒计时 ========
    let activeTimerId = null;
    let timerInterval = null;

    const formatDuration = ms => {
        const totalS = Math.floor(ms / 1000);
        const h = Math.floor(totalS / 3600);
        const m = Math.floor((totalS % 3600) / 60);
        const s = totalS % 60;
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    };

    const startTimer = () => {
        const h = parseInt($('timer-h').value) || 0;
        const m = parseInt($('timer-m').value) || 0;
        const s = parseInt($('timer-s').value) || 0;
        const totalMs = (h * 3600 + m * 60 + s) * 1000;
        if (totalMs <= 0) return;

        const timer = {
            id: Date.now(),
            total: totalMs,
            remaining: totalMs,
            label: `${h}时${m}分${s}秒`,
            running: true,
            startTime: Date.now()
        };
        State.timers.push(timer);
        Storage.set('timers', State.timers);
        renderTimers();
        updateTimerDisplay(timer);
        startTimerLoop();
    };

    const startTimerLoop = () => {
        if (timerInterval) return;
        timerInterval = setInterval(() => {
            let anyRunning = false;
            State.timers.forEach(t => {
                if (!t.running) return;
                const elapsed = Date.now() - t.startTime;
                t.remaining = Math.max(0, t.total - elapsed);
                if (t.remaining <= 0) {
                    t.running = false;
                    timerFinished(t);
                } else {
                    anyRunning = true;
                }
            });
            if (!anyRunning) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            renderTimers();
            const mainTimer = State.timers.find(t => t.running);
            if (mainTimer) updateTimerDisplay(mainTimer);
        }, 100);
    };

    const updateTimerDisplay = timer => {
        $('timer-display').textContent = formatDuration(timer.remaining);
    };

    const timerFinished = timer => {
        playBeep(1000, 500);
        vibrate([1000, 300, 1000, 300, 1000]);
        speak(`倒计时结束，${timer.label}的时间到了`);
    };

    const renderTimers = () => {
        const list = $('timers-list');
        const active = State.timers.filter(t => t.remaining > 0);
        $('timers-active').classList.toggle('hidden', active.length === 0);
        if (active.length === 0) {
            list.innerHTML = '';
            $('timer-display').textContent = '00:00:00';
            return;
        }
        list.innerHTML = active.map(t => `
            <div class="timer-item">
                <div>
                    <div class="timer-item-time">${formatDuration(t.remaining)}</div>
                    <div class="timer-item-label">${t.label}</div>
                </div>
                <div class="timer-item-actions">
                    <button class="btn-timer-play" data-id="${t.id}">${t.running ? '⏸️' : '▶️'}</button>
                    <button class="btn-timer-delete" data-id="${t.id}">✕</button>
                </div>
            </div>
        `).join('');
        list.querySelectorAll('.btn-timer-play').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = State.timers.find(x => x.id == btn.dataset.id);
                if (t) {
                    if (t.running) {
                        t.running = false;
                        t.total = t.remaining;
                    } else {
                        t.running = true;
                        t.startTime = Date.now();
                        startTimerLoop();
                    }
                    Storage.set('timers', State.timers);
                    renderTimers();
                }
            });
        });
        list.querySelectorAll('.btn-timer-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                State.timers = State.timers.filter(x => x.id != btn.dataset.id);
                Storage.set('timers', State.timers);
                renderTimers();
            });
        });
    };

    $('btn-timer-start').addEventListener('click', () => {
        startTimer();
        $('timer-inputs').classList.add('hidden');
        $('btn-timer-start').classList.add('hidden');
        $('btn-timer-pause').classList.remove('hidden');
    });

    $('btn-timer-pause').addEventListener('click', () => {
        const running = State.timers.find(t => t.running);
        if (running) {
            running.running = false;
            running.total = running.remaining;
            Storage.set('timers', State.timers);
            renderTimers();
        }
        $('btn-timer-pause').classList.add('hidden');
        $('btn-timer-start').classList.remove('hidden');
        $('btn-timer-start').textContent = '继续';
    });

    $('btn-timer-reset').addEventListener('click', () => {
        State.timers = [];
        Storage.set('timers', State.timers);
        renderTimers();
        $('timer-inputs').classList.remove('hidden');
        $('btn-timer-start').classList.remove('hidden');
        $('btn-timer-start').textContent = '开始';
        $('btn-timer-pause').classList.add('hidden');
        $('timer-display').textContent = '00:00:00';
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    });

    document.querySelectorAll('.timer-presets button').forEach(btn => {
        btn.addEventListener('click', () => {
            const sec = parseInt(btn.dataset.time);
            $('timer-h').value = 0;
            $('timer-m').value = Math.floor(sec / 60);
            $('timer-s').value = sec % 60;
        });
    });

    // ======== 秒表 ========
    let swInterval = null;

    const updateStopwatch = () => {
        const now = Date.now();
        const elapsed = State.stopwatch.elapsed + (now - State.stopwatch.startTime);
        const ms = elapsed % 1000;
        const totalS = Math.floor(elapsed / 1000);
        const h = Math.floor(totalS / 3600);
        const m = Math.floor((totalS % 3600) / 60);
        const s = totalS % 60;
        $('stopwatch-display').textContent = `${pad(h)}:${pad(m)}:${pad(s)}.${pad(Math.floor(ms / 10))}`;
    };

    $('btn-sw-start').addEventListener('click', () => {
        State.stopwatch.running = true;
        State.stopwatch.startTime = Date.now();
        swInterval = setInterval(updateStopwatch, 10);
        $('btn-sw-start').classList.add('hidden');
        $('btn-sw-lap').classList.remove('hidden');
        $('btn-sw-stop').classList.remove('hidden');
    });

    $('btn-sw-lap').addEventListener('click', () => {
        const now = Date.now();
        const elapsed = State.stopwatch.elapsed + (now - State.stopwatch.startTime);
        State.stopwatch.laps.unshift({
            num: State.stopwatch.laps.length + 1,
            time: formatDuration(elapsed) + '.' + pad(Math.floor((elapsed % 1000) / 10))
        });
        renderLaps();
    });

    $('btn-sw-stop').addEventListener('click', () => {
        State.stopwatch.running = false;
        State.stopwatch.elapsed += Date.now() - State.stopwatch.startTime;
        clearInterval(swInterval);
        $('btn-sw-lap').classList.add('hidden');
        $('btn-sw-stop').classList.add('hidden');
        $('btn-sw-start').classList.remove('hidden');
        $('btn-sw-start').textContent = '继续';
        $('btn-sw-reset').classList.remove('hidden');
    });

    $('btn-sw-reset').addEventListener('click', () => {
        State.stopwatch = { running: false, startTime: 0, elapsed: 0, laps: [] };
        $('stopwatch-display').textContent = '00:00:00.00';
        $('btn-sw-start').textContent = '开始';
        $('btn-sw-reset').classList.add('hidden');
        renderLaps();
    });

    const renderLaps = () => {
        const list = $('laps-list');
        if (State.stopwatch.laps.length === 0) {
            list.innerHTML = '';
            return;
        }
        list.innerHTML = State.stopwatch.laps.map(lap => `
            <div class="lap-item">
                <span>计时 ${lap.num}</span>
                <span>${lap.time}</span>
            </div>
        `).join('');
    };

    // ======== 世界时钟 ========
    const CITIES_DB = [
        { name: '北京', zone: 'Asia/Shanghai' },
        { name: '东京', zone: 'Asia/Tokyo' },
        { name: '首尔', zone: 'Asia/Seoul' },
        { name: '新加坡', zone: 'Asia/Singapore' },
        { name: '曼谷', zone: 'Asia/Bangkok' },
        { name: '迪拜', zone: 'Asia/Dubai' },
        { name: '伦敦', zone: 'Europe/London' },
        { name: '巴黎', zone: 'Europe/Paris' },
        { name: '柏林', zone: 'Europe/Berlin' },
        { name: '罗马', zone: 'Europe/Rome' },
        { name: '莫斯科', zone: 'Europe/Moscow' },
        { name: '纽约', zone: 'America/New_York' },
        { name: '洛杉矶', zone: 'America/Los_Angeles' },
        { name: '芝加哥', zone: 'America/Chicago' },
        { name: '多伦多', zone: 'America/Toronto' },
        { name: '悉尼', zone: 'Australia/Sydney' },
        { name: '墨尔本', zone: 'Australia/Melbourne' },
        { name: '奥克兰', zone: 'Pacific/Auckland' }
    ];

    const getCityTime = zone => {
        try {
            const now = new Date();
            const str = now.toLocaleString('en-US', { timeZone: zone, hour12: false });
            const d = new Date(str);
            return { h: d.getHours(), m: d.getMinutes() };
        } catch(e) {
            const now = new Date();
            return { h: now.getHours(), m: now.getMinutes() };
        }
    };

    const getCityDate = zone => {
        try {
            return new Date().toLocaleDateString('zh-CN', { timeZone: zone, month: 'short', day: 'numeric', weekday: 'short' });
        } catch(e) {
            return new Date().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' });
        }
    };

    const getOffset = zone => {
        try {
            const now = new Date();
            const local = now.getTime();
            const cityStr = now.toLocaleString('en-US', { timeZone: zone, timeZoneName: 'short' });
            const cityD = new Date(cityStr);
            const diff = Math.round((local - cityD.getTime()) / 3600000);
            return diff;
        } catch(e) { return 0; }
    };

    const renderWorldClock = () => {
        const now = new Date();
        $('local-time').textContent = formatTime(now.getHours(), now.getMinutes(), State.settings.format24h);
        $('local-date').textContent = getCityDate(Intl.DateTimeFormat().resolvedOptions().timeZone);

        const list = $('world-list');
        list.innerHTML = State.cities.map((city, idx) => {
            const t = getCityTime(city.zone);
            const offset = getOffset(city.zone);
            const sign = offset >= 0 ? '+' : '';
            return `
                <div class="world-item">
                    <div class="world-item-info">
                        <div class="world-item-name">${city.name}</div>
                        <div class="world-item-offset">${sign}${offset}小时</div>
                    </div>
                    <div class="world-item-time">${formatTime(t.h, t.m, State.settings.format24h)}</div>
                    <button class="world-item-delete" data-index="${idx}">✕</button>
                </div>
            `;
        }).join('');
        list.querySelectorAll('.world-item-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                State.cities.splice(parseInt(btn.dataset.index), 1);
                Storage.set('cities', State.cities);
                renderWorldClock();
            });
        });
    };

    $('btn-add-city').addEventListener('click', () => {
        $('city-modal').classList.remove('hidden');
        renderCityList();
    });
    $('btn-close-city').addEventListener('click', () => $('city-modal').classList.add('hidden'));

    const renderCityList = () => {
        const search = $('city-search').value.trim().toLowerCase();
        const filtered = CITIES_DB.filter(c => !State.cities.find(x => x.name === c.name) && c.name.includes(search));
        const list = $('city-list');
        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state">没有找到城市</div>';
            return;
        }
        list.innerHTML = filtered.map(city => {
            const t = getCityTime(city.zone);
            const offset = getOffset(city.zone);
            return `
                <div class="city-option" data-name="${city.name}" data-zone="${city.zone}">
                    <span class="city-option-name">${city.name}</span>
                    <span class="city-option-offset">${formatTime(t.h, t.m, State.settings.format24h)} (${offset >= 0 ? '+' : ''}${offset}h)</span>
                </div>
            `;
        }).join('');
        list.querySelectorAll('.city-option').forEach(opt => {
            opt.addEventListener('click', () => {
                State.cities.push({ name: opt.dataset.name, zone: opt.dataset.zone });
                Storage.set('cities', State.cities);
                renderWorldClock();
                $('city-modal').classList.add('hidden');
            });
        });
    };

    $('city-search').addEventListener('input', renderCityList);

    // ======== 设置页面 ========
    const initSettings = () => {
        $('setting-fade-in').checked = State.settings.fadeIn;
        $('setting-vibrate').checked = State.settings.vibrate;
        $('setting-tts').checked = State.settings.tts;
        $('setting-24h').checked = State.settings.format24h;
        $('setting-memory').checked = State.settings.memoryGame;
        $('setting-snooze').value = State.settings.snoozeMinutes;
        $('setting-theme').value = State.settings.theme;
        applyTheme(State.settings.theme);
    };

    const bindSettings = () => {
        $('setting-fade-in').addEventListener('change', e => { State.settings.fadeIn = e.target.checked; Storage.set('settings', State.settings); });
        $('setting-vibrate').addEventListener('change', e => { State.settings.vibrate = e.target.checked; Storage.set('settings', State.settings); });
        $('setting-tts').addEventListener('change', e => { State.settings.tts = e.target.checked; Storage.set('settings', State.settings); });
        $('setting-24h').addEventListener('change', e => {
            State.settings.format24h = e.target.checked;
            Storage.set('settings', State.settings);
            updateClock();
            renderAlarms();
            renderWorldClock();
        });
        $('setting-memory').addEventListener('change', e => { State.settings.memoryGame = e.target.checked; Storage.set('settings', State.settings); });
        $('setting-snooze').addEventListener('change', e => { State.settings.snoozeMinutes = parseInt(e.target.value); Storage.set('settings', State.settings); });
        $('setting-theme').addEventListener('change', e => { applyTheme(e.target.value); });
    };

    // ======== 下一个闹钟 ========
    const updateNextAlarm = now => {
        const enabled = State.alarms.filter(a => a.enabled);
        if (enabled.length === 0) {
            $('next-alarm-text').textContent = '暂无待响闹钟';
            return;
        }
        let next = null, nextDiff = Infinity;
        const currentMin = now.getHours() * 60 + now.getMinutes();
        enabled.forEach(alarm => {
            const alarmMin = alarm.hour * 60 + alarm.minute;
            let diff = alarmMin - currentMin;
            if (diff <= 0) diff += 24 * 60;
            if (diff < nextDiff) {
                nextDiff = diff;
                next = alarm;
            }
        });
        if (next) {
            const h = Math.floor(nextDiff / 60);
            const m = nextDiff % 60;
            let text = '';
            if (h > 0) text += `${h}小时`;
            if (m > 0) text += `${m}分钟`;
            $('next-alarm-text').textContent = `${next.label || '闹钟'} ${formatTime(next.hour, next.minute, State.settings.format24h)} · ${text}后`;
        }
    };

    // ======== 初始化 ========
    const init = () => {
        initSettings();
        bindSettings();
        renderAlarms();
        renderTimers();
        renderWorldClock();
        updateClock();
        setInterval(updateClock, 1000);
        setInterval(renderWorldClock, 60000);

        // 恢复倒计时
        if (State.timers.length > 0) {
            State.timers.forEach(t => {
                if (t.running) {
                    const elapsed = Date.now() - t.startTime;
                    t.remaining = Math.max(0, t.total - elapsed);
                    if (t.remaining <= 0) {
                        t.running = false;
                        timerFinished(t);
                    }
                }
            });
            Storage.set('timers', State.timers);
            renderTimers();
            if (State.timers.some(t => t.running)) startTimerLoop();
        }

        // 请求通知权限
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    };

    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();