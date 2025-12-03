import { render, screen } from '@testing-library/react';
import { ResultsPanel } from '../components/ResultsPanel';
import React from 'react';

describe('ResultsPanel Component', () => {
    const defaultProps = {
        isScraping: false,
        progress: { current: 0, target: 100 },
        logs: [],
        downloadUrl: null,
        appendApiKey: (url: string | null) => url,
        performanceStats: null,
        activeTab: 'profile' as const,
        input: '',
        logEndRef: React.createRef<HTMLDivElement>(),
    };

    it('renders correctly in initial state', () => {
        render(<ResultsPanel {...defaultProps} />);
        expect(screen.getByText('Process Status')).toBeInTheDocument();
        expect(screen.getByText('Ready to begin.')).toBeInTheDocument();
    });

    it('displays logs', () => {
        const logs = ['Log 1', 'Log 2'];
        render(<ResultsPanel {...defaultProps} logs={logs} />);
        expect(screen.getByText('Log 1')).toBeInTheDocument();
        expect(screen.getByText('Log 2')).toBeInTheDocument();
    });

    it('displays progress', () => {
        const progress = { current: 50, target: 100 };
        render(<ResultsPanel {...defaultProps} progress={progress} isScraping={true} />);
        expect(screen.getByText('50')).toBeInTheDocument();
        expect(screen.getByText('/ 100')).toBeInTheDocument();
        expect(screen.getByText('Extracting digital fragments...')).toBeInTheDocument();
    });

    it('displays download link when finished', () => {
        render(<ResultsPanel {...defaultProps} downloadUrl="/download.zip" />);
        expect(screen.getByText('Extraction Complete')).toBeInTheDocument();
        expect(screen.getByText('Download Artifact')).toBeInTheDocument();
    });

    it('displays performance stats', () => {
        const stats = {
            totalDuration: 1000,
            tweetsPerSecond: 5,
            scrollCount: 10,
            peakMemoryUsage: 100,
            navigationTime: 100,
            scrollTime: 100,
            extractionTime: 100,
            sessionSwitches: 0,
            rateLimitHits: 0,
            tweetsCollected: 50,
            mode: 'puppeteer' as const
        };
        render(<ResultsPanel {...defaultProps} performanceStats={stats} />);
        expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
        expect(screen.getByText('5.00')).toBeInTheDocument(); // Speed
    });
});
