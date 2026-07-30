import { IDOMClicker } from "../../domain/ports/IDOMClicker";

export class DebouncedDOMObserver implements IDOMClicker {
    private isDirty: boolean = false;
    private observer: MutationObserver | null = null;
    private throttleTimer: number | null = null;
    private lastClickTime: number = 0;
    private readonly THROTTLE_MS = 1000;
    // Short anti-double-click guard only. Keeping this low lets the proactive
    // scans (1s/3s/5s/8s in startWatching) retry the connect button when the
    // first click didn't result in a call (state is owned by main.ts).
    private readonly CLICK_COOLDOWN_MS = 600;

    public findAndClick(selectors: string[]): boolean {
        const now = Date.now();
        if (now - this.lastClickTime < this.CLICK_COOLDOWN_MS) return false;

        const el = this.findElement(selectors);
        if (el) {
            this.executeClick(el);
            return true;
        }
        return false;
    }

    public findExists(selectors: string[]): boolean {
        return this.findElement(selectors) !== null;
    }

    private findElement(selectors: string[]): HTMLElement | null {
        const containsWord = (text: string, target: string) => {
            if (text === target) return true;
            const regex = new RegExp('\\b' + target + '\\b', 'i');
            return regex.test(text);
        };

        const elements = document.querySelectorAll('button, a, input, div, span, img, svg');
        for (const el of elements as any) {
            if (el.closest && el.closest('#aurartc-debug-overlay')) continue;
            
            const attrs = [
                el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt'),
                el.value, el.placeholder, el.getAttribute('data-testid')
            ].filter(Boolean).map(s => String(s).toLowerCase().trim());
            
            for (const attr of attrs) {
                if (attr && selectors.some(t => containsWord(attr, t))) {
                    return el;
                }
            }
        }

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walker.nextNode()) {
            if (node.parentElement && node.parentElement.closest('#aurartc-debug-overlay')) continue;
            const text = node.nodeValue?.toLowerCase().trim();
            if (text && selectors.some(t => containsWord(text, t))) {
                let current = node.parentElement;
                while (current && current !== document.body) {
                    if (current.tagName.toLowerCase() === 'button' || current.tagName.toLowerCase() === 'a' || current.getAttribute('role') === 'button' || current.getAttribute('data-testid')) {
                        return current;
                    }
                    current = current.parentElement;
                }
                return node.parentElement as HTMLElement;
            }
        }
        return null;
    }

    private executeClick(element: HTMLElement) {
        this.lastClickTime = Date.now();
        console.log("[AuraRTC] Click ejecutado en: " + element.tagName);
        try {
            element.click();
            const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
            events.forEach(ev => {
                element.dispatchEvent(new MouseEvent(ev, {
                    view: window, bubbles: true, cancelable: true, buttons: 1
                }));
            });
        } catch (e) {
            console.error("[AuraRTC] Click error: ", e);
        }
    }

    public startWatching(onMutated: () => void): void {
        if (this.observer) return;

        this.observer = new MutationObserver((mutations) => {
            const isSelfMutation = mutations.every(m =>
                (m.target as HTMLElement).id === 'aurartc-debug-overlay' ||
                ((m.target as HTMLElement).closest && (m.target as HTMLElement).closest('#aurartc-debug-overlay'))
            );
            if (isSelfMutation) return;

            this.isDirty = true;
        });

        // IMPORTANT: this script is injected as an initialization_script, which can
        // run BEFORE document.body exists (seen on Sesame: "observe parameter 1 is
        // not of type Node"). If observe() throws, the throttle timer + proactive
        // scans below never register and the whole auto-call/orb pipeline dies.
        const start = () => {
            if (!document.body) {
                // body not ready yet — retry on the next tick
                window.setTimeout(start, 50);
                return;
            }
            this.observer!.observe(document.body, { childList: true, subtree: true });

            this.throttleTimer = window.setInterval(() => {
                if (this.isDirty) {
                    this.isDirty = false;
                    onMutated();
                }
            }, this.THROTTLE_MS);

            // Initial proactive scans: catches buttons already in DOM on load (no mutation fires).
            // SPA pages like Sesame may render content before mutations start.
            [1000, 3000, 5000, 8000].forEach(delay => {
                setTimeout(() => { this.isDirty = true; }, delay);
            });
            // Kick an immediate scan too.
            this.isDirty = true;
        };
        start();
    }

    public stopWatching(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.throttleTimer) {
            window.clearInterval(this.throttleTimer);
            this.throttleTimer = null;
        }
    }
}
