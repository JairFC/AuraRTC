export interface IDOMClicker {
    /** Searches for buttons matching text arrays and clicks if found */
    findAndClick(selectors: string[]): boolean;
    
    /** Returns true if a button matching the text exists (without clicking) */
    findExists(selectors: string[]): boolean;
    
    /** Start listening for DOM changes using the throttled observer */
    startWatching(onMutated: () => void): void;
    
    /** Stop the observer */
    stopWatching(): void;
}
