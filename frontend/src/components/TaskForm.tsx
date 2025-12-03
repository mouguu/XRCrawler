import type { TabType } from "../types/ui";
import { cn } from "../utils/cn";

type ScrapeMode = "graphql" | "puppeteer" | "mixed";

interface TaskFormProps {
  activeTab: TabType;
  input: string;
  limit: number;
  scrapeLikes: boolean;
  scrapeMode: ScrapeMode;
  autoRotateSessions: boolean;
  enableDeepSearch: boolean;
  parallelChunks: number;
  enableProxy: boolean;
  startDate: string;
  endDate: string;
  lookbackHours: number;
  keywords: string;
  redditStrategy: string;
  isScraping: boolean;
  canSubmit: boolean;
  onTabChange: (tab: TabType) => void;
  onInputChange: (value: string) => void;
  onLimitChange: (value: number) => void;
  onScrapeModeChange: (mode: ScrapeMode) => void;
  onToggleLikes: (value: boolean) => void;
  onToggleAutoRotate: (value: boolean) => void;
  onToggleDeepSearch: (value: boolean) => void;
  onParallelChunksChange: (value: number) => void;
  onToggleProxy: (value: boolean) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onLookbackHoursChange: (value: number) => void;
  onKeywordsChange: (value: string) => void;
  onRedditStrategyChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function TaskForm(props: TaskFormProps) {
  const {
    activeTab,
    input,
    limit,
    scrapeLikes,
    scrapeMode,
    autoRotateSessions,
    enableDeepSearch,
    parallelChunks,
    enableProxy,
    startDate,
    endDate,
    lookbackHours,
    keywords,
    redditStrategy,
    isScraping,
    canSubmit,
    onTabChange,
    onInputChange,
    onLimitChange,
    onScrapeModeChange,
    onToggleLikes,
    onToggleAutoRotate,
    onToggleDeepSearch,
    onParallelChunksChange,
    onToggleProxy,
    onStartDateChange,
    onEndDateChange,
    onLookbackHoursChange,
    onKeywordsChange,
    onRedditStrategyChange,
    onSubmit,
    onStop,
  } = props;

  return (
    <section
      id="scrape"
      className="py-16 px-6 md:px-20 max-w-5xl mx-auto relative"
    >
      {/* Organic background accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-rust/5 rounded-full blur-3xl -z-10 animate-breathe opacity-50"></div>

      <div className="mb-16 space-organic-sm">
        <h2 className="text-3xl md:text-4xl mb-6 font-display text-charcoal tracking-tight">
          Extraction Parameters
        </h2>
        {/* Organic divider */}
        <div className="h-px w-32 bg-rust/40 mb-6" style={{
          maskImage: `url("data:image/svg+xml,%3Csvg width='128' height='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,1 Q32,0 64,1 T128,1' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E")`,
          maskSize: '100% 100%',
          maskRepeat: 'no-repeat'
        }}></div>
        <p className="text-lg text-stone max-w-2xl font-serif italic opacity-80">
          Select your source and configure the extraction settings.
        </p>
      </div>

      {/* Tabs - Organic Style */}
      <div className="flex space-x-8 md:space-x-12 mb-16 overflow-x-auto pb-4 scrollbar-hide">
        {(["profile", "thread", "search", "monitor", "reddit"] as const).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                "font-serif text-xl md:text-2xl pb-3 transition-all duration-500 capitalize whitespace-nowrap px-2",
                activeTab === tab
                  ? "tab-active font-medium"
                  : "tab-inactive hover:text-rust/80"
              )}
            >
              {tab}
            </button>
          )
        )}
      </div>

      {/* Forms Container - Card Paper Effect */}
      <div className="relative">
        {/* Dynamic Form Content based on Active Tab */}
        <div className="block space-y-16 animate-fade-in-organic">
          {/* Main Input Field */}
          <div className="relative group">
            <label className="absolute left-0 -top-8 text-xs uppercase tracking-[0.2em] text-rust/80 font-sans pointer-events-none">
              {activeTab === "profile"
                ? "Username / Profile URL"
                : activeTab === "thread"
                  ? "Tweet URL"
                  : activeTab === "monitor"
                    ? "Usernames (comma separated)"
                    : activeTab === "reddit"
                      ? "Subreddit / Post URL"
                      : "Search Query / Hashtag"}
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              className="
                w-full bg-transparent border-b border-stone/30 py-4 
                focus:outline-none focus-ink
                transition-all duration-500 
                text-2xl md:text-3xl font-serif text-charcoal placeholder-stone/20
              "
              style={{
                borderBottomStyle: 'solid',
                borderImageSlice: 1,
              }}
              placeholder={
                activeTab === "profile"
                  ? "e.g. elonmusk"
                  : activeTab === "thread"
                  ? "https://x.com/..."
                  : activeTab === "monitor"
                  ? "elonmusk, realdonaldtrump, nasa"
                  : activeTab === "reddit"
                  ? "UofT or https://reddit.com/r/Bard/comments/..."
                  : "e.g. #AI"
              }
            />
            {/* Organic underline animation */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rust/50 origin-left scale-x-0 transition-transform duration-500 group-focus-within:scale-x-100 rounded-full opacity-70"></div>
          </div>

          {/* Search Syntax Hints */}
          {activeTab === "search" && (
            <div className="mt-4 p-4 bg-stone/5 rounded-organic border border-stone/10">
              <p className="text-xs text-stone/60 font-sans mb-2 uppercase tracking-wider">Advanced Syntax</p>
              <p className="font-mono text-[10px] leading-relaxed text-stone/80">
                <span className="text-rust">from:username</span> • 
                <span className="text-rust"> lang:en</span> • 
                <span className="text-rust"> #hashtag</span> • 
                <span className="text-rust"> -is:retweet</span> • 
                <span className="text-rust"> min_faves:100</span>
              </p>
            </div>
          )}

          {/* Reddit Input Hints */}
          {activeTab === "reddit" && (
            <div className="mt-4 p-4 bg-stone/5 rounded-organic border border-stone/10">
              <p className="text-xs text-stone/60 font-sans mb-2 uppercase tracking-wider">Supported Formats</p>
              <p className="font-mono text-[10px] leading-relaxed text-stone/80">
                <span className="text-rust">Subreddit:</span> UofT, Bard, AskReddit<br/>
                <span className="text-rust">Single Post:</span> https://reddit.com/r/.../comments/...
              </p>
            </div>
          )}

          {activeTab !== "monitor" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
                {/* Hide Limit for Reddit Post URLs */}
                {!(activeTab === "reddit" && input.includes('reddit.com') && input.includes('/comments/')) && (
                  <div className="relative group">
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => onLimitChange(parseInt(e.target.value))}
                      onWheel={(e) => e.currentTarget.blur()}
                      min="10"
                      max="1000"
                      className="peer w-full bg-transparent border-b border-stone/30 py-3 focus:outline-none focus-ink transition-colors text-xl font-serif text-charcoal"
                    />
                    <label className="absolute left-0 -top-6 text-xs uppercase tracking-[0.2em] text-rust/80 font-sans">
                      {activeTab === "thread"
                        ? "Max Replies"
                        : activeTab === "reddit"
                          ? "Limit (Posts)"
                          : "Limit (Tweets)"}
                    </label>
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rust/50 origin-left scale-x-0 transition-transform duration-500 group-focus-within:scale-x-100 rounded-full opacity-70"></div>
                  </div>
                )}

                <div className="flex flex-col space-y-8">
                  {/* Hide Strategy for Reddit Post URLs */}
                  {activeTab === "reddit" && !(input.includes('reddit.com') && input.includes('/comments/')) && (
                    <div className="flex flex-col space-y-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-stone/60 font-sans">
                        Scraping Strategy
                      </span>
                      <div className="relative">
                        <select
                          value={redditStrategy}
                          onChange={(e) => onRedditStrategyChange(e.target.value)}
                          className="w-full bg-transparent border-b border-stone/30 py-2 focus:outline-none focus:border-rust transition-colors text-sm font-serif text-charcoal appearance-none cursor-pointer hover:text-rust"
                        >
                          <option value="auto">Auto (Recommended)</option>
                          <option value="super_full">Super Full (Deep)</option>
                          <option value="super_recent">Super Recent (Fast)</option>
                          <option value="new">New Only</option>
                        </select>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-stone/40 text-[10px]">▼</div>
                      </div>
                    </div>
                  )}

                  {/* Show helpful note for Post URL mode */}
                  {activeTab === "reddit" && input.includes('reddit.com') && input.includes('/comments/') && (
                    <div className="p-4 bg-rust/5 rounded-organic border border-rust/10">
                      <p className="text-sm text-rust/80 font-serif italic flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rust inline-block"></span>
                        Single post mode: will scrape all available comments
                      </p>
                    </div>
                  )}

                  {/* Scrape Mode Toggle */}
                  {(activeTab === "profile" || activeTab === "thread") && (
                    <div className="flex flex-col space-y-4">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-stone/60 font-sans">
                        Extraction Mode
                      </span>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => onScrapeModeChange("graphql")}
                          className={cn(
                            "px-5 py-2 border rounded-full text-xs uppercase tracking-wider font-sans transition-all duration-500 btn-organic",
                            scrapeMode === "graphql"
                              ? "border-rust bg-rust/10 text-rust shadow-sm"
                              : "border-stone/20 text-stone hover:border-rust/50 hover:text-rust hover:bg-stone/5"
                          )}
                        >
                          GraphQL API
                        </button>
                        <button
                          onClick={() => onScrapeModeChange("puppeteer")}
                          className={cn(
                            "px-5 py-2 border rounded-full text-xs uppercase tracking-wider font-sans transition-all duration-500 btn-organic",
                            scrapeMode === "puppeteer"
                              ? "border-rust bg-rust/10 text-rust shadow-sm"
                              : "border-stone/20 text-stone hover:border-rust/50 hover:text-rust hover:bg-stone/5"
                          )}
                        >
                          Puppeteer DOM
                        </button>
                        <button
                          onClick={() => onScrapeModeChange("mixed")}
                          className={cn(
                            "px-5 py-2 border rounded-full text-xs uppercase tracking-wider font-sans transition-all duration-500 btn-organic",
                            scrapeMode === "mixed"
                              ? "border-rust bg-rust/10 text-rust shadow-sm"
                              : "border-stone/20 text-stone hover:border-rust/50 hover:text-rust hover:bg-stone/5"
                          )}
                        >
                          Mixed
                        </button>
                      </div>
                      <p className="text-[10px] text-stone/50 font-sans italic pl-1 border-l-2 border-stone/10">
                        {scrapeMode === "graphql"
                          ? "Faster, uses Twitter's internal API"
                          : scrapeMode === "puppeteer"
                            ? "Slower but more reliable, simulates browser"
                            : "Start with API, auto-fallback to DOM if API depth hits boundary"}
                      </p>
                    </div>
                  )}

                  {activeTab === "search" && (
                    <div className="flex flex-col space-y-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-stone/60 font-sans">
                        Extraction Mode
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="px-5 py-2 border border-rust/30 bg-rust/5 text-rust rounded-full text-xs uppercase tracking-wider font-sans shadow-sm">
                          Puppeteer DOM
                        </span>
                      </div>
                      <p className="text-[10px] text-stone/50 font-sans italic pl-1 border-l-2 border-stone/10">
                        GraphQL search is limited to 20 tweets. Puppeteer mode is used for deep search.
                      </p>
                    </div>
                  )}

                  {activeTab === "profile" && (
                    <label className="flex items-center space-x-4 cursor-pointer group select-none py-2">
                      <div className="relative w-6 h-6 flex items-center justify-center">
                        <div className="w-5 h-5 border border-stone/40 rounded-md group-hover:border-rust transition-colors rotate-3"></div>
                        <div
                          className={cn(
                            "absolute inset-0 flex items-center justify-center text-rust transition-all duration-300",
                            scrapeLikes ? "opacity-100 scale-100" : "opacity-0 scale-50"
                          )}
                        >
                          <div className="w-3 h-3 bg-rust rounded-sm rotate-6 shadow-sm"></div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={scrapeLikes}
                        onChange={(e) => onToggleLikes(e.target.checked)}
                        className="hidden"
                      />
                      <span className="font-serif text-lg text-stone group-hover:text-charcoal transition-colors">
                        Scrape Likes
                      </span>
                    </label>
                  )}

                  {/* Auto-Rotate Sessions Toggle - Hide for Reddit */}
                  {activeTab !== "reddit" && (
                    <div className="pt-6 border-t border-stone/10 space-y-6">
                      <label className="flex items-start space-x-4 cursor-pointer group select-none">
                        <div className="relative w-6 h-6 flex items-center justify-center mt-1">
                          <div className="w-5 h-5 border border-stone/40 rounded-md group-hover:border-rust transition-colors -rotate-2"></div>
                          <div
                            className={cn(
                              "absolute inset-0 flex items-center justify-center text-rust transition-all duration-300",
                              autoRotateSessions ? "opacity-100 scale-100" : "opacity-0 scale-50"
                            )}
                          >
                            <div className="w-3 h-3 bg-rust rounded-sm rotate-3 shadow-sm"></div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={autoRotateSessions}
                          onChange={(e) =>
                            onToggleAutoRotate(e.target.checked)
                          }
                          className="hidden"
                        />
                        <div className="flex flex-col">
                          <span className="font-serif text-lg text-stone group-hover:text-charcoal transition-colors">
                            Auto-Rotate Sessions
                          </span>
                          <span className="text-xs text-stone/50 font-sans mt-1">
                            Switch account on rate limit
                          </span>
                        </div>
                      </label>
                      
                      {/* Proxy Toggle - Optional Feature */}
                      <label className="flex items-start space-x-4 cursor-pointer group select-none">
                        <div className="relative w-6 h-6 flex items-center justify-center mt-1">
                          <div className="w-5 h-5 border border-stone/40 rounded-md group-hover:border-rust transition-colors rotate-1"></div>
                          <div
                            className={cn(
                              "absolute inset-0 flex items-center justify-center text-rust transition-all duration-300",
                              enableProxy ? "opacity-100 scale-100" : "opacity-0 scale-50"
                            )}
                          >
                            <div className="w-3 h-3 bg-rust rounded-sm -rotate-2 shadow-sm"></div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={enableProxy}
                          onChange={(e) => onToggleProxy(e.target.checked)}
                          className="hidden"
                        />
                        <div className="flex flex-col">
                          <span className="font-serif text-lg text-stone group-hover:text-charcoal transition-colors">
                            Enable Proxy (Optional)
                          </span>
                          <span className="text-xs text-stone/50 font-sans mt-1">
                            Use proxy from ./proxy directory if available
                          </span>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Options for Search Mode */}
              {activeTab === "search" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start pt-8 border-t border-stone/10 mt-12">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="relative group">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => onStartDateChange(e.target.value)}
                        className="peer w-full bg-transparent border-b border-stone/30 py-2 focus:outline-none focus-ink transition-colors text-lg font-serif text-charcoal"
                      />
                      <label className="absolute left-0 -top-6 text-xs uppercase tracking-[0.2em] text-rust/80 font-sans">
                        Start Date
                      </label>
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rust/50 origin-left scale-x-0 transition-transform duration-500 group-focus-within:scale-x-100 rounded-full opacity-70"></div>
                    </div>
                    <div className="relative group">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => onEndDateChange(e.target.value)}
                        className="peer w-full bg-transparent border-b border-stone/30 py-2 focus:outline-none focus-ink transition-colors text-lg font-serif text-charcoal"
                      />
                      <label className="absolute left-0 -top-6 text-xs uppercase tracking-[0.2em] text-rust/80 font-sans">
                        End Date
                      </label>
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rust/50 origin-left scale-x-0 transition-transform duration-500 group-focus-within:scale-x-100 rounded-full opacity-70"></div>
                    </div>
                  </div>

                  {/* Deep Search Toggle - Only for Puppeteer mode or Search tab (which forces puppeteer) */}
                  {(scrapeMode === "puppeteer" || activeTab === "search") && (
                    <div className="flex flex-col space-y-6">
                      <div className="flex flex-col space-y-3">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-stone/60 font-sans">
                          Deep Search
                        </span>
                        <label className="flex items-start space-x-4 cursor-pointer group select-none">
                          <div className="relative w-6 h-6 flex items-center justify-center mt-1">
                            <div className="w-5 h-5 border border-stone/40 rounded-md group-hover:border-rust transition-colors -rotate-1"></div>
                            <div
                              className={cn(
                                "absolute inset-0 flex items-center justify-center text-rust transition-all duration-300",
                                enableDeepSearch ? "opacity-100 scale-100" : "opacity-0 scale-50"
                              )}
                            >
                              <div className="w-3 h-3 bg-rust rounded-sm rotate-2 shadow-sm"></div>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={enableDeepSearch}
                            onChange={(e) => onToggleDeepSearch(e.target.checked)}
                            className="hidden"
                          />
                          <div className="flex flex-col">
                            <span className="font-serif text-lg text-stone group-hover:text-charcoal transition-colors">
                              Enable Date Chunking
                            </span>
                            <span className="text-xs text-stone/50 font-sans mt-1">
                              Split search into monthly chunks (Newest → Oldest)
                            </span>
                          </div>
                        </label>
                      </div>

                      {/* Parallel Chunks Control - Only show when Deep Search is enabled */}
                      {enableDeepSearch && (
                        <div className="flex flex-col space-y-3 pl-10 animate-fade-in-organic">
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone/60 font-sans">
                            Parallel Processing
                          </label>
                          <div className="flex items-center space-x-4">
                            <input
                              type="number"
                              min="1"
                              max="3"
                              value={parallelChunks}
                              onChange={(e) => onParallelChunksChange(parseInt(e.target.value, 10))}
                              className="w-20 bg-transparent border-b border-stone/30 py-1 focus:outline-none focus:border-rust transition-colors text-sm font-serif text-charcoal text-center"
                            />
                            <div className="flex flex-col">
                              <span className="font-serif text-sm text-stone">
                                Parallel Chunks
                              </span>
                              <span className="text-[10px] text-stone/50 font-sans">
                                {parallelChunks === 1
                                  ? "Serial (1 chunk at a time)"
                                  : `${parallelChunks} chunks running simultaneously`}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-end">
              <div className="relative group">
                <input
                  type="number"
                  value={lookbackHours}
                  onChange={(e) =>
                    onLookbackHoursChange(parseInt(e.target.value))
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  min="1"
                  max="168"
                  className="peer w-full bg-transparent border-b border-stone/30 py-3 focus:outline-none focus-ink transition-colors text-xl font-serif text-charcoal"
                />
                <label className="absolute left-0 -top-6 text-xs uppercase tracking-[0.2em] text-rust/80 font-sans">
                  Lookback Period (Hours)
                </label>
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rust/50 origin-left scale-x-0 transition-transform duration-500 group-focus-within:scale-x-100 rounded-full opacity-70"></div>
              </div>
              <div className="relative group">
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => onKeywordsChange(e.target.value)}
                  className="peer w-full bg-transparent border-b border-stone/30 py-3 focus:outline-none focus-ink transition-colors text-xl font-serif text-charcoal"
                  placeholder="e.g. AI, Mars, Crypto"
                />
                <label className="absolute left-0 -top-6 text-xs uppercase tracking-[0.2em] text-rust/80 font-sans">
                  Keywords Filter (Optional)
                </label>
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rust/50 origin-left scale-x-0 transition-transform duration-500 group-focus-within:scale-x-100 rounded-full opacity-70"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-24 flex gap-6 items-center">
        {!isScraping ? (
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="
              group relative px-12 py-4 
              border border-charcoal/80 rounded-full 
              hover:bg-charcoal hover:text-washi 
              transition-all duration-500 
              uppercase tracking-[0.2em] text-xs font-sans font-bold
              flex items-center gap-4 
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-charcoal
              btn-organic shadow-paper hover:shadow-paper-lg
            "
          >
            <span className="group-hover:translate-x-1 transition-transform duration-500">
              {activeTab === "monitor"
                ? "Start Monitor"
                : "Begin Extraction"}
            </span>
            <i className="ph ph-arrow-right group-hover:translate-x-1 transition-transform duration-500 text-lg"></i>
          </button>
        ) : (
          <button
            onClick={onStop}
            className="
              px-10 py-4 
              border border-rust rounded-full 
              hover:bg-rust hover:text-washi 
              transition-all duration-500 
              uppercase tracking-[0.2em] text-xs font-sans font-bold
              text-rust shadow-paper hover:shadow-paper-lg
              btn-organic
            "
          >
            Stop Process
          </button>
        )}
      </div>
    </section>
  );
}
