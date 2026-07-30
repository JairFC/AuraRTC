import { IAudioAnalyzer } from "../../domain/ports/IAudioAnalyzer";

export class WebRTCMonkeyPatch implements IAudioAnalyzer {
    private audioCtx: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private dataArray: Uint8Array | null = null;
    private mediaSource: MediaStreamAudioSourceNode | null = null;
    
    private onVoiceCallback: (() => void) | null = null;
    private onSilenceCallback: (() => void) | null = null;
    private analysisInterval: number | null = null;
    private isSpeaking: boolean = false;

    public onVoiceActivity(callback: () => void): void {
        this.onVoiceCallback = callback;
    }

    public onSilence(callback: () => void): void {
        this.onSilenceCallback = callback;
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

    public startAnalysis(stream: MediaStream): void {
        try {
            const ctx = this.getOrCreateAudioContext();
            
            if (this.mediaSource) {
                this.mediaSource.disconnect();
            }

            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            this.mediaSource = ctx.createMediaStreamSource(stream);
            this.mediaSource.connect(this.analyser);

            if (!this.analysisInterval) {
                let noiseFloor = 10;
                let speakingCounter = 0;

                this.analysisInterval = window.setInterval(() => {
                    if (!this.analyser || !this.dataArray) return;
                    this.analyser.getByteFrequencyData(this.dataArray);
                    
                    let sum = 0;
                    for (let i = 0; i < this.dataArray.length; i++) {
                        sum += this.dataArray[i];
                    }
                    const average = sum / this.dataArray.length;
                    
                    if (average < noiseFloor) noiseFloor = average;
                    else noiseFloor += 0.1;
                    if (noiseFloor > 40) noiseFloor = 40;

                    if (average > noiseFloor + 10 && average > 12) {
                        speakingCounter = 10;
                    }

                    if (speakingCounter > 0) {
                        speakingCounter--;
                        if (!this.isSpeaking) {
                            this.isSpeaking = true;
                            if (this.onVoiceCallback) this.onVoiceCallback();
                        }
                    } else {
                        if (this.isSpeaking) {
                            this.isSpeaking = false;
                            if (this.onSilenceCallback) this.onSilenceCallback();
                        }
                    }
                }, 30);
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
        this.isSpeaking = false;
    }

    public hookGetUserMedia(onStreamAcquired: (stream: MediaStream) => void): void {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        
        const origGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            const stream = await origGetUserMedia.call(navigator.mediaDevices, constraints);
            
            // Bypass autoplay policy natively because user clicked to allow mic
            this.getOrCreateAudioContext();
            
            onStreamAcquired(stream);
            return stream;
        };
    }
}
