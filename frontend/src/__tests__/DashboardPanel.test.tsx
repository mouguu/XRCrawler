import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { DashboardPanel } from '../components/DashboardPanel';
import * as queueClient from '../utils/queueClient';

// Mock the queueClient module
vi.mock('../utils/queueClient', () => ({
    listJobs: vi.fn(),
    connectToJobStream: vi.fn(),
    cancelJob: vi.fn(),
}));

describe('DashboardPanel Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders empty state when no jobs', async () => {
        (queueClient.listJobs as any).mockResolvedValue([]);
        
        render(<DashboardPanel />);
        
        await waitFor(() => {
            expect(screen.getByText(/active operations/i)).toBeInTheDocument();
            expect(screen.getByText(/system ready/i)).toBeInTheDocument();
        });
    });

    it('renders jobs when added via global method', async () => {
        (queueClient.connectToJobStream as any).mockReturnValue({
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            close: vi.fn(),
        });

        render(<DashboardPanel />);

        // Simulate adding a job via the exposed global method
        const addJob = (window as any).__addJobToPanel;
        expect(addJob).toBeDefined();

        // Wrap in act if necessary, but usually fireEvent/userEvent handles it. 
        // Here we are calling a state setter directly via the exposed function.
        // We should wrap it in act() from testing-library/react
        const { act } = await import('@testing-library/react');
        
        act(() => {
            addJob('job-1', 'twitter');
        });

        await waitFor(() => {
            expect(screen.getByText('job-1')).toBeInTheDocument();
            expect(screen.getByText('twitter')).toBeInTheDocument();
        });
    });
});
