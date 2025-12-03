/**
 * BrowserManager 单元测试
 */

import { BrowserManager, BrowserLaunchOptions, ProxyConfig } from '../../core/browser-manager';
import { ScraperErrors } from '../../core/errors';
import puppeteer from 'puppeteer-extra';

// Mock puppeteer
jest.mock('puppeteer-extra', () => {
  const mockBrowser = {
    newPage: jest.fn(),
    close: jest.fn(),
    pages: jest.fn(() => [])
  };

  const mockPage = {
    setUserAgent: jest.fn(),
    setViewport: jest.fn(),
    setRequestInterception: jest.fn(),
    on: jest.fn(),
    authenticate: jest.fn(),
    close: jest.fn()
  };

  return {
    __esModule: true,
    default: {
      use: jest.fn(),
      launch: jest.fn().mockResolvedValue(mockBrowser)
    }
  };
});

describe('BrowserManager', () => {
  let browserManager: BrowserManager;
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(() => {
    browserManager = new BrowserManager();
    const mockCDPSession = {
      send: jest.fn().mockResolvedValue(undefined)
    };
    mockPage = {
      setUserAgent: jest.fn().mockResolvedValue(undefined),
      setViewport: jest.fn().mockResolvedValue(undefined),
      setRequestInterception: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      authenticate: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      target: jest.fn().mockReturnValue({
        createCDPSession: jest.fn().mockResolvedValue(mockCDPSession)
      })
    };
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
      pages: jest.fn(() => [mockPage])
    };
    (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with null browser and page', () => {
      const manager = new BrowserManager();
      expect(manager).toBeDefined();
    });
  });

  describe('init', () => {
    it('should launch browser with default options', async () => {
      await browserManager.init();

      expect(puppeteer.launch).toHaveBeenCalled();
      const launchOptions = (puppeteer.launch as jest.Mock).mock.calls[0][0];
      expect(launchOptions.headless).toBeDefined();
    });

    it('should launch browser with custom headless option', async () => {
      await browserManager.init({ headless: false });

      expect(puppeteer.launch).toHaveBeenCalled();
      const launchOptions = (puppeteer.launch as jest.Mock).mock.calls[0][0];
      expect(launchOptions.headless).toBe(false);
    });

    it('should launch browser with proxy', async () => {
      const proxyConfig: ProxyConfig = {
        host: 'proxy.example.com',
        port: 8080,
        username: 'user',
        password: 'pass'
      };

      await browserManager.init({ proxy: proxyConfig });

      expect(puppeteer.launch).toHaveBeenCalled();
      const launchOptions = (puppeteer.launch as jest.Mock).mock.calls[0][0];
      expect(launchOptions.args).toContain('--proxy-server=proxy.example.com:8080');
    });

    it('should handle launch errors', async () => {
      const error = new Error('Launch failed');
      (puppeteer.launch as jest.Mock).mockRejectedValueOnce(error);

      await expect(browserManager.init()).rejects.toThrow('Launch failed');
    });
  });

  describe('newPage', () => {
    it('should throw error if browser not initialized', async () => {
      await expect(browserManager.newPage()).rejects.toThrow();
    });

    it('should create new page after initialization', async () => {
      await browserManager.init();
      const page = await browserManager.newPage();

      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(page).toBe(mockPage);
    });

    it('should inject proxy authentication if provided', async () => {
      const proxyConfig: ProxyConfig = {
        host: 'proxy.example.com',
        port: 8080,
        username: 'user',
        password: 'pass'
      };

      await browserManager.init({ proxy: proxyConfig });
      await browserManager.newPage({ proxy: proxyConfig });

      expect(mockPage.authenticate).toHaveBeenCalledWith({
        username: 'user',
        password: 'pass'
      });
    });

    it('should set user agent if provided', async () => {
      await browserManager.init();
      await browserManager.newPage({ userAgent: 'Custom Agent' });

      expect(mockPage.setUserAgent).toHaveBeenCalledWith('Custom Agent');
    });

    it('should configure request interception if blockResources is true', async () => {
      await browserManager.init();
      await browserManager.newPage({ blockResources: true });

      expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
      expect(mockPage.on).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close browser if initialized', async () => {
      await browserManager.init();
      await browserManager.close();

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle close when browser not initialized', async () => {
      await expect(browserManager.close()).resolves.not.toThrow();
    });
  });

  describe('getPage', () => {
    it('should return current page if exists', async () => {
      await browserManager.init();
      await browserManager.newPage();
      const page = browserManager.getPage();

      expect(page).toBe(mockPage);
    });

    it('should throw error if no page created', async () => {
      await browserManager.init();
      
      expect(() => {
        browserManager.getPage();
      }).toThrow();
    });
  });

  describe('getBrowser', () => {
    it('should return browser if initialized', async () => {
      await browserManager.init();
      const browser = browserManager.getBrowser();

      expect(browser).toBe(mockBrowser);
    });

    it('should throw error if not initialized', () => {
      expect(() => {
        browserManager.getBrowser();
      }).toThrow();
    });
  });
});
