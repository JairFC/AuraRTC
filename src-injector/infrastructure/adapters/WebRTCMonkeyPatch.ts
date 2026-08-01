import { IAudioAnalyzer } from "../../domain/ports/IAudioAnalyzer";
import { VadConfig } from "../../domain/models/AppConfig";
import { MicManager } from "./MicManager";

/**
 * Analyzes an audio source for voice activity using an adaptive noise floor.
 * One instance per analyzed source (local mic OR a remote stream/element),
 * so the same engine powers both user and remote VAD without duplication.
 */
interface VoiceDetector {
    isSpeaking: boolean;
    noiseFloor: number;
    speakingCounter: number;
    analyser: AnalyserNode;
    dataArray: Uint8Array;
    /** Stable per-source color (hash of track id). */
    color: string;
    /** WebRTC track id (or synthetic id for media elements). */
    id: string;
    onSpeak: () => void;
    onSilent: () => void;
}

export class WebRTCMonkeyPatch implements IAudioAnalyzer {
    private audioCtx: AudioContext | null = null;

    // --- User (local mic) VAD (IAudioAnalyzer contract) ---
    private mediaSource: MediaStreamAudioSourceNode | null = null;
    private onVoiceCallback: (() => void) | null = null;
    private onSilenceCallback: (() => void) | null = null;
    private analysisInterval: number | null = null;
    private userDetector: VoiceDetector | null = null;

    // --- Remote (incoming WebRTC audio) VAD ---
    // Callbacks carry the speaking track's { id, color } so the orb can tint
    // per-participant (multi-party coloring) instead of a single "remote" color.
    private onRemoteVoiceCallback: ((p: { id: string; color: string }) => void) | null = null;
    private onRemoteSilenceCallback: ((p: { id: string; color: string }) => void) | null = null;
    private remoteAnalysisInterval: number | null = null;
    private remoteDetectors: VoiceDetector[] = [];
    /** Media elements we already wired up, to avoid double-hooking. */
    private hookedMediaElements = new WeakSet<HTMLMediaElement>();

    private vadConfig: VadConfig;
    private micManager: MicManager;

    constructor(micManager: MicManager, vadConfig?: VadConfig) {
        this.micManager = micManager;
        this.vadConfig = vadConfig || {
            noise_floor_max: 40.0,
            speaking_threshold: 12.0,
            speaking_offset: 10.0,
            analysis_interval_ms: 30,
        };
    }

    public onVoiceActivity(callback: () => void): void {
        this.onVoiceCallback = callback;
    }

    public onSilence(callback: () => void): void {
        this.onSilenceCallback = callback;
    }

    /** Mirror of the user VAD callbacks, for incoming (remote) audio. */
    public onRemoteVoiceActivity(callback: (p: { id: string; color: string }) => void): void {
        this.onRemoteVoiceCallback = callback;
    }

    public onRemoteSilence(callback: (p: { id: string; color: string }) => void): void {
        this.onRemoteSilenceCallback = callback;
    }

    private getOrCreateAudioContext(): AudioContext {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        return this.audioCtx;
    }

    // =========================================================================
    // Shared adaptive VAD engine — used by both local and remote analysis.
    // =========================================================================

    /**
     * Samples a detector once and fires its speak/silent callbacks on state change.
     * Adaptive noise floor keeps detection robust across hardware/sources.
     */
    private sampleDetector(d: VoiceDetector): void {
        d.analyser.getByteFrequencyData(d.dataArray);
        let sum = 0;
        for (let i = 0; i < d.dataArray.length; i++) sum += d.dataArray[i];
        const average = sum / d.dataArray.length;

        if (average < d.noiseFloor) d.noiseFloor = average;
        else d.noiseFloor += 0.1;
        if (d.noiseFloor > this.vadConfig.noise_floor_max) d.noiseFloor = this.vadConfig.noise_floor_max;

        if (average > d.noiseFloor + this.vadConfig.speaking_offset && average > this.vadConfig.speaking_threshold) {
            d.speakingCounter = 10;
        }

        if (d.speakingCounter > 0) {
            d.speakingCounter--;
            if (!d.isSpeaking) {
                d.isSpeaking = true;
                d.onSpeak();
            }
        } else {
            if (d.isSpeaking) {
                d.isSpeaking = false;
                d.onSilent();
            }
        }
    }

