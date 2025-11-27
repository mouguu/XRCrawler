import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';

class StubEventSource {
    url: string;
    onmessage: ((event: MessageEvent<any>) => void) | null = null;

    constructor(url: string) {
        this.url = url;
    }

    addEventListener(): void {
        // no-op for tests
    }

    removeEventListener(): void {
        // no-op for tests
    }

    close(): void {
        // no-op for tests
    }
}

vi.stubGlobal('EventSource', StubEventSource as unknown as typeof EventSource);

const storage: Record<string, string> = {};

const localStorageMock = {
    getItem: (key: string): string | null => (key in storage ? storage[key] : null),
    setItem: (key: string, value: string) => {
        storage[key] = value;
    },
    removeItem: (key: string) => {
        delete storage[key];
    },
    clear: () => {
        Object.keys(storage).forEach(key => delete storage[key]);
    }
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
});

beforeEach(() => {
    localStorage.clear();
});

