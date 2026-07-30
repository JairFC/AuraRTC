import { IIPCAdapter } from "../../domain/ports/IIPCAdapter";

export class TauriIPCAdapter implements IIPCAdapter {
    emit(event: string, payload: any): void {
        if ((window as any).__TAURI__ && (window as any).__TAURI__.event) {
            (window as any).__TAURI__.event.emit(event, payload).catch((e: any) => console.error(e));
        }
    }

    async invoke(command: string, args: any): Promise<any> {
        if ((window as any).__TAURI_INTERNALS__ && (window as any).__TAURI_INTERNALS__.invoke) {
            return (window as any).__TAURI_INTERNALS__.invoke(command, args);
        } else if ((window as any).__TAURI__ && (window as any).__TAURI__.invoke) {
            return (window as any).__TAURI__.invoke(command, args);
        } else if ((window as any).__TAURI__ && (window as any).__TAURI__.core && (window as any).__TAURI__.core.invoke) {
            return (window as any).__TAURI__.core.invoke(command, args);
        }
        throw new Error("Tauri invoke not found");
    }

    listen(event: string, callback: (payload: any) => void): void {
        if ((window as any).__TAURI__ && (window as any).__TAURI__.event) {
            (window as any).__TAURI__.event.listen(event, (e: any) => callback(e.payload));
        }
    }
}