    // =========================================================================
    // USER (local microphone) analysis — IAudioAnalyzer contract.
    // Kept single-source for the mic (replaces its analyser on each stream).
    // =========================================================================

    public startAnalysis(stream: MediaStream): void {
        try {
            const ctx = this.getOrCreateAudioContext();

            if (this.mediaSource) {
                this.mediaSource.disconnect();
            }

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            this.mediaSource = ctx.createMediaStreamSource(stream);
            this.mediaSource.connect(analyser);

            // Closure state for the local-mic detector.
            const detector: VoiceDetector = {
                isSpeaking: false, noiseFloor: 10, speakingCounter: 0,
                analyser, dataArray,
                color: '#00FFFF', id: 'local',
                onSpeak: () => { if (this.onVoiceCallback) this.onVoiceCallback(); },
                onSilent: () => { if (this.onSilenceCallback) this.onSilenceCallback(); },
            };
            // Snapshot the detector fields so the interval reads fresh analyser data.
            this.userDetector = detector;

            if (!this.analysisInterval) {
                this.analysisInterval = window.setInterval(() => {
                    if (this.userDetector) this.sampleDetector(this.userDetector);
                }, this.vadConfig.analysis_interval_ms);
            }
        } catch (e) {
            console.error("[AuraRTC] Failed to hook audio: ", e);
        }
    }

