console.log("=== INJECTOR ALIVE ===");
// Sesame Companion - Pro Max V2.2 Injector with Auto-Redial, Console Auto-Debug & Mic Selector
(function() {
    if (window.self !== window.top) return;

    // Visual Debugger
    var debugDiv = document.createElement('div');
    debugDiv.style.cssText = 'position:fixed;top:0;left:0;width:320px;height:400px;background:rgba(0,0,0,0.85);color:#00ff9d;z-index:999999;font-family:monospace;font-size:10px;overflow-y:auto;pointer-events:none;padding:10px;border-bottom-right-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    var debugDivAppended = false;
    
    function rawLog(msg) {
        console.log(msg);
        var p = document.createElement('div');
        p.style.marginBottom = '2px';
        p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        debugDiv.appendChild(p);
        while (debugDiv.childNodes.length > 30) debugDiv.removeChild(debugDiv.firstChild);
        debugDiv.scrollTop = debugDiv.scrollHeight;
        if (!debugDivAppended && document.body) {
            document.body.appendChild(debugDiv);
            debugDivAppended = true;
        } else if (!debugDivAppended && document.documentElement) {
            document.documentElement.appendChild(debugDiv);
            debugDivAppended = true;
        }
    }

    rawLog("[Sesame Companion] Script Injected (Mic Selector + Auto-Debug Active)!");

    // State & Timers
    var callTimer = null;
    var MAX_CALL_DURATION_MS = 28 * 60 * 1000;
    var IDLE_TIMEOUT_MS = 6 * 60 * 1000;
    window.lastCallStartTime = 0;
    window.lastAudioActivityTime = Date.now();
    window.__AUTO_CALL_DONE = false;
    if (typeof window.__AUTO_CALL_ENABLED === 'undefined') {
        window.__AUTO_CALL_ENABLED = true;
    }
    
    var isCalling = false; // Declarado globalmente para WebRTC
    
    let state = { connection: 'CONNECTED', maya: 'SILENT', user: 'SILENT' };

    function updateTitle() {
        document.title = `Sesame Companion [${state.connection}] [M:${state.maya}] [U:${state.user}]`;
    }

    function emitTauri(event, payload) {
        if (event === 'maya-speaking') state.maya = 'SPEAKING';
        else if (event === 'maya-silent') state.maya = 'SILENT';
        else if (event === 'user-speaking') state.user = 'SPEAKING';
        else if (event === 'user-silent') state.user = 'SILENT';
        else if (event === 'disconnected') state.connection = 'DISCONNECTED';
        else if (event === 'connected') state.connection = 'CONNECTED';
        updateTitle();
        if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emit) {
            window.__TAURI__.event.emit('syncstatus', { status: event }).catch(e=>console.error(e));
        }
    }

    setInterval(() => {
        let expected = `Sesame Companion [${state.connection}] [M:${state.maya}] [U:${state.user}]`;
        if (document.title !== expected) document.title = expected;
    }, 150);

    // =========================================================================
    // CONSOLE AUTO-DEBUGGER (Patched Red Team)
    // =========================================================================
    var origConsoleError = console.error;
    console.error = function(...args) {
        origConsoleError.apply(console, args);
        var errStr = args.map(a => {
            if (typeof a === 'object') {
                try { return JSON.stringify(a); } catch(e) { return String(a); }
            }
            return String(a);
        }).join(' ');
        
        if (errStr.includes("Content Security Policy") || errStr.includes("report-only")) return;
        rawLog("[Console Error Caught] " + errStr.substring(0, 150));
        
        if (errStr.includes("stopCall") || errStr.includes("400") || errStr.includes("client_logs") || errStr.includes("WebSocket")) {
            rawLog("[Auto-Debug] Call error detected! Triggering soft reconnect...");
            setTimeout(performSoftReconnect, 2000);
        }
    };

    window.addEventListener('error', (e) => {
        var msg = e.message || String(e);
        if (msg.includes("Content Security Policy") || msg.includes("report-only")) return;
        rawLog("[Global Error Caught] " + msg.substring(0, 150));
    });

    window.addEventListener('unhandledrejection', (e) => {
        var msg = String(e.reason);
        if (msg.includes("Content Security Policy") || msg.includes("report-only")) return;
        rawLog("[Unhandled Promise Rejection] " + msg.substring(0, 150));
    });

    // =========================================================================
    // 1. AUDIO INTERCEPTOR (Patched Memory Leaks)
    // =========================================================================
    var isMayaSpeaking = false;
    window.sharedMayaAudioCtx = null;
    var mayaAnalysers = [];
    var mayaDataArrays = [];

    function setupMayaAudioAnalysis(mediaSourceOrStream) {
        if (!window.sharedMayaAudioCtx) {
            window.sharedMayaAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        var analyser = window.sharedMayaAudioCtx.createAnalyser();
        analyser.fftSize = 256;
        
        if (mediaSourceOrStream instanceof MediaStream) {
            var source = window.sharedMayaAudioCtx.createMediaStreamSource(mediaSourceOrStream);
            source.connect(analyser);
        } else {
            mediaSourceOrStream.connect(analyser);
            analyser.connect(window.sharedMayaAudioCtx.destination);
        }

        if (mayaAnalysers.includes(analyser)) return;
        mayaAnalysers.push(analyser);
        mayaDataArrays.push(new Uint8Array(analyser.frequencyBinCount));
        
        if (mayaAnalysers.length > 1) return;

        var speakingCounter = 0;
        setInterval(() => {
            if (mayaAnalysers.length === 0) return;
            var maxAverage = 0;
            for (var j = 0; j < mayaAnalysers.length; j++) {
                mayaAnalysers[j].getByteFrequencyData(mayaDataArrays[j]);
                var sum = 0;
                for(var i=0; i<mayaDataArrays[j].length; i++) sum += mayaDataArrays[j][i];
                var average = sum / mayaDataArrays[j].length;
                if (average > maxAverage) maxAverage = average;
            }
            
            if (maxAverage > 2) {
                speakingCounter = 10;
                window.lastAudioActivityTime = Date.now();
            }
            if (state.connection === 'DISCONNECTED') speakingCounter = 0;

            if (speakingCounter > 0) {
                speakingCounter--;
                if (!isMayaSpeaking) {
                    isMayaSpeaking = true;
                    emitTauri('maya-speaking', {});
                }
            } else {
                if (isMayaSpeaking) {
                    isMayaSpeaking = false;
                    emitTauri('maya-silent', {});
                }
            }
        }, 30);
    }

    // 1.5 USER AUDIO INTERCEPTOR & MIC SELECTOR
    var isUserSpeaking = false;
    window.userAudioCtx = null;
    window.userAnalyser = null;
    window.userDataArray = null;
    window.currentUserMediaSource = null;
    window.currentUserTrack = null;
    window.__sesame_pc = null;
    
    window.availableMics = [];
    window.__preferredMicId = null;
    window.__selectedMicIdx = 0;

    function setupUserAudioAnalysis(stream) {
        try {
            if (!window.userAudioCtx) {
                window.userAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                window.userAnalyser = window.userAudioCtx.createAnalyser();
                window.userAnalyser.fftSize = 256;
                window.userDataArray = new Uint8Array(window.userAnalyser.frequencyBinCount);
            }

            if (window.currentUserMediaSource) {
                window.currentUserMediaSource.disconnect();
            }

            window.currentUserMediaSource = window.userAudioCtx.createMediaStreamSource(stream);
            window.currentUserMediaSource.connect(window.userAnalyser);
            window.currentUserTrack = stream.getAudioTracks()[0];
            
            rawLog("[Audio] User Microphone hooked (Dynamic)!");

            if (!window.userAudioLoopStarted) {
                window.userAudioLoopStarted = true;
                var noiseFloor = 10;
                var speakingCounter = 0;
                setInterval(() => {
                    if (!window.userAnalyser || !window.userDataArray) return;
                    window.userAnalyser.getByteFrequencyData(window.userDataArray);
                    var sum = 0;
                    for(var i=0; i<window.userDataArray.length; i++) sum += window.userDataArray[i];
                    var average = sum / window.userDataArray.length;
                    
                    if (average < noiseFloor) noiseFloor = average;
                    else noiseFloor += 0.1; 
                    if (noiseFloor > 40) noiseFloor = 40;

                    if (average > noiseFloor + 10 && average > 12) {
                        speakingCounter = 10;
                        window.lastAudioActivityTime = Date.now();
                    }
                    if (state.connection === 'DISCONNECTED') speakingCounter = 0;

                    if (speakingCounter > 0) {
                        speakingCounter--;
                        if (!isUserSpeaking) {
                            isUserSpeaking = true;
                            emitTauri('user-speaking', {});
                        }
                    } else {
                        if (isUserSpeaking) {
                            isUserSpeaking = false;
                            emitTauri('user-silent', {});
                        }
                    }
                }, 30);
            }
        } catch(e) {
            rawLog("[Audio] Failed to hook user mic: " + e.message);
        }
    }

    var micRefreshTimer = null;
    function refreshMicList() {
        if (micRefreshTimer) clearTimeout(micRefreshTimer);
        micRefreshTimer = setTimeout(() => {
            _doRefreshMicList();
        }, 1000);
    }

    function _doRefreshMicList() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const audioMics = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
            if (audioMics.length > 0 && !audioMics[0].label) {
                // Permisos pendientes, solicitarlos proactivamente
                if (!window.__micPermissionRequested) {
                    window.__micPermissionRequested = true;
                    rawLog("[Mic Selector] Solicitando permisos proactivamente...");
                    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                        rawLog("[Mic Selector] Permisos concedidos.");
                        stream.getTracks().forEach(t => t.stop());
                        refreshMicList(); // Reintentar con permisos
                    }).catch(e => rawLog("[Mic Selector] Permiso denegado: " + e.message));
                }
                return;
            }

            let uniqueMics = [];
            let seenIds = new Set();
            for (let m of audioMics) {
                if (m.deviceId === 'default' || m.deviceId === 'communications') continue;
                if (!seenIds.has(m.deviceId)) {
                    seenIds.add(m.deviceId);
                    uniqueMics.push(m);
                }
            }
            window.availableMics = uniqueMics;
            
            if (window.__preferredMicId) {
                const foundIdx = uniqueMics.findIndex(m => m.deviceId === window.__preferredMicId);
                if (foundIdx !== -1) {
                    window.__selectedMicIdx = foundIdx;
                } else {
                    window.__selectedMicIdx = 0;
                    window.__preferredMicId = uniqueMics.length > 0 ? uniqueMics[0].deviceId : null;
                }
            } else if (uniqueMics.length > 0) {
                window.__preferredMicId = uniqueMics[window.__selectedMicIdx].deviceId;
            }

            const micLabels = uniqueMics.map(m => m.label || "Micrófono Desconocido");
            if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emit) {
                rawLog("[Mic Selector] Emitiendo lista de micrófonos al Tray... " + micLabels.length);
                window.__TAURI__.event.emit('update_mics_event', { mics: micLabels, selectedIdx: window.__selectedMicIdx }).catch(e => rawLog("[Mic Selector] Error IPC: " + e.message));
            } else {
                rawLog("[Mic Selector] IPC Events no disponibles");
            }
        });
    }

    if (navigator.mediaDevices) {
        navigator.mediaDevices.addEventListener('devicechange', refreshMicList);
        // Call it immediately on load to trigger permissions if needed
        setTimeout(refreshMicList, 1000);
    }
    
    // Escuchar cambios desde el Tray
    setTimeout(() => {
        if (window.__TAURI__ && window.__TAURI__.event) {
            window.__TAURI__.event.listen('change_mic', (event) => {
                const idx = event.payload;
                if (window.availableMics[idx]) {
                    const newMic = window.availableMics[idx];
                    window.__preferredMicId = newMic.deviceId;
                    window.__selectedMicIdx = idx;
                    rawLog(`[MIC SELECT] Tray chose: ${newMic.label}`);
                    refreshMicList();
                    
                    if (window.__sesame_pc && isCalling) {
                        rawLog("[MIC SELECT] Hot-swapping WebRTC track...");
                        navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: newMic.deviceId } } })
                        .then(stream => {
                            try {
                                if (window.__sesame_pc && window.__sesame_pc.signalingState !== 'closed') {
                                    const sender = window.__sesame_pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                                    if (sender) {
                                        sender.replaceTrack(stream.getAudioTracks()[0])
                                            .then(() => rawLog("[MIC SELECT] WebRTC Track replaced successfully!"))
                                            .catch(e => rawLog("[MIC SELECT] replaceTrack Promise failed: " + e.message));
                                    } else {
                                        rawLog("[MIC SELECT] No audio sender found in WebRTC connection.");
                                    }
                                } else {
                                    rawLog("[MIC SELECT] WebRTC connection closed or unstable, skipping hot-swap.");
                                }
                            } catch (err) {
                                rawLog("[MIC SELECT] Exception during hot-swap: " + err.message);
                            }
                        }).catch(e => rawLog("[MIC SELECT] Failed to acquire new mic stream: " + e.message));
                    }
                }
            });
        }
    }, 2000);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async function(constraints) {
            rawLog("[Audio] Intercepted getUserMedia call!");
            if (constraints && constraints.audio && window.__preferredMicId) {
                rawLog(`[MIC SELECT] Overriding request with preferred Mic!`);
                if (typeof constraints.audio === 'object') {
                    constraints.audio.deviceId = { exact: window.__preferredMicId };
                } else {
                    constraints.audio = { deviceId: { exact: window.__preferredMicId } };
                }
            }
            const stream = await origGetUserMedia.call(this, constraints);
            if (constraints && constraints.audio) {
                if (window.currentUserTrack && window.currentUserTrack !== stream.getAudioTracks()[0]) {
                     window.currentUserTrack.stop();
                }
                setupUserAudioAnalysis(stream);
                setTimeout(refreshMicList, 500); 
            }
            return stream;
        };
    }

    function hookRTCPeerConnection(API) {
        if (!window[API]) return;
        var OrigPeerConnection = window[API];
        window[API] = function(...args) {
            var pc = new OrigPeerConnection(...args);
            window.__sesame_pc = pc;
            
            if (typeof pc.addTrack === 'function') {
                const origAddTrack = pc.addTrack;
                pc.addTrack = function(track, stream) {
                    if (track.kind === 'audio') {
                        rawLog("[Audio] Intercepted outgoing track via addTrack!");
                        if (!window.currentUserTrack) {
                            setupUserAudioAnalysis(new MediaStream([track]));
                        }
                    }
                    return origAddTrack.apply(this, arguments);
                };
            }

            pc.addEventListener('track', (e) => {
                if (e.track.kind === 'audio') {
                    try {
                        rawLog("[Audio] Intercepted incoming Maya track!");
                        setupMayaAudioAnalysis(new MediaStream([e.track]));
                    } catch(err) {}
                }
            });
            return pc;
        };
        window[API].prototype = OrigPeerConnection.prototype;
        Object.assign(window[API], OrigPeerConnection);
    }
    hookRTCPeerConnection('RTCPeerConnection');
    hookRTCPeerConnection('webkitRTCPeerConnection');

    function hookMediaElement(el) {
        if (el.__hookedBySesame) return;
        el.__hookedBySesame = true;
        try {
            if (!window.sharedMayaAudioCtx) {
                window.sharedMayaAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            var source = window.sharedMayaAudioCtx.createMediaElementSource(el);
            setupMayaAudioAnalysis(source);
        } catch(e) {}
    }

    var origCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
        var el = origCreateElement.call(document, tagName, options);
        if (tagName.toLowerCase() === 'audio' || tagName.toLowerCase() === 'video') {
            setTimeout(() => hookMediaElement(el), 1000);
        }
        return el;
    };

    setInterval(() => {
        document.querySelectorAll('audio, video').forEach(el => hookMediaElement(el));
    }, 2000);

    // =========================================================================
    // 2. OMNI-CLICKER & AUTO-REDIAL ENGINE
    // =========================================================================
    var lastClickTime = 0;
    function simulateClick(element) {
        var now = Date.now();
        if (now - lastClickTime < 1500) {
            rawLog("[Omni-Clicker] Click throttled");
            return;
        }
        lastClickTime = now;
        rawLog("[Sesame] Executing click on: " + element.tagName);
        try {
            element.click();
            var events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
            events.forEach(ev => {
                element.dispatchEvent(new MouseEvent(ev, {
                    view: window, bubbles: true, cancelable: true, buttons: 1
                }));
            });
        } catch (e) {
            rawLog("[Sesame] Click error: " + e.message);
        }
    }

    function findClickableByText(texts) {
        const containsWord = (text, target) => {
            if (text === target) return true;
            const regex = new RegExp('\\b' + target + '\\b', 'i');
            return regex.test(text);
        };
        var elements = document.querySelectorAll('button, a, input, div, span, img, svg');
        for (var el of elements) {
            if (el.closest('#sesame-debug-overlay')) continue;
            var attrs = [
                el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt'),
                el.value, el.placeholder, el.getAttribute('data-testid')
            ].filter(Boolean).map(s => String(s).toLowerCase().trim());
            for (var attr of attrs) {
                if (attr && texts.some(t => containsWord(attr, t))) return el;
            }
        }
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while (node = walker.nextNode()) {
            if (node.parentElement && node.parentElement.closest('#sesame-debug-overlay')) continue;
            var text = node.nodeValue.toLowerCase().trim();
            if (text && texts.some(t => containsWord(text, t))) {
                var parent = node.parentElement;
                var current = parent;
                while (current && current !== document.body) {
                    if (current.tagName.toLowerCase() === 'button' || current.tagName.toLowerCase() === 'a' || current.getAttribute('role') === 'button' || current.getAttribute('data-testid')) {
                        return current;
                    }
                    current = current.parentElement;
                }
                return parent;
            }
        }
        return null;
    }

    function performSoftReconnect() {
        rawLog("[Auto-Redial] Performing soft reconnect/redial sequence...");
        var hangUpBtn = findClickableByText(['hang up', 'colgar', 'terminar', 'end call', 'leave']);
        if (hangUpBtn) {
            rawLog("[Auto-Redial] Zombie call detected! Forcing hang up.");
            simulateClick(hangUpBtn);
            emitTauri('disconnected', {});
        }
        setTimeout(() => {
            var dismissBtn = findClickableByText(['skip', 'close', 'done', 'not now', 'cerrar', 'omitir', 'rate', 'dismiss', 'maybe later']);
            if (dismissBtn) {
                rawLog("[Auto-Redial] Dismissing modal popup...");
                simulateClick(dismissBtn);
            }
            window.__AUTO_CALL_DONE = false;
            window.__AUTO_CALL_ENABLED = true;
            setTimeout(() => {
                var btn = findClickableByText(['maya', 'maya-button', 'reconnect', 'continue session', 'try again', 'retry', 'redial']);
                if (btn) {
                    rawLog("[Auto-Redial] Found call trigger button! Calling...");
                    simulateClick(btn);
                    window.__AUTO_CALL_DONE = true;
                }
            }, 1200);
        }, 1000);
    }

    window.hangUpLostTime = 0;
    var checkCallState = (source) => {
        var hangUpBtn = findClickableByText(['hang up', 'colgar', 'terminar', 'end call', 'leave']);
        if (hangUpBtn && !isCalling) {
            rawLog(`[${source}] HANG UP BUTTON FOUND! Call started.`);
            isCalling = true;
            window.hangUpLostTime = 0;
            window.lastCallStartTime = Date.now();
            window.lastAudioActivityTime = Date.now();
            window.__AUTO_CALL_DONE = true;
            emitTauri('connected', {});
        } else if (!hangUpBtn && isCalling) {
            if (!window.hangUpLostTime) window.hangUpLostTime = Date.now();
            if (Date.now() - window.hangUpLostTime > 1500) {
                rawLog(`[${source}] HANG UP BUTTON LOST consistently! Call ended.`);
                isCalling = false;
                window.hangUpLostTime = 0;
                emitTauri('disconnected', {});
                window.__AUTO_CALL_DONE = false;
                window.__AUTO_CALL_ENABLED = true;
                setTimeout(performSoftReconnect, 1000);
            }
        } else if (hangUpBtn && isCalling) {
            window.hangUpLostTime = 0;
        }
    };

    var observeDOM = () => {
        if (window._currentObserver) window._currentObserver.disconnect();
        if (callTimer) clearInterval(callTimer);
        
        rawLog(`[ObserveDOM] Engine active (Restarted). Auto-Call Enabled: ${window.__AUTO_CALL_ENABLED}`);
        callTimer = setInterval(() => {
            var now = Date.now();
            var dismissBtn = findClickableByText(['skip', 'close', 'done', 'not now', 'cerrar', 'omitir', 'rate', 'dismiss', 'maybe later']);
            if (dismissBtn) {
                rawLog("[Modal Dismiss] Rating or feedback modal detected, dismissing...");
                simulateClick(dismissBtn);
                return;
            }
            if (window.__AUTO_CALL_ENABLED && !window.__AUTO_CALL_DONE && !isCalling) {
                var btn = findClickableByText(['maya', 'maya-button', 'reconnect', 'continue session', 'try again', 'retry', 'redial']);
                if (btn) {
                    rawLog("[Auto-Call] Target button found! Clicking now...");
                    simulateClick(btn);
                    window.__AUTO_CALL_DONE = true;
                }
            }
            checkCallState('Polling');
            if (isCalling) {
                var callAge = now - window.lastCallStartTime;
                var idleAge = now - window.lastAudioActivityTime;
                if (callAge > MAX_CALL_DURATION_MS) {
                    rawLog(`[Watchdog] Call limit reached. Force hanging up...`);
                    var hangUpBtn = findClickableByText(['hang up', 'colgar', 'terminar', 'end call', 'leave']);
                    if (hangUpBtn) simulateClick(hangUpBtn);
                    setTimeout(performSoftReconnect, 2000);
                } else if (idleAge > IDLE_TIMEOUT_MS) {
                    rawLog(`[Watchdog] Silence idle limit reached. Proactively redialing...`);
                    var hangUpBtn = findClickableByText(['hang up', 'colgar', 'terminar', 'end call', 'leave']);
                    if (hangUpBtn) simulateClick(hangUpBtn);
                    setTimeout(performSoftReconnect, 2000);
                }
            }
        }, 1500);

        var isClicking = false;
        var observer = new MutationObserver((mutations) => {
            var shouldProcess = false;
            for (var m of mutations) {
                if (m.target !== debugDiv && !debugDiv.contains(m.target)) {
                    shouldProcess = true;
                    break;
                }
            }
            if (!shouldProcess) return;

            var reconnectBtn = findClickableByText(['reconnect', 'continue session', 'try again', 'retry']);
            if (reconnectBtn && !isCalling && !isClicking) {
                isClicking = true;
                rawLog("[Observer] RECONNECT BUTTON DETECTED!");
                emitTauri('disconnected', {});
                simulateClick(reconnectBtn);
                setTimeout(() => { isClicking = false; }, 2000);
                return;
            }
            checkCallState('Observer');
        });

        observer.observe(document.body, { childList: true, subtree: true });
        window._currentObserver = observer;
    };

    setInterval(() => {
        if (!isCalling) {
            rawLog("[Watchdog] Proactively restarting DOM observers...");
            observeDOM();
        }
    }, 45000);

    window.setAutoCall = (enabled) => {
        window.__AUTO_CALL_ENABLED = enabled;
        if (enabled) window.__AUTO_CALL_DONE = false;
        rawLog(`[Config] setAutoCall set to: ${enabled}`);
    };

    function init() {
        if (!debugDivAppended && document.body) {
            document.body.appendChild(debugDiv);
            debugDivAppended = true;
        }
        observeDOM();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
