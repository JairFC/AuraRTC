export interface IAudioAnalyzer {
    onVoiceActivity(callback: () => void): void;
    onSilence(callback: () => void): void;
    startAnalysis(stream: MediaStream): void;
    stopAnalysis(): void;
}
