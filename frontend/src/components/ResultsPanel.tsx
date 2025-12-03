import type { RefObject } from "react";
import type { PerformanceStats, Progress, TabType } from "../types/ui";

interface ResultsPanelProps {
  isScraping: boolean;
  progress: Progress;
  logs: string[];
  downloadUrl: string | null;
  appendApiKey: (url: string | null) => string | null;
  performanceStats: PerformanceStats | null;
  activeTab: TabType;
  input: string;
  logEndRef: RefObject<HTMLDivElement | null>;
}

export function ResultsPanel({
  isScraping,
  progress,
  logs,
  downloadUrl,
  appendApiKey,
  performanceStats,
  activeTab,
  input,
  logEndRef,
}: ResultsPanelProps) {
  const isRedditPost =
    activeTab === "reddit" &&
    input.includes("reddit.com") &&
    input.includes("/comments/");

  return (
    <section
      id="results"
      className="py-16 px-6 relative transition-colors duration-1000 border-t border-stone/10"
    >
      <div className="max-w-5xl mx-auto">
        <div className="mb-16">
          <div className="flex justify-between items-end mb-6">
            <div className="space-organic-sm">
              <h2 className="text-2xl md:text-3xl mb-2 font-display tracking-tight text-charcoal">
                Process Status
              </h2>
              <p className="text-stone/60 text-sm font-serif italic pl-1 border-l-2 border-stone/20">
                {isScraping
                  ? "Extracting digital fragments..."
                  : downloadUrl
                  ? "Collection complete."
                  : "Ready to begin."}
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-display text-rust">
                {isRedditPost ? (
                  <>
                    {progress.current || 0}{" "}
                    <span className="text-sm text-stone/50 font-serif italic">comments</span>
                  </>
                ) : (
                  <>
                    {progress.current}{" "}
                    <span className="text-sm text-stone/50 font-serif italic">/ {progress.target}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Organic Progress Bar */}
          <div className="h-1.5 w-full bg-stone/5 relative overflow-hidden rounded-full">
             <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2' stroke='%23000' stroke-width='1' opacity='0.1'/%3E%3C/svg%3E")`
            }}></div>
            <div
              className="h-full bg-rust transition-all duration-700 ease-out relative"
              style={{
                width: `${Math.min(
                  100,
                  (progress.current / Math.max(progress.target, 1)) * 100
                )}%`,
              }}
            >
               <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-inherit blur-[1px]"></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone/40 mb-4 font-sans flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-stone/40"></span>
              System Journal
            </h3>
            
            {/* Logs Container - Paper Style */}
            <div className="relative bg-stone/5 border border-stone/10 rounded-organic overflow-hidden h-[220px] group">
              {/* Inner shadow */}
              <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-stone/5 to-transparent pointer-events-none z-10"></div>
              
              <div className="font-mono text-[11px] leading-relaxed text-stone/70 space-y-1.5 h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-stone/20 scrollbar-track-transparent">
                {logs.length === 0 && (
                  <p className="opacity-40 italic text-stone font-serif">
                    Waiting for command input...
                  </p>
                )}
                {logs.map((log, i) => (
                  <div
                    key={`${log}-${i}`}
                    className="break-all border-l-2 border-transparent hover:border-rust/30 pl-3 transition-colors duration-200 hover:text-charcoal"
                  >
                    {log}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            {downloadUrl ? (
              <div className="h-full flex flex-col justify-center animate-fade-in-organic">
                <div className="p-8 card-paper rounded-organic-lg text-center space-y-6 hover:shadow-paper-lg transition-all duration-500 group">
                  <div className="w-16 h-16 mx-auto bg-rust/10 text-rust rounded-full flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform duration-500">
                    <i className="ph ph-check"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-display mb-2 text-charcoal">
                      Extraction Complete
                    </h3>
                    <p className="text-stone/60 font-serif text-sm italic">
                      Your archive is ready.
                    </p>
                  </div>
                  <a
                    href={appendApiKey(downloadUrl) || undefined}
                    className="
                      block w-full py-4 
                      bg-charcoal text-washi 
                      hover:bg-rust hover:text-washi 
                      transition-all duration-500 
                      uppercase tracking-[0.2em] text-[10px] font-bold 
                      rounded-full btn-organic shadow-paper
                    "
                  >
                    Download Artifact
                  </a>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-stone/20 rounded-organic bg-stone/5 opacity-40">
                <p className="font-serif italic text-stone text-sm">
                  Artifact will appear here
                </p>
              </div>
            )}
          </div>
        </div>

        {performanceStats && (
          <PerformanceGrid stats={performanceStats} />
        )}
      </div>

      <div className="mt-24 text-center">
        <div className="w-8 h-px bg-stone/20 mx-auto mb-4"></div>
        <p className="text-stone/30 text-[10px] uppercase tracking-[0.3em] font-sans">
          © 2024 Mono no Aware
        </p>
      </div>
    </section>
  );
}

interface PerformanceGridProps {
  stats: PerformanceStats;
}

function PerformanceGrid({ stats }: PerformanceGridProps) {
  const formatDuration = (ms: number) =>
    ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;

  return (
    <div className="mt-16 animate-fade-in-organic">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone/40 mb-6 font-sans flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-stone/40"></span>
        Performance Metrics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <MetricCard label="Duration" value={formatDuration(stats.totalDuration)} />
        <MetricCard
          label="Speed"
          value={
            <>
              {stats.tweetsPerSecond.toFixed(2)}{" "}
              <span className="text-xs text-stone/50 font-serif italic lowercase">t/s</span>
            </>
          }
        />
        {stats.mode !== "puppeteer" && stats.apiRequestCount !== undefined ? (
          <>
            <MetricCard label="API Requests" value={stats.apiRequestCount} />
            <MetricCard
              label="Avg Latency"
              value={
                stats.apiAverageLatency
                  ? `${(stats.apiAverageLatency / 1000).toFixed(2)}s`
                  : "N/A"
              }
            />
          </>
        ) : (
          <>
            <MetricCard label="Scrolls" value={stats.scrollCount} />
            <MetricCard
              label="Peak Memory"
              value={
                <>
                  {stats.peakMemoryUsage.toFixed(0)}{" "}
                  <span className="text-xs text-stone/50 font-serif italic lowercase">MB</span>
                </>
              }
            />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <DetailCard title={stats.mode !== "puppeteer" ? "API Time Breakdown" : "Time Breakdown"}>
          {stats.mode !== "puppeteer" && stats.apiRequestTime !== undefined ? (
            <>
              <DetailRow label="API Request Time" value={formatDuration(stats.apiRequestTime)} />
              <DetailRow label="API Parse Time" value={formatDuration(stats.apiParseTime || 0)} />
              <DetailRow label="Extraction" value={formatDuration(stats.extractionTime)} />
            </>
          ) : (
            <>
              <DetailRow label="Navigation" value={formatDuration(stats.navigationTime)} />
              <DetailRow label="Scrolling" value={formatDuration(stats.scrollTime)} />
              <DetailRow label="Extraction" value={formatDuration(stats.extractionTime)} />
            </>
          )}
        </DetailCard>

        <DetailCard title="Session Health">
          <DetailRow
            label="Session Switches"
            value={stats.sessionSwitches}
            valueClass={stats.sessionSwitches > 0 ? "text-rust" : "text-moss"}
          />
          <DetailRow
            label="Rate Limits Hit"
            value={stats.rateLimitHits}
            valueClass={stats.rateLimitHits > 0 ? "text-red-700" : "text-moss"}
          />
          {stats.rateLimitWaitTime ? (
            <DetailRow label="Rate Limit Wait" value={formatDuration(stats.rateLimitWaitTime)} />
          ) : null}
          {stats.mode !== "puppeteer" && stats.apiRetryCount ? (
            <DetailRow label="API Retries" value={stats.apiRetryCount} valueClass="text-rust" />
          ) : null}
        </DetailCard>

        <DetailCard title="Efficiency">
          {stats.mode !== "puppeteer" && stats.apiRequestCount !== undefined ? (
            <DetailRow
              label="Tweets/Request"
              value={
                stats.apiRequestCount > 0
                  ? (stats.tweetsCollected / stats.apiRequestCount).toFixed(1)
                  : "N/A"
              }
            />
          ) : (
            <DetailRow
              label="Tweets/Scroll"
              value={
                stats.scrollCount > 0
                  ? (stats.tweetsCollected / stats.scrollCount).toFixed(1)
                  : "N/A"
              }
            />
          )}
          <DetailRow label="Total Tweets" value={stats.tweetsCollected} valueClass="text-rust font-medium" />
        </DetailCard>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="p-6 border border-stone/10 rounded-organic bg-white/40 hover:shadow-paper transition-shadow duration-300">
      <p className="text-[10px] uppercase tracking-[0.2em] text-stone/40 mb-2 font-sans">{label}</p>
      <p className="text-2xl font-display text-charcoal">{value}</p>
    </div>
  );
}

interface DetailCardProps {
  title: string;
  children: React.ReactNode;
}

function DetailCard({ title, children }: DetailCardProps) {
  return (
    <div className="p-6 border border-stone/10 rounded-organic bg-white/40 hover:shadow-paper transition-shadow duration-300">
      <p className="text-[10px] uppercase tracking-[0.2em] text-stone/40 mb-4 font-sans">
        {title}
      </p>
      <div className="space-y-3 text-xs">{children}</div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}

function DetailRow({ label, value, valueClass }: DetailRowProps) {
  return (
    <div className="flex justify-between items-center border-b border-stone/5 pb-2 last:border-0 last:pb-0">
      <span className="text-stone/60 font-serif italic">{label}</span>
      <span className={valueClass ?? "text-charcoal/80 font-mono"}>{value}</span>
    </div>
  );
}
