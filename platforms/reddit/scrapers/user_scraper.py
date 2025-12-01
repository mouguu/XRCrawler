"""
User Profile Scraper

Specialized scraper for Reddit user profiles.
"""

from typing import List, Tuple, Optional, Callable
from strategies.paginated import PaginatedStrategy


class UserScraper:
    """用户资料爬虫"""
    
    def __init__(self, session_manager, rate_controller):
        self.session_manager = session_manager
        self.rate_controller = rate_controller
        self.paginated_strategy = PaginatedStrategy(session_manager, rate_controller)
    
    def fetch_user_posts(
        self,
        username: str,
        max_posts: int,
        progress_callback: Optional[Callable] = None
    ) -> List[Tuple[str, str]]:
        """
        Fetch posts from a user's profile (/user/USERNAME/overview.json)
        
        Args:
            username: Reddit username
            max_posts: Maximum posts to fetch
            progress_callback: Progress callback
            
        Returns:
            List of (post_url, post_id) tuples
        """
        print(f"👤 抓取用户资料: u/{username}")
        
        # User profiles use 'new' sort by default
        post_urls = self.paginated_strategy.fetch_posts(
            target=username,
            max_posts=max_posts,
            progress_callback=progress_callback,
            sort_type='new',
            is_user_mode=True
        )
        
        # User profiles are often smaller, note if we got everything
        if len(post_urls) < max_posts:
            print(f"ℹ️ 用户资料已全部获取完毕 (共 {len(post_urls)} 条)")
        
        return post_urls
