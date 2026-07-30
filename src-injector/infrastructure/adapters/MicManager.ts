import { IIPCAdapter } from "../../domain/ports/IIPCAdapter";

export class MicManager {
    private availableMics: MediaDeviceInfo[] = [];
    private preferredMicId: string | null = null;
    private selectedMicIdx: number = 0;
    private ipc: IIPCAdapter;
    private permissionRequested: boolean = false;

    constructor(ipc: IIPCAdapter) {
        this.ipc = ipc;
        
        if (navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', () => this.refreshMicList());
            // Slight delay to allow page loading
            setTimeout(() => this.refreshMicList(), 1000);
        }

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

    public async refreshMicList() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioMics = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
            
            // If labels are empty, we might need to request permission
            if (audioMics.length > 0 && !audioMics[0].label) {
                if (!this.permissionRequested) {
                    this.permissionRequested = true;
                    console.log("[MicManager] Requesting permissions proactively...");
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        console.log("[MicManager] Permissions granted.");
                        stream.getTracks().forEach(t => t.stop());
                        this.refreshMicList(); // Try again
                    } catch (e: any) {
                        console.error("[MicManager] Permission denied: " + e.message);
                    }
                }
                return;
            }

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

            if (this.preferredMicId) {
                const foundIdx = uniqueMics.findIndex(m => m.deviceId === this.preferredMicId);
                if (foundIdx !== -1) {
                    this.selectedMicIdx = foundIdx;
                } else {
                    this.selectedMicIdx = 0;
                    this.preferredMicId = uniqueMics.length > 0 ? uniqueMics[0].deviceId : null;
                }
            } else if (uniqueMics.length > 0) {
                this.preferredMicId = uniqueMics[this.selectedMicIdx].deviceId;
            }

            const micLabels = uniqueMics.map(m => m.label || "Micrófono Desconocido");
            console.log(`[MicManager] Emitting ${micLabels.length} mics to tray.`);
            this.ipc.invoke('update_mics_cmd', { payload: { mics: micLabels, selectedIdx: this.selectedMicIdx } })
                .catch(e => console.error("[MicManager] Failed to invoke update_mics_cmd:", e));

        } catch (e) {
            console.error("[MicManager] Failed to enumerate devices", e);
        }
    }
}
