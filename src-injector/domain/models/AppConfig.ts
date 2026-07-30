export interface AppConfig {
    targetUrl: string;
    selectors: {
        hangup: string[];
        bot: string[];
        dismiss: string[];
    };
    autoCallEnabled: boolean;
}
