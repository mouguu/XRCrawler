/**
 * ProxyManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProxyManager } from '../../core/proxy-manager';
import { ScraperEventBus } from '../../core/event-bus';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ProxyManager', () => {
  let testProxyDir: string;
  let manager: ProxyManager;
  let mockEventBus: Partial<ScraperEventBus>;

  beforeEach(() => {
    testProxyDir = path.join(os.tmpdir(), 'test-proxy-' + Date.now());
    fs.mkdirSync(testProxyDir, { recursive: true });
    
    mockEventBus = {
      emitLog: mock(() => {}),
      emitProgress: mock(() => {}),
      emitPerformance: mock(() => {}),
      on: mock(() => {}),
      off: mock(() => {})
    } as any;

    manager = new ProxyManager(testProxyDir, mockEventBus as ScraperEventBus);
  });

  afterEach(() => {
    try {
      fs.rmSync(testProxyDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('init', () => {
    it('should handle missing proxy directory', async () => {
      const managerWithoutDir = new ProxyManager('/non/existent/path');
      await managerWithoutDir.init();
      
      // Should not throw
    });

    it('should load proxies from file', async () => {
      const proxyFile = path.join(testProxyDir, 'proxies.txt');
      fs.writeFileSync(proxyFile, 'host1:port1:user1:pass1\nhost2:port2:user2:pass2');
      
      await manager.init();
      
      const proxies = manager.getAllActiveProxies();
      expect(proxies.length).toBe(2);
    });

    it('should handle invalid proxy format', async () => {
      const proxyFile = path.join(testProxyDir, 'proxies.txt');
      fs.writeFileSync(proxyFile, 'invalid-format');
      
      await manager.init();
      
      // Should handle gracefully
    });
  });

  describe('getProxyForSession', () => {
    it('should return null when no proxies available', () => {
      const proxy = manager.getProxyForSession('session1');
      expect(proxy).toBeNull();
    });

    it('should return proxy when available', async () => {
      const proxyFile = path.join(testProxyDir, 'proxies.txt');
      fs.writeFileSync(proxyFile, 'host1:8080:user1:pass1');
      
      await manager.init();
      
      const proxy = manager.getProxyForSession('session1');
      expect(proxy).toBeDefined();
      expect(proxy?.host).toBe('host1');
      expect(proxy?.port).toBe(8080);
    });

    it('should return same proxy for same session', async () => {
      const proxyFile = path.join(testProxyDir, 'proxies.txt');
      fs.writeFileSync(proxyFile, 'host1:8080:user1:pass1\nhost2:8080:user2:pass2');
      
      await manager.init();
      
      const proxy1 = manager.getProxyForSession('session1');
      const proxy2 = manager.getProxyForSession('session1');
      
      expect(proxy1?.id).toBe(proxy2?.id);
    });
  });

  describe('markProxyFailed', () => {
    it('should mark proxy as failed', async () => {
      const proxyFile = path.join(testProxyDir, 'proxies.txt');
      fs.writeFileSync(proxyFile, 'host1:8080:user1:pass1');
      
      await manager.init();
      const proxy = manager.getProxyForSession('session1');
      
      if (proxy) {
        manager.markProxyFailed(proxy.id, 'Test error');
        
        // Get proxy again to check error count
        const proxyAfter = manager.getProxyForSession('session1');
        expect(proxyAfter?.errorCount).toBeGreaterThan(0);
      }
    });
  });

  describe('markProxySuccess', () => {
    it('should reset consecutive failures on success', async () => {
      const proxyFile = path.join(testProxyDir, 'proxies.txt');
      fs.writeFileSync(proxyFile, 'host1:8080:user1:pass1');
      
      await manager.init();
      const proxy = manager.getProxyForSession('session1');
      
      if (proxy) {
        manager.markProxyFailed(proxy.id, 'Error');
        manager.markProxySuccess(proxy.id);
        
        const proxyAfter = manager.getProxyForSession('session1');
        expect(proxyAfter?.consecutiveFailures).toBe(0);
      }
    });
  });
});
