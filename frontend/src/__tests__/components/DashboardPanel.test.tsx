import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import { DashboardPanel } from '../../components/DashboardPanel';
import * as queueClient from '../../utils/queueClient';

vi.mock('../../utils/queueClient', () => ({
  connectToJobStream: vi.fn(),
  cancelJob: vi.fn(),
  listJobs: vi.fn(),
}));

const connectMock = queueClient.connectToJobStream as unknown as ReturnType<typeof vi.fn>;

describe('DashboardPanel (Wabi Sabi dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectMock.mockImplementation(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    }) as any);
  });

  it('shows empty state when no jobs exist', async () => {
    render(<DashboardPanel />);

    expect(screen.getByText(/mission control/i)).toBeInTheDocument();
    expect(screen.getByText(/system ready\. awaiting task injection\./i)).toBeInTheDocument();
  });

  it('renders job card when added through global hook', async () => {
    render(<DashboardPanel />);

    const addJob = await waitFor(() => {
      const fn = (window as any).__addJobToPanel;
      if (!fn) {
        throw new Error('addJob not ready');
      }
      return fn;
    });

    await act(async () => {
      addJob('job-123', 'twitter');
    });

    await waitFor(() => {
      expect(screen.getByText('job-123')).toBeInTheDocument();
      expect(screen.getByText(/twitter/i)).toBeInTheDocument();
      expect(screen.getAllByText(/connecting/i).length).toBeGreaterThan(0);
    });

    expect(connectMock).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({
        onProgress: expect.any(Function),
        onCompleted: expect.any(Function),
      })
    );
  });
});
