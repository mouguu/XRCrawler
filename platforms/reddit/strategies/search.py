"""
Search Strategy

Keyword-based search across Reddit (generic, not subreddit-specific).
"""

import time
from typing import List, Tuple, Optional, Callable
from .base import ScrapingStrategy


class SearchStrategy(ScrapingStrategy):
    """关键词搜索策略"""
    
    def fetch_posts(
        self,
        target: str,
        max_posts: int,
        progress_callback: Optional[Callable] = None,
        keywords: Optional[List[str]] = None
    ) -> List[Tuple[str, str]]:
        """
        Fetch posts using keyword search
        
        Args:
            target: Subreddit name to search within
            max_posts: Maximum posts to fetch
            progress_callback: Progress callback
            keywords: List of keywords to search for
            
        Returns:
            List of (post_url, post_id) tuples
        """
        if not keywords:
            print("⚠️ 没有提供关键词，跳过搜索策略")
            return []
        
        post_urls = []
        all_found_posts = set()
        posts_per_keyword = max(1, max_posts // len(keywords))

        print(f"  📊 开始搜索 {len(keywords)} 个关键词...")

        if self.rate_controller.should_skip_strategy():
            print(f"  🛑 速率控制建议跳过关键词搜索")
            return []

        for i, keyword in enumerate(keywords, 1):
            if len(post_urls) >= max_posts:
                break

            if self.rate_controller.should_skip_strategy():
                print(f"  🛑 速率控制建议跳过剩余关键词")
                break

            try:
                search_url = f"https://www.reddit.com/r/{target}/search.json"
                params = {
                    'q': keyword,
                    'sort': 'relevance',
                    'limit': 100,
                    'restrict_sr': 1,
                    't': 'all'
                }

                if i % 10 == 0:
                    print(f"  📈 进度: {i}/{len(keywords)}，已找到 {len(post_urls)} 个")

                time.sleep(self.rate_controller.get_delay() * 2)
                response = self.session.get_session().get(search_url, params=params, timeout=30)

                if response.status_code == 200:
                    self.rate_controller.record_success()
                    data = response.json()
                    posts = data['data']['children']

                    keyword_new = 0
                    for post in posts:
                        if len(post_urls) >= max_posts:
                            break

                        post_data = post['data']
                        post_id = post_data['id']

                        if post_id not in all_found_posts:
                            post_url = f"https://www.reddit.com{post_data['permalink']}"
                            post_urls.append((post_url, post_id))
                            all_found_posts.add(post_id)
                            keyword_new += 1

                    if keyword_new > 0:
                        print(f"  🔎 {keyword}: +{keyword_new}")

                elif response.status_code == 429:
                    print(f"  ✗ {keyword}: 搜索限流")
                    self._handle_rate_limit()
                else:
                    self.rate_controller.record_other_error()
                    print(f"  ✗ {keyword}: 失败 ({response.status_code})")

            except Exception as e:
                self.rate_controller.record_other_error()
                print(f"  ✗ {keyword}: 出错 ({e})")
                continue

        print(f"  📊 关键词搜索完成: 找到 {len(post_urls)} 个帖子")
        return post_urls
