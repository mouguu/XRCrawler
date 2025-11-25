
import { RequestQueue, RequestTask } from '../../core/request-queue';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');

describe('RequestQueue', () => {
    let requestQueue: RequestQueue;
    const mockQueueDir = '/mock/queue';

    beforeEach(() => {
        jest.clearAllMocks();
        // Default fs mocks
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
        (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
        (fs.readFileSync as jest.Mock).mockReturnValue('[]');

        requestQueue = new RequestQueue({ queueDir: mockQueueDir, persistIntervalMs: 0 });
    });

    afterEach(() => {
        requestQueue.close();
    });

    describe('addRequest', () => {
        it('should add a task to the queue', async () => {
            const task = await requestQueue.addRequest({
                url: 'https://example.com',
                type: 'timeline',
                priority: 1
            });

            expect(task).toBeDefined();
            expect(task?.url).toBe('https://example.com');
            expect(requestQueue.isFinished()).toBe(false);
        });

        it('should deduplicate tasks', async () => {
            await requestQueue.addRequest({ url: 'https://example.com', type: 'timeline', priority: 1 });
            const duplicate = await requestQueue.addRequest({ url: 'https://example.com', type: 'timeline', priority: 1 });

            expect(duplicate).toBeNull();
        });

        it('should sort tasks by priority', async () => {
            await requestQueue.addRequest({ url: 'low', type: 'timeline', priority: 1 });
            await requestQueue.addRequest({ url: 'high', type: 'timeline', priority: 10 });

            const next = requestQueue.fetchNextRequest();
            expect(next?.url).toBe('high');
        });
    });

    describe('fetchNextRequest', () => {
        it('should return null if queue is empty', () => {
            expect(requestQueue.fetchNextRequest()).toBeNull();
        });

        it('should move task to inProgress', async () => {
            await requestQueue.addRequest({ url: 'test', type: 'timeline', priority: 1 });
            const task = requestQueue.fetchNextRequest();
            
            expect(task).toBeDefined();
            // isFinished is false because it's in progress
            expect(requestQueue.isFinished()).toBe(false);
        });
    });

    describe('markRequestHandled', () => {
        it('should mark task as handled and remove from inProgress', async () => {
            const task = await requestQueue.addRequest({ url: 'test', type: 'timeline', priority: 1 });
            if (!task) throw new Error('Task not added');
            
            requestQueue.fetchNextRequest(); // Move to inProgress
            await requestQueue.markRequestHandled(task);

            expect(requestQueue.isFinished()).toBe(true);
            
            // Should not be able to add again
            const retryAdd = await requestQueue.addRequest({ url: 'test', type: 'timeline', priority: 1 });
            expect(retryAdd).toBeNull();
        });
    });

    describe('reclaimRequest', () => {
        it('should retry failed task up to limit', async () => {
            const task = await requestQueue.addRequest({ url: 'test', type: 'timeline', priority: 1 });
            if (!task) throw new Error('Task not added');

            requestQueue.fetchNextRequest();
            await requestQueue.reclaimRequest(task);

            // Should be back in queue
            const retried = requestQueue.fetchNextRequest();
            expect(retried?.url).toBe('test');
            expect(retried?.retryCount).toBe(1);
        });

        it('should drop task after max retries', async () => {
            const task = await requestQueue.addRequest({ url: 'test', type: 'timeline', priority: 1 });
            if (!task) throw new Error('Task not added');
            task.retryCount = 3; // Max is 3

            requestQueue.fetchNextRequest();
            await requestQueue.reclaimRequest(task);

            // Should NOT be back in queue
            const retried = requestQueue.fetchNextRequest();
            expect(retried).toBeNull();
        });
    });
});
