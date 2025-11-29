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
      className="py-16 px-6 bg-charcoal text-washi min-h-[40vh] relative transition-colors duration-1000 border-t border-white/5"
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h2 className="text-2xl mb-1 font-display tracking-wide text-stone/80">
                Process Status
              </h2>
              <p className="text-stone/60 text-sm font-serif italic">
                {isScraping
                  ? "Extracting digital fragments..."
                  : downloadUrl
                  ? "Collection complete."
                  : "Ready to begin."}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-display text-rust">
                {isRedditPost ? (
                  <>
                    {progress.current || 0}{" "}
                    <span className="text-sm text-stone/50">comments</span>
                  </>
                ) : (
                  <>
                    {progress.current}{" "}
                    <span className="text-sm text-stone/50">/ {progress.target}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="h-px w-full bg-stone/10 overflow-hidden">
            <div
              className="h-full bg-rust transition-all duration-500 ease-out"
              style={{
                width: `${Math.min(
                  100,
                  (progress.current / Math.max(progress.target, 1)) * 100
                )}%`,
              }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone/30 mb-3 font-sans">
              System Journal
            </h3>
            <div className="font-mono text-[11px] leading-relaxed text-stone/10 space-y-1 h-[180px] overflow-y-auto p-4 border border-white/10 rounded-sm bg-white/5 scrollbar-thin scrollbar-thumb-stone/30 backdrop-blur-sm transition-all hover:border-white/20">
              {logs.length === 0 && (
                <p className="opacity-70 italic text-stone">
                  Waiting for command input...
                </p>
              )}
              {logs.map((log, i) => (
                <div
                  key={`${log}-${i}`}
                  className="break-all border-l border-transparent hover:border-rust/60 pl-2 transition-colors duration-200 text-washi"
                >
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          <div className="lg:col-span-1">
            {downloadUrl ? (
              <div className="h-full flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="p-6 border border-rust/20 bg-rust/5 rounded-sm text-center space-y-4 hover:bg-rust/10 transition-colors duration-500">
                  <div className="w-10 h-10 mx-auto bg-rust text-washi rounded-full flex items-center justify-center text-lg shadow-lg shadow-rust/20">
                    <i className="ph ph-check"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-display mb-1 text-washi/90">
                      Extraction Complete
                    </h3>
                    <p className="text-stone/60 font-serif text-xs italic">
                      Your archive is ready.
                    </p>
                  </div>
                  <a
                    href={appendApiKey(downloadUrl) || undefined}
                    className="block w-full py-3 bg-stone/10 border border-stone/20 text-stone hover:bg-rust hover:border-rust hover:text-washi transition-all duration-300 uppercase tracking-widest text-[10px] font-sans"
                  >
                    Download Artifact
                  </a>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-stone/10 rounded-sm opacity-20">
                <p className="font-serif italic text-stone text-xs">
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

      <div className="absolute bottom-4 left-0 w-full text-center text-stone/20 text-[10px] uppercase tracking-[0.3em] font-sans">
        © 2024 Mono no Aware
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
    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone/30 mb-4 font-sans">
        Performance Metrics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Duration" value={formatDuration(stats.totalDuration)} />
        <MetricCard
          label="Speed"
          value={
            <>
              {stats.tweetsPerSecond.toFixed(2)}{" "}
              <span className="text-xs text-stone/50">t/s</span>
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
                  <span className="text-xs text-stone/50">MB</span>
                </>
              }
            />
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
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
            valueClass={stats.sessionSwitches > 0 ? "text-yellow-400" : "text-green-400"}
          />
          <DetailRow
            label="Rate Limits Hit"
            value={stats.rateLimitHits}
            valueClass={stats.rateLimitHits > 0 ? "text-red-400" : "text-green-400"}
          />
          {stats.rateLimitWaitTime ? (
            <DetailRow label="Rate Limit Wait" value={formatDuration(stats.rateLimitWaitTime)} />
          ) : null}
          {stats.mode !== "puppeteer" && stats.apiRetryCount ? (
            <DetailRow label="API Retries" value={stats.apiRetryCount} valueClass="text-yellow-400" />
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
    <div className="p-4 border border-white/10 rounded-sm bg-white/5">
      <p className="text-[10px] uppercase tracking-wider text-stone/50 mb-1">{label}</p>
      <p className="text-xl font-display text-rust">{value}</p>
    </div>
  );
}

interface DetailCardProps {
  title: string;
  children: React.ReactNode;
}

function DetailCard({ title, children }: DetailCardProps) {
  return (
    <div className="p-4 border border-white/10 rounded-sm bg-white/5">
      <p className="text-[10px] uppercase tracking-wider text-stone/50 mb-3">
        {title}
      </p>
      <div className="space-y-2 text-xs">{children}</div>
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
    <div className="flex justify-between">
      <span className="text-stone/60">{label}</span>
      <span className={valueClass ?? "text-washi/80"}>{value}</span>
    </div>
  );
}
