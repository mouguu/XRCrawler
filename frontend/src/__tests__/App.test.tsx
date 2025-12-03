import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../App';

describe('App form submission', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn().mockImplementation((url) => {
            if (url === '/api/sessions') {
                return Promise.resolve({
                    json: () => Promise.resolve({ success: true, sessions: [] }),
                    ok: true
                } as Response);
            }
            return Promise.resolve({
                json: () => Promise.resolve({ success: true }),
                ok: true
            } as Response);
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('submits profile requests with GraphQL mode by default', async () => {
        render(<App />);
        const user = userEvent.setup();

        const input = screen.getByPlaceholderText(/e\.g\. elonmusk/i);
        await user.type(input, 'elonmusk');

        await user.click(screen.getByRole('button', { name: /begin extraction/i }));

        await waitFor(() => {
            const calls = fetchMock.mock.calls;
            const submitCall = calls.find((call: any[]) => call[0] === '/api/scrape-v2' && call[1]?.method === 'POST');
            expect(submitCall).toBeTruthy();
            if (!submitCall) throw new Error('No submit call found');
            
            const payload = JSON.parse(submitCall[1].body as string);
            expect(payload).toMatchObject({
                type: 'profile',
                mode: 'puppeteer',
                input: 'elonmusk'
            });
        });
    });

    it('forces puppeteer mode for search requests', async () => {
        render(<App />);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /search/i }));

        const input = screen.getByPlaceholderText(/e\.g\. #ai/i);
        await user.type(input, '#AI');

        await user.click(screen.getByRole('button', { name: /begin extraction/i }));

        await waitFor(() => {
            const calls = fetchMock.mock.calls;
            const submitCall = calls.find((call: any[]) => call[0] === '/api/scrape-v2' && call[1]?.method === 'POST');
            expect(submitCall).toBeTruthy();
            if (!submitCall) throw new Error('No submit call found');

            const payload = JSON.parse(submitCall[1].body as string);
            expect(payload).toMatchObject({
                type: 'search',
                mode: 'puppeteer',
                input: '#AI'
            });
        });
    });
});

