import { RequestQueue, RequestTask, ScraperErrors } from "../core";

type TaskHandler = () => Promise<void>;

export interface QueueTaskInfo
  extends Omit<RequestTask, "id" | "uniqueKey" | "retryCount"> {
  uniqueKey?: string;
}

interface QueuedHandler {
  handler: TaskHandler;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface TaskQueueOptions {
  isShuttingDown?: () => boolean;
}

/**
 * Wraps the RequestQueue with in-memory handler bookkeeping so we can keep
 * server.ts lean and focused on HTTP wiring.
 */
export class TaskQueueManager {
  private readonly queuedHandlers = new Map<string, QueuedHandler>();
  private isProcessing = false;

  constructor(
    private readonly requestQueue = new RequestQueue({ persistIntervalMs: 0 }),
    private readonly options: TaskQueueOptions = {}
  ) {}

  async enqueue(taskInfo: QueueTaskInfo, handler: TaskHandler): Promise<void> {
    const queuedTask = await this.requestQueue.addRequest({
      ...taskInfo,
      uniqueKey:
        taskInfo.uniqueKey ||
        `${taskInfo.type}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,
    });

    if (!queuedTask) {
      throw ScraperErrors.invalidConfiguration(
        "Task is already queued or was handled recently",
        { taskType: taskInfo.type }
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.queuedHandlers.set(queuedTask.id, { handler, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      let nextTask: RequestTask | null;
      while ((nextTask = this.requestQueue.fetchNextRequest())) {
        const entry = this.queuedHandlers.get(nextTask.id);
        if (!entry) {
          await this.requestQueue.markRequestHandled(nextTask);
          continue;
        }

        if (this.options.isShuttingDown?.()) {
          await this.requestQueue.markRequestHandled(nextTask);
          entry.reject(new Error("Server shutting down"));
          this.queuedHandlers.delete(nextTask.id);
          continue;
        }

        try {
          await entry.handler();
          await this.requestQueue.markRequestHandled(nextTask);
          entry.resolve();
        } catch (error) {
          await this.requestQueue.markRequestHandled(nextTask);
          entry.reject(error);
        } finally {
          this.queuedHandlers.delete(nextTask.id);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

