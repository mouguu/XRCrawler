import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { vi } from 'vitest';
import { TaskForm } from '../../components/TaskForm';
import type { TabType } from '../../types/ui';

const createProps = (overrides: Partial<ComponentProps<typeof TaskForm>> = {}) => ({
  activeTab: 'profile' as TabType,
  input: '',
  limit: 50,
  scrapeLikes: false,
  scrapeMode: 'puppeteer' as const,
  autoRotateSessions: false,
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
  ...overrides,
});

describe('TaskForm (Wabi Sabi inputs)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches organic tabs and updates placeholders', () => {
    const props = createProps();
    const { rerender } = render(<TaskForm {...props} />);

    expect(screen.getByPlaceholderText(/e\.g\. elonmusk/i)).toBeInTheDocument();

    const searchTab = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchTab);
    expect(props.onTabChange).toHaveBeenCalledWith('search');

    rerender(<TaskForm {...props} activeTab="search" />);
    expect(screen.getByPlaceholderText(/e\.g\. #ai/i)).toBeInTheDocument();
  });

  it('submits when the stylized button is enabled', () => {
    const onSubmit = vi.fn();
    render(<TaskForm {...createProps({ canSubmit: true, onSubmit })} />);

    const submitBtn = screen.getByRole('button', { name: /begin extraction/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
