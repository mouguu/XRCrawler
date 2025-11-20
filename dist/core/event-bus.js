"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperEventBus = void 0;
const events_1 = require("events");
class ScraperEventBus extends events_1.EventEmitter {
    constructor() {
        super();
        this.events = {
            SCRAPE_PROGRESS: 'scrape:progress',
            SCRAPE_COMPLETE: 'scrape:complete',
            SCRAPE_ERROR: 'scrape:error',
            LOG_MESSAGE: 'log:message'
        };
    }
    emitProgress(data) {
        this.emit(this.events.SCRAPE_PROGRESS, data);
    }
    emitComplete(data) {
        this.emit(this.events.SCRAPE_COMPLETE, data);
    }
    emitError(error) {
        this.emit(this.events.SCRAPE_ERROR, error);
    }
    emitLog(message, level = 'info') {
        this.emit(this.events.LOG_MESSAGE, { message, level, timestamp: new Date() });
    }
}
exports.ScraperEventBus = ScraperEventBus;
exports.default = new ScraperEventBus();