    public stopAnalysis(): void {
        if (this.analysisInterval) {
            window.clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        if (this.mediaSource) {
            this.mediaSource.disconnect();
            this.mediaSource = null;
        }
        this.userDetector = null;
    }

    public hookGetUserMedia(onStreamAcquired: (stream: MediaStream) => void): void {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

        // IMPORTANT: capture the original BEFORE patching, and store on window
        // so MicManager._tryRequestPermission() can use it safely.
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        (window as any).__aura_orig_gum = origGetUserMedia;

        navigator.mediaDevices.getUserMedia = async (constraints) => {
            console.log("[AuraRTC] Intercepted getUserMedia call!");

            const preferredMicId = this.micManager.getPreferredMicId();
            if (constraints && constraints.audio && preferredMicId) {
                console.log(`[AuraRTC] Overriding request with preferred Mic: ${preferredMicId}`);
                if (typeof constraints.audio === 'object') {
                    constraints.audio.deviceId = { exact: preferredMicId };
                } else {
                    constraints.audio = { deviceId: { exact: preferredMicId } };
                }
            }

            const stream = await origGetUserMedia(constraints);

            // Bypass autoplay policy natively because user clicked to allow mic
            this.getOrCreateAudioContext();

            onStreamAcquired(stream);

            // KEY: notify MicManager that we now have permission.
            // This triggers enumerateDevices which will now return labels.
            this.micManager.notifyPermissionGranted();

            return stream;
        };

        console.log("[AuraRTC] getUserMedia hooked. Attempting early mic permission request...");
        // Now that the original is captured, try an early permission request for the mic list.
        // We do this AFTER hooking so the monkey-patch doesn't recurse.
        setTimeout(() => this.micManager.refreshMicList(), 1500);
    }

    // =========================================================================
    // REMOTE (incoming WebRTC audio) analysis — site-agnostic.
    // Two redundant capture paths, both feeding the same shared VAD engine:
    //   (1) RTCPeerConnection 'track' event  — the canonical WebRTC inbound path.
    //   (2) <audio>/<video> media elements    — fallback when the PC isn't reachable.
    // Works on ANY WebRTC-enabled site; no site-specific knowledge required.
    // =========================================================================

    /**
     * Hooks all inbound audio so the remote participant's voice drives
     * onRemoteVoiceActivity/onRemoteSilence. Call once at injector init.
     */
    public hookRemoteAudio(): void {
        this.hookPeerConnection();
        this.hookMediaElements();

        // SPAs create/destroy media elements after navigation; rescan periodically.
        setInterval(() => this.hookMediaElements(), 2000);
    }

    /** Path (1): intercept RTCPeerConnection to grab inbound audio tracks. */
    private hookPeerConnection(): void {
        const self = this;
        const wrap = (API: string) => {
            const OrigPC = (window as any)[API];
            if (!OrigPC) return;
            const Wrapped: any = function (this: any, ...args: any[]) {
                const pc = new OrigPC(...args);
                pc.addEventListener('track', (e: RTCTrackEvent) => {
                    if (e.track && e.track.kind === 'audio') {
                        try {
                            self.analyzeRemoteStream(new MediaStream([e.track]), e.track.id);
                            console.log(`[AuraRTC] Captured inbound WebRTC track ${e.track.id}.`);
                        } catch (err) {
                            console.warn("[AuraRTC] Could not analyze inbound track", err);
                        }
                    }
                });
                return pc;
            };
            Wrapped.prototype = OrigPC.prototype;
            (window as any)[API] = Object.assign(Wrapped, OrigPC);
        };
        wrap('RTCPeerConnection');
        wrap('webkitRTCPeerConnection');
    }

    /** Path (2): tap every <audio>/<video> element playing remote audio. */
    private hookMediaElements(): void {
        const els = document.querySelectorAll('audio, video');
        els.forEach(el => this.tapMediaElement(el as HTMLMediaElement));
    }

    private tapMediaElement(el: HTMLMediaElement): void {
        if (this.hookedMediaElements.has(el)) return;
        try {
            const ctx = this.getOrCreateAudioContext();
            // createMediaElementSource "captures" the element's audio out of the
            // default pipeline — we MUST re-route it to destination, otherwise the
            // site would go silent (the remote voice would stop being heard).
            const source = ctx.createMediaElementSource(el);
            source.connect(ctx.destination);
            // Media elements have no track.id; use a synthetic stable id so each
            // element still gets a consistent color across rescans.
            this.analyzeRemoteSource(source, el.dataset.auraId || (el.dataset.auraId = 'media-' + Math.random().toString(36).slice(2, 8)));
            this.hookedMediaElements.add(el);
        } catch (e) {
            // Element may already be captured by a prior hook or be in a bad state.
        }
    }

    /** Shared analysis entry: MediaStream (from a PC track). */
    private analyzeRemoteStream(stream: MediaStream, trackId: string): void {
        const ctx = this.getOrCreateAudioContext();
        const source = ctx.createMediaStreamSource(stream);
        this.analyzeRemoteSource(source, trackId);
    }

    /**
     * Stable color (hex) for a given track id. The FIRST remote track always gets
     * the classic purple, so a 1:1 call looks identical to before multi-party.
     * Subsequent tracks get a deterministic hue spread so participants stay
     * distinguishable without ML.
     */
    private colorForTrack(trackId: string): string {
        // Default purple — keeps the original look for single-remote calls.
        if (this.remoteDetectors.length === 0) return '#FF00FF';
        let h = 0;
        for (let i = 0; i < trackId.length; i++) h = (h * 31 + trackId.charCodeAt(i)) >>> 0;
        // Spread hues avoiding the cyan band (reserved for the local user).
        const hue = 20 + (h % 300);
        return hslToHex(hue, 85, 58);
    }

    /** Shared analysis entry: any AudioNode (stream or media-element source). */
    private analyzeRemoteSource(source: AudioNode, trackId: string): void {
        const ctx = this.getOrCreateAudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const color = this.colorForTrack(trackId);
        // Detectors carry no callbacks — aggregation is centralized in the
        // sampler so that "remote speaking" only flips to silent when NO
        // detector is active (multi-party coordination).
        const detector: VoiceDetector = {
            isSpeaking: false,
            noiseFloor: 2, // remote audio is decoded, so it sits very low when idle
            speakingCounter: 0,
            analyser,
            dataArray: new Uint8Array(analyser.frequencyBinCount),
            color,
            id: trackId,
            onSpeak: () => {},
            onSilent: () => {},
        };
        this.remoteDetectors.push(detector);

        if (this.remoteAnalysisInterval) return;
        // One interval samples ALL detectors, then aggregates: emits "speaking"
        // with the first active detector's color, or "silent" only when none are.
        this.remoteAnalysisInterval = window.setInterval(() => {
            for (const d of this.remoteDetectors) this.sampleDetector(d);
            // Aggregate: pick the first active detector's color.
            const active = this.remoteDetectors.find(d => d.isSpeaking);
            if (active) {
                if (this.onRemoteVoiceCallback) this.onRemoteVoiceCallback({ id: active.id, color: active.color });
            } else {
                if (this.onRemoteSilenceCallback) this.onRemoteSilenceCallback({ id: '', color: '' });
            }
        }, this.vadConfig.analysis_interval_ms);
    }
}

/** HSL → "#RRGGBB" helper for stable per-track coloring. */
function hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
