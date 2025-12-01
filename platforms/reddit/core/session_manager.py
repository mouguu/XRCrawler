"""
HTTP Session Manager for Reddit Scraping

Handles User-Agent rotation, session management, and anti-bot headers.
"""

import random
import requests


class SessionManager:
    """管理HTTP会话、User-Agent轮换和请求头"""
    
    # User-Agent轮换池 - 真实浏览器
    USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ]
    
    def __init__(self):
        self.session = None
        self.headers = {}
        self.create_session()
    
    def create_session(self):
        """创建新会话"""
        if self.session:
            self.session.close()
        
        self.session = requests.Session()
        self.headers = self._generate_headers()
        self.session.headers.update(self.headers)
        
    def _generate_headers(self):
        """生成随机化的请求头"""
        return {
            'User-Agent': random.choice(self.USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': random.choice(['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'en-CA,en;q=0.7']),
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': random.choice(['max-age=0', 'no-cache']),
            'Sec-Ch-Ua': random.choice([
                '"Google Chrome";v="120", "Chromium";v="120", "Not_A Brand";v="24"',
                '"Microsoft Edge";v="120", "Chromium";v="120", "Not_A Brand";v="24"'
            ]),
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': random.choice(['"Windows"', '"macOS"', '"Linux"'])
        }
    
    def refresh_session(self):
        """刷新会话和User-Agent"""
        self.create_session()
        print(f"🔄 已刷新会话和User-Agent (更真实的浏览器模拟)")
    
    def get_session(self):
        """获取当前会话"""
        return self.session
