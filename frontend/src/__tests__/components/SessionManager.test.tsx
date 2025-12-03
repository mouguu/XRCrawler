import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { SessionManager } from '../../components/SessionManager';

describe('SessionManager (Wabi Sabi)', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch as any;
    vi.clearAllMocks();
  });

  it('renders session list with styled cards', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        sessions: [
          { filename: 'session-1.json', username: 'wabi', isValid: true, cookieCount: 3 }
        ]
      })
    });

    render(<SessionManager />);

    await waitFor(() => {
      expect(screen.getByText(/session management/i)).toBeInTheDocument();
      expect(screen.getByText('@wabi')).toBeInTheDocument();
      expect(screen.getByText('session-1.json')).toBeInTheDocument();
    });
  });

  it('handles hidden file input upload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, sessions: [] })
    });

    const { container } = render(<SessionManager />);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, sessions: [] })
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(['{}'], 'cookies.json', { type: 'application/json' });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cookies',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
      );
    });
  });
});
