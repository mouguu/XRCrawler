import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SessionManager } from '../components/SessionManager';

describe('SessionManager Component', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders empty state when no sessions', async () => {
        fetchMock.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true, sessions: [] }),
            ok: true
        });

        render(<SessionManager />);

        await waitFor(() => {
            expect(screen.getByText(/session management/i)).toBeInTheDocument();
            expect(screen.getByText(/no sessions found/i)).toBeInTheDocument();
        });
    });

    it('renders sessions list', async () => {
        const mockSessions = [
            {
                filename: 'user1.json',
                username: 'user1',
                isValid: true,
                cookieCount: 5
            }
        ];
        fetchMock.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true, sessions: mockSessions }),
            ok: true
        });

        render(<SessionManager />);

        await waitFor(() => {
            expect(screen.getByText('@user1')).toBeInTheDocument();
            expect(screen.getByText('user1.json')).toBeInTheDocument();
        });
    });

    it('handles file upload', async () => {
        fetchMock.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true, sessions: [] }),
            ok: true
        });

        render(<SessionManager />);

        // Mock upload response
        fetchMock.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true }),
            ok: true
        });
        // Mock refresh response
        fetchMock.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true, sessions: [] }),
            ok: true
        });

        const file = new File(['{}'], 'cookies.json', { type: 'application/json' });
        
        // Find the hidden file input
        // Since it's hidden and doesn't have a label, we find it by type
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
            await userEvent.upload(fileInput, file);
        } else {
            throw new Error('File input not found');
        }

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/api/cookies', expect.objectContaining({
                method: 'POST'
            }));
        });
    });
});
