export interface IIPCAdapter {
    emit(event: string, payload: any): void;
    invoke(command: string, args: any): Promise<any>;
    listen(event: string, callback: (payload: any) => void): void;
}
