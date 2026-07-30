export interface IIPCAdapter {
    emit(event: string, payload: any): void;
    listen(event: string, callback: (payload: any) => void): void;
}
