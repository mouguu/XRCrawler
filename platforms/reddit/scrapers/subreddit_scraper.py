"""
Subreddit Scraper

Specialized scraper for subreddits with multi-strategy support.
"""

from typing import List, Tuple, Optional, Callable
from strategies.paginated import PaginatedStrategy
from strategies.time_range import TimeRangeStrategy
from strategies.search import SearchStrategy


class SubredditScraper:
    """Subreddit爬虫"""
    
    def __init__(self, session_manager, rate_controller):
        self.session_manager = session_manager
        self.rate_controller = rate_controller
        self.paginated_strategy = PaginatedStrategy(session_manager, rate_controller)
        self.time_range_strategy = TimeRangeStrategy(session_manager, rate_controller)
        self.search_strategy = SearchStrategy(session_manager, rate_controller)
    
    def fetch_subreddit_posts(
        self,
        subreddit: str,
        max_posts: int,
        sort_type: str = 'hot',
        progress_callback: Optional[Callable] = None,
        keywords: Optional[List[str]] = None
    ) -> List[Tuple[str, str]]:
        """
        Fetch posts from a subreddit with optional multi-strategy approach
        
        Args:
            subreddit: Subreddit name
            max_posts: Maximum posts to fetch
            sort_type: Sort type (hot/new/top/best/rising)
            progress_callback: Progress callback
            keywords: Optional keywords for search strategy
            
        Returns:
            List of (post_url, post_id) tuples
        """
        print(f"📰 抓取 subreddit: r/{subreddit}")
        
        all_post_urls = []
        collected_ids = set()
        
        # Strategy 1: Primary sort method
        print(f"🔄 策略1: {sort_type} 排序...")
        primary_posts = self.paginated_strategy.fetch_posts(
            target=subreddit,
            max_posts=max_posts,
            progress_callback=progress_callback,
            sort_type=sort_type,
            is_user_mode=False
        )
        
        for post_url, post_id in primary_posts:
            if post_id not in collected_ids:
                all_post_urls.append((post_url, post_id))
                collected_ids.add(post_id)
        
        # If we didn't get enough, try other strategies
        if len(all_post_urls) < max_posts:
            remaining = max_posts - len(all_post_urls)
            print(f"⚠️ 需要更多帖子，还需 {remaining} 个")
            
            # Strategy 2: Time range strategy (for 'top' posts)
            if sort_type != 'top':
                print(f"🔄 策略2: 时间范围 top...")
                time_range_posts = self.time_range_strategy.fetch_posts(
                    target=subreddit,
                    max_posts=remaining,
                    progress_callback=progress_callback,
                    time_ranges=['week', 'month', 'year'],
                    is_user_mode=False
                )
                
                for post_url, post_id in time_range_posts:
                    if post_id not in collected_ids:
                        all_post_urls.append((post_url, post_id))
                        collected_ids.add(post_id)
                        if len(all_post_urls) >= max_posts:
                            break
            
            # Strategy 3: Keyword search (if keywords provided)
            if keywords and len(all_post_urls) < max_posts:
                remaining = max_posts - len(all_post_urls)
                print(f"🔄 策略3: 关键词搜索...")
                search_posts = self.search_strategy.fetch_posts(
                    target=subreddit,
                    max_posts=remaining,
                    progress_callback=progress_callback,
                    keywords=keywords
                )
                
                for post_url, post_id in search_posts:
                    if post_id not in collected_ids:
                        all_post_urls.append((post_url, post_id))
                        collected_ids.add(post_id)
                        if len(all_post_urls) >= max_posts:
                            break
        
        print(f"✅ 总共获取 {len(all_post_urls)} 个帖子")
        return all_post_urls
