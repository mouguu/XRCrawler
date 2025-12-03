import { useState, useEffect } from "react";
import { connectToJobStream, cancelJob, type JobProgressEvent } from "../utils/queueClient";

interface ActiveJob {
  jobId: string;
  type: "twitter" | "reddit";
  state: string;
  progress?: JobProgressEvent;
  logs: string[];
  result?: {
    downloadUrl?: string;
    stats?: { count: number; duration: number };
  };
  eventSource?: EventSource;
}

interface DashboardPanelProps {
  onJobComplete?: (jobId: string, downloadUrl?: string) => void;
  appendApiKey?: (url: string | null) => string | null;
  fetchJobStatus?: (jobId: string) => Promise<ActiveJob['result'] | undefined>;
}

export function DashboardPanel({ onJobComplete, appendApiKey, fetchJobStatus: fetchJobStatusProp }: DashboardPanelProps) {
  const [activeJobs, setActiveJobs] = useState<Map<string, ActiveJob>>(new Map());

  // Helper to update a job in state
  const updateJob = (jobId: string, updates: Partial<ActiveJob>) => {
    setActiveJobs((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(jobId);
      if (existing) {
        updated.set(jobId, { ...existing, ...updates });
      }
      return updated;
    });
  };

  // Fetch latest job status (used to hydrate missing downloadUrl)
  const fetchJobStatus = fetchJobStatusProp || (async (jobId: string): Promise<ActiveJob['result'] | undefined> => {
    try {
      const res = await fetch(`/api/job/${jobId}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      return data?.result;
    } catch {
      return undefined;
    }
  });

  // Add a new job and connect to its stream
  const addJob = (jobId: string, type: "twitter" | "reddit") => {
    const job: ActiveJob = {
      jobId,
      type,
      state: "connecting",
      logs: [`Connecting to job ${jobId}...`],
    };

    // Connect to SSE stream
    const eventSource = connectToJobStream(jobId, {
      onConnected: (data) => {
        updateJob(jobId, {
          state: data.state,
          logs: [`Connected! Job state: ${data.state}`],
        });
      },

      onProgress: (progress) => {
        const job = activeJobs.get(jobId);
        updateJob(jobId, {
          progress,
          logs: [
            ...(job?.logs || []),
            `Progress: ${progress.current}/${progress.target} - ${progress.action}`,
          ].slice(-50), // Keep last 50 logs
        });
      },

      onLog: (log) => {
        const job = activeJobs.get(jobId);
        updateJob(jobId, {
          logs: [
            ...(job?.logs || []),
            `[${log.level}] ${log.message}`,
          ].slice(-50),
        });
      },

      onCompleted: (result) => {
        const updateWithResult = async () => {
          const latestResult =
            (result.result && result.result.downloadUrl ? result.result : undefined) ||
            (await fetchJobStatus(jobId)) ||
            result.result;
          setActiveJobs((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(jobId);
            if (existing) {
              updated.set(jobId, {
                ...existing,
                state: "completed",
                result: latestResult,
                logs: [...(existing.logs || []), "✅ Job completed!"],
              });
            }
            return updated;
          });

          // Notify parent with the freshest download url we have
          onJobComplete?.(jobId, latestResult?.downloadUrl);
        };

        updateWithResult();

      },

      onFailed: (error) => {
        const job = activeJobs.get(jobId);
        updateJob(jobId, {
          state: "failed",
          logs: [...(job?.logs || []), `❌ Job failed: ${error}`],
        });
      },
    });

    job.eventSource = eventSource;
    setActiveJobs((prev) => new Map(prev).set(jobId, job));
  };

  // Remove a job and close its connection
  const removeJob = (jobId: string) => {
    const job = activeJobs.get(jobId);
    if (job?.eventSource) {
      job.eventSource.close();
    }
    setActiveJobs((prev) => {
      const updated = new Map(prev);
      updated.delete(jobId);
      return updated;
    });
  };

  // Cancel a job
  const handleCancel = async (jobId: string) => {
    try {
      await cancelJob(jobId);
      const job = activeJobs.get(jobId);
      updateJob(jobId, {
        state: "cancelled",
        logs: [...(job?.logs || []), "🛑 Job cancelled by user"],
      });

      // Remove after 2 seconds
      setTimeout(() => removeJob(jobId), 2000);
    } catch (error) {
      console.error("Failed to cancel job:", error);
      const job = activeJobs.get(jobId);
      updateJob(jobId, {
        logs: [...(job?.logs || []), `❌ Failed to cancel: ${error}`],
      });
    }
  };

  // Cleanup all connections on unmount
  useEffect(() => {
    return () => {
      activeJobs.forEach((job) => {
        if (job.eventSource) {
          job.eventSource.close();
        }
      });
    };
  }, []);

  // Expose addJob to parent (via window global for now)
  useEffect(() => {
    (window as any).__addJobToPanel = addJob;
    return () => {
      delete (window as any).__addJobToPanel;
    };
  }, [activeJobs]); // Re-bind if activeJobs changes (though addJob is stable, this is safe)

  const jobsArray = Array.from(activeJobs.values());

  return (
    <section
      id="dashboard"
      className="py-16 px-6 relative transition-colors duration-1000"
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-16 flex justify-between items-end border-b border-stone/10 pb-6">
          <div className="space-organic-sm">
            <h2 className="text-2xl md:text-3xl mb-2 font-display tracking-tight text-charcoal">
              Mission Control
            </h2>
            <p className="text-stone/60 text-sm font-serif italic flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rust/60"></span>
              Active Operations: {jobsArray.length}
            </p>
          </div>
          <div className="text-right">
            <div className="flex gap-6">
              <StatusBadge label="Active" count={jobsArray.filter(j => j.state === 'active').length} color="text-rust" />
              <StatusBadge label="Waiting" count={jobsArray.filter(j => j.state === 'waiting' || j.state === 'delayed').length} color="text-clay" />
              <StatusBadge label="Completed" count={jobsArray.filter(j => j.state === 'completed').length} color="text-moss" />
            </div>
          </div>
        </div>

        {jobsArray.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border border-dashed border-stone/20 rounded-organic bg-stone/5 opacity-60">
            <div className="w-16 h-16 mb-4 text-stone/40 animate-breathe">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <p className="font-serif italic text-stone text-sm tracking-wide">
              System ready. Awaiting task injection.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {jobsArray.map((job) => (
              <JobCard
                key={job.jobId}
                job={job}
                appendApiKey={appendApiKey}
                fetchJobStatus={fetchJobStatus}
                onCancel={() => handleCancel(job.jobId)}
                onRemove={() => removeJob(job.jobId)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex flex-col items-end group cursor-default">
      <span className={`text-3xl font-display ${color} transition-transform duration-300 group-hover:-translate-y-1`}>{count}</span>
      <span className="text-[10px] uppercase tracking-[0.2em] text-stone/40 font-sans">{label}</span>
    </div>
  );
}

function JobCard({
  job,
  onCancel,
  onRemove,
  appendApiKey,
  fetchJobStatus,
}: {
  job: ActiveJob;
  onCancel: () => void;
  onRemove: () => void;
  appendApiKey?: (url: string | null) => string | null;
  fetchJobStatus: (jobId: string) => Promise<ActiveJob['result'] | undefined>;
}) {
  const progressPercent = job.progress?.percentage || 0;
  const isCompleted = job.state === "completed";
  const isFailed = job.state === "failed";
  const isCancelled = job.state === "cancelled";
  const isActive = job.state === "active";
  const [resolvedDownload, setResolvedDownload] = useState<string | null>(
    job.result?.downloadUrl
      ? appendApiKey?.(job.result.downloadUrl) || job.result.downloadUrl
      : null
  );
  const [resolving, setResolving] = useState(false);

  // Sync when parent result updates
  useEffect(() => {
    if (job.result?.downloadUrl) {
      setResolvedDownload(appendApiKey?.(job.result.downloadUrl) || job.result.downloadUrl);
    }
  }, [job.result?.downloadUrl, appendApiKey]);

  const handleResolveDownload = async () => {
    if (resolvedDownload || resolving) return;
    setResolving(true);
    const latest = await fetchJobStatus(job.jobId);
    if (latest?.downloadUrl) {
      setResolvedDownload(appendApiKey?.(latest.downloadUrl) || latest.downloadUrl);
    }
    setResolving(false);
  };

  return (
    <div className="card-paper rounded-organic-lg overflow-hidden transition-all duration-500 hover:shadow-paper-lg animate-fade-in-organic">
      {/* Header */}
      <div className="p-6 flex items-center justify-between border-b border-stone/10 bg-white/40 backdrop-blur-sm">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full shadow-sm transition-colors duration-500 ${
                isActive ? "bg-rust animate-pulse" :
                isCompleted ? "bg-moss" :
                isFailed ? "bg-red-800" :
                "bg-clay"
              }`}
            />
            {isActive && <div className="absolute inset-0 bg-rust rounded-full animate-ping opacity-20"></div>}
          </div>
          <div>
            <h3 className="font-mono text-sm text-charcoal/90 tracking-wide font-medium">
              {job.jobId}
            </h3>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.15em] text-stone/50 mt-1 font-sans">
              <span className="font-semibold text-stone/70">{job.type}</span>
              <span className="w-1 h-1 rounded-full bg-stone/30"></span>
              <span>{job.state}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {resolvedDownload ? (
            <a
              href={resolvedDownload || undefined}
              download
              className="
                px-5 py-2 bg-moss/10 border border-moss/20 text-moss 
                hover:bg-moss hover:text-washi hover:border-moss
                transition-all duration-300 
                text-[10px] uppercase tracking-[0.2em] font-bold rounded-full 
                flex items-center gap-2 shadow-sm hover:shadow-md
              "
              title="Download markdown"
            >
              <span>Download .md</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </a>
          ) : (
            isCompleted && (
              <button
                onClick={handleResolveDownload}
                className="
                  px-5 py-2 bg-stone/10 border border-stone/20 text-stone/70 
                  hover:bg-charcoal hover:text-washi hover:border-charcoal/60
                  transition-all duration-300 
                  text-[10px] uppercase tracking-[0.2em] font-bold rounded-full 
                  flex items-center gap-2 shadow-sm hover:shadow-md
                "
                title="Fetch download link"
              >
                {resolving ? 'Fetching…' : 'Get Download'}
              </button>
            )
          )}
          
          {(isCompleted || isFailed || isCancelled) ? (
             <button
              onClick={onRemove}
              className="w-8 h-8 flex items-center justify-center text-stone/40 hover:text-charcoal transition-colors rounded-full hover:bg-stone/10"
              title="Dismiss"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="
                px-4 py-2 border border-stone/20 text-stone/70 
                hover:border-red-800/30 hover:text-red-800 hover:bg-red-50/50
                transition-all duration-300 
                text-[10px] uppercase tracking-[0.2em] font-bold rounded-full
              "
            >
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Organic Progress Bar */}
      <div className="h-1.5 w-full bg-stone/5 relative overflow-hidden">
        {/* Texture overlay for track */}
        <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2' stroke='%23000' stroke-width='1' opacity='0.1'/%3E%3C/svg%3E")`
        }}></div>
        
        <div
          className={`h-full transition-all duration-700 ease-out relative ${
            isCompleted ? "bg-moss" :
            isFailed ? "bg-red-800" :
            "bg-rust"
          }`}
          style={{ width: `${progressPercent}%` }}
        >
          {/* Brush stroke effect at the end */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-inherit blur-[2px]"></div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:divide-x divide-stone/10 bg-white/20">
        
        {/* Stats / Details */}
        <div className="p-6 lg:col-span-1 space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone/40 mb-2 font-sans">Progress</p>
            <p className="text-2xl font-display text-charcoal flex items-baseline gap-2">
              {job.progress?.current || 0} 
              <span className="text-sm text-stone/40 font-serif italic">/ {job.progress?.target || "?"}</span>
            </p>
          </div>
          
          {job.result?.stats && (
             <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone/40 mb-3 font-sans">Performance</p>
              <div className="flex gap-6">
                <div>
                  <span className="text-xl font-display text-charcoal">{job.result.stats.count}</span>
                  <span className="text-[10px] text-stone/40 ml-1 uppercase tracking-wider">items</span>
                </div>
                <div>
                  <span className="text-xl font-display text-charcoal">{(job.result.stats.duration / 1000).toFixed(1)}s</span>
                  <span className="text-[10px] text-stone/40 ml-1 uppercase tracking-wider">dur</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Logs Console - Paper style */}
        <div className="lg:col-span-2 bg-stone/5 relative">
          {/* Inner shadow for depth */}
          <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-stone/5 to-transparent pointer-events-none"></div>
          
          <div className="h-[180px] overflow-y-auto p-6 font-mono text-[11px] leading-relaxed space-y-1.5 scrollbar-thin scrollbar-thumb-stone/20 scrollbar-track-transparent">
            {job.logs.length === 0 && (
               <p className="text-stone/30 italic font-serif">Initializing sequence...</p>
            )}
            {job.logs.map((log, i) => (
              <div key={i} className="text-stone/70 break-all pl-3 border-l-2 border-stone/10 hover:border-rust/30 hover:text-charcoal transition-colors duration-200">
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
