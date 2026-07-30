import { IIPCAdapter } from "../../domain/ports/IIPCAdapter";

export class MicManager {
    private availableMics: MediaDeviceInfo[] = [];
    private preferredMicId: string | null = null;
    private selectedMicIdx: number = 0;
    private ipc: IIPCAdapter;
    // Flags to avoid requesting getUserMedia ourselves — we piggyback on the
    // site's own permission grant (via WebRTCMonkeyPatch.hookGetUserMedia).
    private hasMediaPermission: boolean = false;
    private listScheduled: boolean = false;

    constructor(ipc: IIPCAdapter) {
        this.ipc = ipc;

        if (navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', () => this.refreshMicList());
        }

        // Listen for tray mic-selection events
        this.ipc.listen('change_mic', (payload: any) => {
            const idx = payload as number;
            if (this.availableMics[idx]) {
                const newMic = this.availableMics[idx];
                this.preferredMicId = newMic.deviceId;
                this.selectedMicIdx = idx;
                console.log(`[MicManager] Tray chose: ${newMic.label}`);
                this.refreshMicList();
            }
        });
    }

    public getPreferredMicId(): string | null {
        return this.preferredMicId;
    }

    /**
     * Called by WebRTCMonkeyPatch AFTER it successfully gets a stream.
     * This is the signal that the browser has already granted mic permission
     * so we can safely enumerate devices with labels.
     */
    public notifyPermissionGranted(): void {
        this.hasMediaPermission = true;
        // Small delay so the permission state propagates to enumerateDevices
        setTimeout(() => this.refreshMicList(), 300);
    }

    public async refreshMicList(): Promise<void> {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioMics = devices.filter(d => d.kind === 'audioinput' && d.deviceId);

            // Check if we have labels — if not and we don't have permission yet,
            // just wait for the site to grant permission naturally via WebRTC.
            const hasLabels = audioMics.some(d => d.label && d.label.length > 0);
            if (!hasLabels) {
                console.log("[MicManager] No mic labels yet — waiting for page to grant permission naturally.");
                // Try once proactively, but ONLY using the already-captured original getUserMedia
                // to avoid recursive monkey-patch issues.
                if (!this.hasMediaPermission && !this.listScheduled) {
                    this.listScheduled = true;
                    this._tryRequestPermission();
                }
                return;
            }

            this.hasMediaPermission = true;

            const uniqueMics: MediaDeviceInfo[] = [];
            const seenIds = new Set<string>();
            for (const m of audioMics) {
                if (m.deviceId === 'default' || m.deviceId === 'communications') continue;
                if (!seenIds.has(m.deviceId)) {
                    seenIds.add(m.deviceId);
                    uniqueMics.push(m);
                }
            }
            this.availableMics = uniqueMics;

            // Maintain selected mic index
            if (this.preferredMicId) {
                const foundIdx = uniqueMics.findIndex(m => m.deviceId === this.preferredMicId);
                if (foundIdx !== -1) {
                    this.selectedMicIdx = foundIdx;
                } else {
                    this.selectedMicIdx = 0;
                    this.preferredMicId = uniqueMics.length > 0 ? uniqueMics[0].deviceId : null;
                }
            } else if (uniqueMics.length > 0) {
                this.preferredMicId = uniqueMics[this.selectedMicIdx]?.deviceId ?? null;
            }

            if (uniqueMics.length === 0) {
                console.warn("[MicManager] No unique mics found after filtering.");
                return;
            }

            const micLabels = uniqueMics.map(m => m.label || "Micrófono Desconocido");
            console.log(`[MicManager] Sending ${micLabels.length} mics to tray: ${micLabels.join(', ')}`);
            this._sendToTray(micLabels);

        } catch (e) {
            console.error("[MicManager] Failed to enumerate devices:", e);
        }
    }

    /**
     * Sends the mic list to Rust via eval on the main window.
     * We use a Tauri command invoke; if that fails we try the event system.
     */
    private _sendToTray(micLabels: string[]): void {
        const payload = { mics: micLabels, selectedIdx: this.selectedMicIdx };

        // Primary: invoke command
        this.ipc.invoke('update_mics_cmd', { payload })
            .then(() => console.log("[MicManager] update_mics_cmd OK"))
            .catch((e: any) => {
                console.error("[MicManager] invoke failed, trying emit:", e);
                // Fallback: emit event (works in local windows, may not in remote)
                this.ipc.emit('update_mics_event', payload);
            });
    }

    /**
     * Request mic permission using the CAPTURED original getUserMedia (not the monkey-patched one).
     * Must be called AFTER WebRTCMonkeyPatch.hookGetUserMedia() captures the original.
     * We store the original on window so it's accessible here.
     */
    private _tryRequestPermission(): void {
        // Use the original getUserMedia captured before monkey-patching
        const origGUM = (window as any).__aura_orig_gum;
        if (!origGUM) {
            console.log("[MicManager] Original getUserMedia not yet captured, will wait.");
            this.listScheduled = false; // Reset so we can try again
            return;
        }

        console.log("[MicManager] Trying to get mic permission via original getUserMedia...");
        origGUM.call(navigator.mediaDevices, { audio: true })
            .then((stream: MediaStream) => {
                console.log("[MicManager] Permission granted via proactive request.");
                stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
                this.hasMediaPermission = true;
                this.listScheduled = false;
                this.refreshMicList();
            })
            .catch((e: any) => {
                console.warn("[MicManager] Proactive permission denied:", e.message);
                this.listScheduled = false;
            });
    }
}
