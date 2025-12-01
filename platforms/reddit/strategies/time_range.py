"""
Time Range Strategy

Fetch posts filtered by different time ranges.
"""

import time
from typing import List, Tuple, Optional, Callable
from .base import ScrapingStrategy


class TimeRangeStrategy(ScrapingStrategy):
    """时间范围抓取策略"""
    
    def fetch_posts(
        self,
        target: str,
        max_posts: int,
        progress_callback: Optional[Callable] = None,
        time_ranges: Optional[List[str]] = None,
        is_user_mode: bool = False
    ) -> List[Tuple[str, str]]:
        """
        Fetch posts using different time ranges
        
        Args:
            target: Subreddit name or username
            max_posts: Maximum posts to fetch
            progress_callback: Progress callback
            time_ranges: List of time ranges (day/week/month/year/all)
            is_user_mode: Whether scraping a user profile
            
        Returns:
            List of (post_url, post_id) tuples
        """
        if not time_ranges:
            time_ranges = ['day', 'week', 'month', 'year', 'all']
        
        post_urls = []
        collected_ids = set()
        
        for time_range in time_ranges:
            if len(post_urls) >= max_posts:
                break

            print(f"  📅 获取 top({time_range}) 帖子...")
            remaining = max(100, max_posts - len(post_urls))
            
            # Use paginated strategy for each time range
            from .paginated import PaginatedStrategy
            paginated = PaginatedStrategy(self.session, self.rate_controller)
            
            batch_posts = paginated.fetch_posts(
                target=target,
                max_posts=min(remaining, 1000),
                progress_callback=progress_callback,
                sort_type='top',
                time_filter=time_range,
                is_user_mode=is_user_mode
            )

            # Deduplicate
            batch_new = []
            for post_url, post_id in batch_posts:
                if post_id not in collected_ids:
                    batch_new.append((post_url, post_id))
                    collected_ids.add(post_id)

            post_urls.extend(batch_new)
            print(f"    ✅ top({time_range}) 新增 {len(batch_new)} 个帖子")

        return post_urls
