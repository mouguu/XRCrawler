"""
Reddit Scraper - Simplified Main Class

General-purpose Reddit scraper with modular architecture.
Replaces the bloated EnhancedUofTScraper.
"""

import re
import time
from typing import Dict, List, Any, Optional, Callable
from datetime import datetime

from core.rate_limiter import SmartRateController
from core.session_manager import SessionManager
from scrapers.user_scraper import UserScraper
from scrapers.subreddit_scraper import SubredditScraper
from local_storage import local_data_manager
from post_scraper import RedditPostScraper as PostScraper


class RedditScraper:
    """Reddit通用爬虫 - 简化版"""
    
    def __init__(self, target: str):
        """
        Initialize Reddit scraper
        
        Args:
            target: Either a subreddit name (r/subreddit) or user (u/username)
                   Can be URL, shorthand (r/python), or just the name
        """
        # Parse target to determine mode
        self.is_user_mode = False
        self.target_name = target
        
        # Handle full URLs
        if "reddit.com" in target:
            if "/user/" in target:
                self.is_user_mode = True
                parts = target.split("/user/")
                if len(parts) > 1:
                    self.target_name = parts[1].split("/")[0]
            elif "/r/" in target:
                self.is_user_mode = False
                parts = target.split("/r/")
                if len(parts) > 1:
                    self.target_name = parts[1].split("/")[0]
        # Handle "u/Username" or "r/Subreddit" format
        elif target.startswith("u/") or target.startswith("user/"):
            self.is_user_mode = True
            self.target_name = target.split("/")[-1]
        elif target.startswith("r/"):
            self.is_user_mode = False
            self.target_name = target.split("/")[-1]
            
        print(f"🎯 目标: {'用户' if self.is_user_mode else 'Subreddit'} {self.target_name}")
        
        # Initialize core components
        self.rate_controller = SmartRateController()
        self.session_manager = SessionManager()
        
        # Initialize scrapers
        self.user_scraper = UserScraper(self.session_manager, self.rate_controller)
        self.subreddit_scraper = SubredditScraper(self.session_manager, self.rate_controller)
        self.post_scraper = PostScraper()
        
        # Counters
        self.scraped_count = 0
        self.skipped_count = 0
        self.error_count = 0
    
    def scrape(
        self,
        max_posts: int = 100,
        sort_type: str = 'hot',
        keywords: Optional[List[str]] = None,
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Main scraping method
        
        Args:
            max_posts: Maximum number of posts to scrape
            sort_type: Sort type (hot/new/top/best/rising)
            keywords: Optional keywords for search strategy
            progress_callback: Progress callback function
            
        Returns:
            Dict with scraping results
        """
        print(f"🚀 开始 Reddit 爬取")
        print(f"📊 目标: {max_posts} 个帖子")
        print("=" * 60)
        
        start_time = time.time()
        
        # Step 1: Fetch post URLs
        if self.is_user_mode:
            post_urls = self.user_scraper.fetch_user_posts(
                username=self.target_name,
                max_posts=max_posts,
                progress_callback=progress_callback
            )
        else:
            post_urls = self.subreddit_scraper.fetch_subreddit_posts(
                subreddit=self.target_name,
                max_posts=max_posts,
                sort_type=sort_type,
                progress_callback=progress_callback,
                keywords=keywords
            )
        
        if not post_urls:
            print("❌ 没有获取到帖子URL")
            return {'status': 'error', 'message': 'No posts found'}
        
        print(f"\n📊 获取到 {len(post_urls)} 个候选帖子URL")
        
        # Step 2: Filter already scraped posts
        print("🔍 过滤已存在的帖子...")
        post_urls = self._filter_existing_posts(post_urls)
        print(f"✅ 去重后剩余 {len(post_urls)} 个新帖子")
        
        if len(post_urls) == 0:
            print("⚠️ 所有帖子都已存在于数据库中")
            return {'status': 'success', 'scraped_count': 0, 'message': 'All posts already scraped'}
        
        # Step 3: Scrape post details
        print(f"\n🎯 开始抓取 {len(post_urls)} 个帖子...")
        print("=" * 60)
        
        scraped_posts = []
        for i, (post_url, post_id) in enumerate(post_urls, 1):
            if self.scraped_count >= max_posts:
                print(f"\n🎉 已达到目标！停止处理")
                break
            
            print(f"\n[{i}/{len(post_urls)}] 处理帖子: {post_id}")
            
            result = self.post_scraper.scrape_post(post_url)
            
            if result and result.get('status') == 'success':
                # Extract post and comments from the result
                post_data = result['post']
                post_data['comments'] = result['comments']  # Add comments to post data
                
                scraped_posts.append(post_data)
                self.scraped_count += 1
                
                # Save to database
                if local_data_manager.save_post(post_data):
                    print(f"✅ {post_data['title'][:50]}...")
                    print(f"    👤 作者: {post_data['author']} | 📈 分数: {post_data['score']} | 💬 评论: {len(post_data['comments'])}")
                else:
                    print(f"❌ 保存失败")
                
                if progress_callback:
                    try:
                        progress_callback(self.scraped_count, max_posts, f"Scraped: {post_data['title'][:30]}...")
                    except:
                        pass
            
            # Rate limiting
            if i < len(post_urls):
                delay = self.rate_controller.get_delay()
                time.sleep(delay)
        
        # Print final stats
        elapsed_time = time.time() - start_time
        print("\n" + "=" * 60)
        print("🎉 爬取完成！")
        print("=" * 60)
        print(f"📊 统计信息:")
        print(f"   ✅ 成功抓取: {self.scraped_count} 个帖子")
        print(f"   ⏱️  总耗时: {elapsed_time/60:.1f} 分钟")
        print(f"   ⚡ 平均速度: {elapsed_time/max(1, self.scraped_count):.1f} 秒/帖")
        print(f"   🗄️  数据库总帖子数: {local_data_manager.get_posts_count()}")
        print("=" * 60)
        
        # Auto-export to Markdown with user comment filter
        print("\n📝 自动导出Markdown...")
        try:
            from export_to_markdown import export_to_markdown
            json_dir = local_data_manager.json_dir
            export_file = local_data_manager.current_session_dir + "/posts_export_filtered.md"
            
            # Extract username from target_name
            username = self.target_name
            
            export_to_markdown(json_dir, export_file, filter_username=username)
            print(f"✅ 已导出过滤版本（只包含 u/{username} 的评论）")
            print(f"📄 文件位置: {export_file}")
        except Exception as e:
            print(f"⚠️ 导出失败: {e}")
        
        return {
            'status': 'success',
            'scraped_count': self.scraped_count,
            'total_posts_in_db': local_data_manager.get_posts_count(),
            'elapsed_time': elapsed_time
        }
    
    def _filter_existing_posts(self, post_urls: List[Tuple[str, str]], batch_size: int = 100) -> List[Tuple[str, str]]:
        """Filter out posts that already exist in database"""
        new_posts = []
        
        for i in range(0, len(post_urls), batch_size):
            batch = post_urls[i:i + batch_size]
            post_ids = [post_id for _, post_id in batch]
            
            existing_ids = set()
            for post_id in post_ids:
                if local_data_manager.check_post_exists(post_id):
                    existing_ids.add(post_id)
            
            for post_url, post_id in batch:
                if post_id not in existing_ids:
                    new_posts.append((post_url, post_id))
        
        return new_posts


# Module-level convenience function for easy integration
def scrape_reddit(
    target: str,
    max_posts: int = 100,
    sort_type: str = 'hot',
    keywords: Optional[List[str]] = None,
    progress_callback: Optional[Callable] = None
) -> Dict[str, Any]:
    """
    Convenience function to scrape Reddit
    
    Args:
        target: Subreddit or user to scrape (r/python or u/spez)
        max_posts: Maximum posts to scrape
        sort_type: Sort type
        keywords: Optional search keywords
        progress_callback: Progress callback
        
    Returns:
        Dict with scraping results
    """
    scraper = RedditScraper(target)
    return scraper.scrape(max_posts, sort_type, keywords, progress_callback)


if __name__ == "__main__":
    print("🤖 Reddit 通用爬虫")
    print("=" * 60)
    
    target = input("请输入目标 (r/subreddit 或 u/username): ").strip()
    max_posts = int(input("请输入要爬取的帖子数 (默认100): ") or "100")
    
    scraper = RedditScraper(target)
    result = scraper.scrape(max_posts=max_posts)
    
    print(f"\n最终结果: {result}")
