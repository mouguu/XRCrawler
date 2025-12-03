import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TaskForm } from '../components/TaskForm';
import type { TabType } from '../types/ui';

describe('TaskForm Component', () => {
    const defaultProps = {
        activeTab: 'profile' as TabType,
        input: '',
        limit: 50,
        scrapeLikes: false,
        scrapeMode: 'puppeteer' as const,
        autoRotateSessions: true,
        enableDeepSearch: false,
        parallelChunks: 1,
        enableProxy: false,
        startDate: '',
        endDate: '',
        lookbackHours: 24,
        keywords: '',
        redditStrategy: 'auto',
        isScraping: false,
        canSubmit: false,
        onTabChange: vi.fn(),
        onInputChange: vi.fn(),
        onLimitChange: vi.fn(),
        onScrapeModeChange: vi.fn(),
        onToggleLikes: vi.fn(),
        onToggleAutoRotate: vi.fn(),
        onToggleDeepSearch: vi.fn(),
        onParallelChunksChange: vi.fn(),
        onToggleProxy: vi.fn(),
        onStartDateChange: vi.fn(),
        onEndDateChange: vi.fn(),
        onLookbackHoursChange: vi.fn(),
        onKeywordsChange: vi.fn(),
        onRedditStrategyChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
    };

    it('renders correctly with default props', () => {
        render(<TaskForm {...defaultProps} />);
        expect(screen.getByText('Extraction Parameters')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/e.g. elonmusk/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /begin extraction/i })).toBeDisabled();
    });

    it('handles input changes', async () => {
        const onInputChange = vi.fn();
        render(<TaskForm {...defaultProps} onInputChange={onInputChange} />);
        
        const input = screen.getByPlaceholderText(/e.g. elonmusk/i);
        await userEvent.type(input, 'testuser');
        
        expect(onInputChange).toHaveBeenCalled();
    });

    it('enables submit button when canSubmit is true', () => {
        render(<TaskForm {...defaultProps} canSubmit={true} />);
        expect(screen.getByRole('button', { name: /begin extraction/i })).toBeEnabled();
    });

    it('calls onSubmit when submit button is clicked', async () => {
        const onSubmit = vi.fn();
        render(<TaskForm {...defaultProps} canSubmit={true} onSubmit={onSubmit} />);
        
        await userEvent.click(screen.getByRole('button', { name: /begin extraction/i }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('calls onStop when stop button is clicked during scraping', async () => {
        const onStop = vi.fn();
        render(<TaskForm {...defaultProps} isScraping={true} onStop={onStop} />);
        
        await userEvent.click(screen.getByRole('button', { name: /stop process/i }));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('switches tabs correctly', async () => {
        const onTabChange = vi.fn();
        render(<TaskForm {...defaultProps} onTabChange={onTabChange} />);
        
        const searchTab = screen.getByRole('button', { name: /search/i });
        await userEvent.click(searchTab);
        
        expect(onTabChange).toHaveBeenCalledWith('search');
    });

    it('shows advanced options when toggled', async () => {
        render(<TaskForm {...defaultProps} />);
        
        // Check for Limit input label
        expect(screen.getByText('Limit (Tweets)')).toBeInTheDocument();
    });
});
