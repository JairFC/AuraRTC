import { IIPCAdapter } from "../../domain/ports/IIPCAdapter";

export class TauriIPCAdapter implements IIPCAdapter {
    emit(event: string, payload: any): void {
        const tauri = (window as any).__TAURI__;
        if (tauri && tauri.event && typeof tauri.event.emit === 'function') {
            tauri.event.emit(event, payload).catch((e: any) => console.error('[AuraRTC] emit error', e));
        } else {
            // The injector runs inside the remote window (main). If __TAURI__.event
            // is missing here, no event ever reaches the backend / orb.
            console.warn(`[AuraRTC] emit('${event}') dropped — window.__TAURI__.event is unavailable`,
                tauri ? '(has __TAURI__, missing .event)' : '(no __TAURI__ global)');
        }
    }

    async invoke(command: string, args: any): Promise<any> {
        if ((window as any).__TAURI__ && (window as any).__TAURI__.core && (window as any).__TAURI__.core.invoke) {
            return (window as any).__TAURI__.core.invoke(command, args);
        }
        console.error("Tauri core.invoke not found! Falling back to __TAURI_INTERNALS__");
        if ((window as any).__TAURI_INTERNALS__ && (window as any).__TAURI_INTERNALS__.invoke) {
            return (window as any).__TAURI_INTERNALS__.invoke(command, args);
        }
        throw new Error("Tauri invoke not found");
    }

    listen(event: string, callback: (payload: any) => void): void {
        if ((window as any).__TAURI__ && (window as any).__TAURI__.event) {
            (window as any).__TAURI__.event.listen(event, (e: any) => callback(e.payload));
        }
    }
}
