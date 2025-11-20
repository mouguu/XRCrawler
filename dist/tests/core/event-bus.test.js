"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_bus_1 = require("../../core/event-bus");
describe('ScraperEventBus', () => {
    let eventBus;
    beforeEach(() => {
        eventBus = new event_bus_1.ScraperEventBus();
    });
    test('should emit progress events', (done) => {
        const progressData = { current: 10, target: 100, action: 'scraping' };
        eventBus.on('scrape:progress', (data) => {
            expect(data).toEqual(progressData);
            done();
        });
        eventBus.emitProgress(progressData);
    });
    test('should emit log messages', (done) => {
        eventBus.on('log:message', (data) => {
            expect(data.message).toBe('Test message');
            expect(data.level).toBe('info');
            expect(data.timestamp).toBeInstanceOf(Date);
            done();
        });
        eventBus.emitLog('Test message', 'info');
    });
});
