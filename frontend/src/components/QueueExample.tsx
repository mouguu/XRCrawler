/**
 * Example: Using Queue API in React Component
 * 
 * This shows how to integrate the queue-based API into your React components
 */

import { useState, useEffect } from 'react';
import { submitJob, getJobStatus, connectToJobStream, cancelJob, type JobStatus } from '../utils/queueClient';

export function QueueExample() {
  const [jobs, setJobs] = useState<Map<string, JobStatus>>(new Map());
  const [eventSources, setEventSources] = useState<Map<string, EventSource>>(new Map());

  // Submit a new job
  const handleSubmit = async (type: 'profile' | 'reddit', input: string) => {
    try {
      // Submit job and get jobId immediately
      const jobInfo = await submitJob({
        type,
        input,
        limit: type === 'profile' ? 50 : 100,
      });

      console.log('Job submitted:', jobInfo.jobId);

      // Connect to SSE stream for real-time updates
      const eventSource = connectToJobStream(jobInfo.jobId, {
        onProgress: (progress) => {
          console.log(`Progress: ${progress.current}/${progress.target} - ${progress.action}`);
          
          // Update job status in state
          setJobs(prev => {
            const updated = new Map(prev);
            const job = updated.get(jobInfo.jobId);
            if (job) {
              job.progress = progress;
              updated.set(jobInfo.jobId, job);
            }
            return updated;
          });
        },

        onLog: (log) => {
          console.log(`[${log.level}] ${log.message}`);
        },

        onCompleted: (result) => {
          console.log('Job completed!', result);
          
          // Update job with result
          setJobs(prev => {
            const updated = new Map(prev);
            const job = updated.get(jobInfo.jobId);
            if (job) {
              job.state = 'completed';
              job.result = result.result;
              updated.set(jobInfo.jobId, job);
            }
            return updated;
          });

          // Clean up event source
          cleanupEventSource(jobInfo.jobId);
        },

        onFailed: (error) => {
          console.error('Job failed:', error);
          setJobs(prev => {
            const updated = new Map(prev);
            const job = updated.get(jobInfo.jobId);
            if (job) {
              job.state = 'failed';
              updated.set(jobInfo.jobId, job);
            }
            return updated;
          });
          cleanupEventSource(jobInfo.jobId);
        },

        onConnected: (data) => {
          console.log('Connected to job stream:', data);
          
          // Add initial job to state
          setJobs(prev => {
            const updated = new Map(prev);
            updated.set(jobInfo.jobId, data);
            return updated;
          });
        },
      });

      // Store event source for cleanup
      setEventSources(prev => {
        const updated = new Map(prev);
        updated.set(jobInfo.jobId, eventSource);
        return updated;
      });

    } catch (error) {
      console.error('Failed to submit job:', error);
    }
  };

  // Cancel a job
  const handleCancel = async (jobId: string) => {
    try {
      await cancelJob(jobId);
      console.log('Job cancelled:', jobId);
      
      // Clean up
      cleanupEventSource(jobId);
      setJobs(prev => {
        const updated = new Map(prev);
        updated.delete(jobId);
        return updated;
      });
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const cleanupEventSource = (jobId: string) => {
    const eventSource = eventSources.get(jobId);
    if (eventSource) {
      eventSource.close();
      setEventSources(prev => {
        const updated = new Map(prev);
        updated.delete(jobId);
        return updated;
      });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSources.forEach(es => es.close());
    };
  }, []);

  return (
    <div>
      <h2>Active Jobs</h2>
      
      {Array.from(jobs.entries()).map(([jobId, job]) => (
        <div key={jobId} style={{ border: '1px solid #ccc', padding: '10px', margin: '10px 0' }}>
          <div>
            <strong>Job ID:</strong> {jobId}
          </div>
          <div>
            <strong>Type:</strong> {job.type}
          </div>
          <div>
            <strong>State:</strong> {job.state}
          </div>
          
          {job.progress && (
            <div>
              <strong>Progress:</strong> {job.progress.current}/{job.progress.target} ({job.progress.percentage}%)
              <br />
              <em>{job.progress.action}</em>
            </div>
          )}

          {job.result?.downloadUrl && (
            <div>
              <a href={job.result.downloadUrl} target="_blank">Download Results</a>
            </div>
          )}

          {job.state !== 'completed' && job.state !== 'failed' && (
            <button onClick={() => handleCancel(jobId)}>Cancel</button>
          )}
        </div>
      ))}

      <div style={{ marginTop: '20px' }}>
        <button onClick={() => handleSubmit('profile', 'elonmusk')}>
          Scrape Twitter @elonmusk
        </button>
        <button onClick={() => handleSubmit('reddit', 'programming')}>
          Scrape Reddit r/programming
        </button>
      </div>
    </div>
  );
}
