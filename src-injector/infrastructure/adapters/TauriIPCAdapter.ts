import { IIPCAdapter } from "../../domain/ports/IIPCAdapter";

export class TauriIPCAdapter implements IIPCAdapter {
    emit(event: string, payload: any): void {
        if ((window as any).__TAURI__ && (window as any).__TAURI__.event) {
            (window as any).__TAURI__.event.emit(event, payload).catch((e: any) => console.error(e));
        }
    }

    listen(event: string, callback: (payload: any) => void): void {
        if ((window as any).__TAURI__ && (window as any).__TAURI__.event) {
            (window as any).__TAURI__.event.listen(event, (e: any) => callback(e.payload));
        }
    }
}
