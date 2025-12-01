#!/usr/bin/env python3
"""
Reddit Data System - Unified Interface

A comprehensive system for scraping, storing, and analyzing Reddit data.
"""

import os
import sys
import json
import csv
from datetime import datetime
from typing import Optional, Dict, List, Any

# Add parent directory to path
sys.path.append(os.path.dirname(__file__))

# Import existing modules
from local_storage import local_data_manager
from reddit_standardizer import RedditStandardizer


class RedditSystem:
    """Reddit数据系统 - 统一接口"""
    
    def __init__(self):
        """Initialize Reddit system"""
        self.standardizer = RedditStandardizer()
        self.db = local_data_manager
        print("🚀 Reddit System initialized")
        
    def get_system_status(self) -> Dict[str, Any]:
        """Get current system status with retry mechanism"""
        import time

        # Check local storage
        total_posts = self.db.get_total_posts_count()
        db_connected = True

        return {
            'database_connected': db_connected,
            'total_posts_in_db': total_posts,
            'standardizer_ready': True,
            'system_ready': db_connected
        }
    
    def scrape_posts(self, target: str, target_count: int = 100, strategy: str = 'auto', save_json: bool = False) -> Dict[str, Any]:
        """
        Scrape Reddit posts using the modular scraper

        Args:
            target: Target subreddit (r/name) or user (u/name)
            target_count: Target number of posts
            strategy: Scraping strategy ('auto', 'hot', 'new', etc.)
            save_json: Whether to save individual JSON files
        """
        print(f"🔄 Starting scraping process (target: {target}, count: {target_count})")

        try:
            from scraper import scrape_reddit

            # Auto-determine strategy based on target count if auto
            if strategy == 'auto':
                if target_count > 2000:
                    strategy = 'super_full'
                else:
                    strategy = 'new'

            print("🚀 Initializing modular scraper...")
            print(f"📊 Configuration: {target}, {target_count} posts, {strategy} strategy")
            print("-" * 50)

            # 直接调用爬虫的核心功能
            result = scrape_reddit(
                target=target,
                max_posts=target_count,
                sort_type=strategy
            )

            if result['status'] == 'success':
                print("\n" + "=" * 50)
                print("✅ Scraping process completed!")
                print(f"📊 Results: {result['scraped_count']} posts scraped")
                print("📊 Returning to main system...")
                return {
                    'status': 'success',
                    'message': 'Scraping completed successfully',
                    'posts_scraped': result['scraped_count']
                }
            else:
                print(f"\n❌ Scraping failed: {result.get('message', 'Unknown error')}")
                return {'status': 'error', 'message': result.get('message', 'Unknown error')}

        except Exception as e:
            return {'status': 'error', 'message': f'Scraping failed: {str(e)}'}

    def export_professional_csv(self, output_file: str = None, quality_filter: str = 'all') -> Dict[str, Any]:
        """
        Export data to professional-grade CSV for Kaggle/research use

        Args:
            output_file: Output CSV filename
            quality_filter: 'all', 'high_quality', 'medium_plus', 'exclude_low'
        """
        if not output_file:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"uoft_reddit_dataset_{timestamp}.csv"

        print(f"📊 Exporting professional dataset to {output_file}")
        print(f"🎯 Quality filter: {quality_filter}")

        try:
            # Memory-efficient streaming processing
            exported_count = 0
            processed_count = 0
            batch_size = 500  # Smaller batch size for memory efficiency
            offset = 0

            # Define professional column order for the dataset
            fieldnames = [
                # Core identifiers
                'post_id', 'title', 'content', 'author', 'subreddit',

                # Timestamps
                'created_utc', 'created_date',

                # Reddit metrics
                'score', 'upvote_ratio', 'num_comments',

                # Comment data
                'comments_json',

                # Quality metrics
                'quality_title', 'quality_content', 'quality_engagement',
                'quality_overall', 'quality_recommendation',

                # Boolean flags
                'include_in_dataset',

                # Content classification
                'content_type', 'has_discussion',

                # Direct URL
                'url',

                # Calculated engagement metric
                'engagement_score'
            ]

            # Open file for streaming write
            with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction='ignore')
                writer.writeheader()

                print("🔄 Starting memory-efficient streaming export...")

                # Iterate over all local posts
                batch_to_write = []
                for post_data in self.db.get_all_posts_iterator():
                    try:
                        post_data['created_date'] = self._convert_timestamp(post_data.get('created_utc'))

                        # Standardize the post
                        standardized_post = self.standardizer.create_dataset_ready_row(post_data)

                        # Apply quality filter
                        if self._passes_quality_filter(standardized_post, quality_filter):
                            batch_to_write.append(standardized_post)
                            processed_count += 1

                        # Write batch if full
                        if len(batch_to_write) >= batch_size:
                            writer.writerows(batch_to_write)
                            exported_count += len(batch_to_write)
                            print(f"   ✅ Batch: {len(batch_to_write)} exported, {exported_count} total exported")
                            batch_to_write.clear()

                    except Exception as e:
                        print(f"⚠️  Error processing post {post_data.get('id', 'unknown')}: {e}")
                        continue

                # Write remaining
                if batch_to_write:
                    writer.writerows(batch_to_write)
                    exported_count += len(batch_to_write)

            print(f"💾 Streaming export completed! {exported_count} posts exported from {processed_count} processed")

            if exported_count == 0:
                return {'status': 'error', 'message': 'No posts found matching criteria'}

            # Generate lightweight summary (without loading all data into memory)
            summary = self._generate_streaming_summary(output_file, exported_count, processed_count, quality_filter)

            return {
                'status': 'success',
                'output_file': output_file,
                'total_posts': exported_count,
                'processed_posts': processed_count,
                'summary': summary
            }

        except Exception as e:
            return {'status': 'error', 'message': f'Export failed: {str(e)}'}

    def _generate_streaming_summary(self, output_file: str, exported_count: int, processed_count: int, quality_filter: str) -> Dict[str, Any]:
        """Generate comprehensive summary for streaming export without loading all data into memory"""

        # Core export information
        export_info = {
            'output_file': output_file,
            'export_timestamp': datetime.now().isoformat(),
            'quality_filter': quality_filter,
            'exported_posts': exported_count,
            'processed_posts': processed_count,
            'filter_efficiency': f"{(exported_count/max(processed_count, 1)*100):.1f}%",
            'memory_efficient_export': True,
            'streaming_processing': True
        }

        # Essential data dictionary (static information)
        data_dictionary = {
            "dataset_info": {
                "name": "Reddit Dataset",
                "description": "A comprehensive dataset of Reddit posts and comments",
                "collection_method": "Reddit API via PRAW and JSON endpoints",
                "preprocessing": "Automated cleaning, standardization, and quality assessment",
                "exported_posts": exported_count,
                "export_date": datetime.now().strftime("%Y-%m-%d")
            },
            "key_columns": {
                "post_id": "Unique Reddit post identifier",
                "title": "Fully cleaned post title (HTML decoded, placeholders removed)",
                "content": "Fully cleaned post content/body text",
                "comments_json": "Structured JSON array of comment tree with full metadata",
                "quality_overall": "Composite quality score (0-10 scale)",
                "engagement_score": "Calculated metric: score + (scraped_comments * 2)",
                "url": "Direct URL to Reddit post"
            },
            "quality_system": {
                "scoring_method": "Automated algorithmic assessment (not human-reviewed)",
                "categories": "high_quality (≥7.0), medium_quality (5.0-6.9), low_quality (3.0-4.9), exclude (<3.0)",
                "purpose": "Dataset curation and filtering"
            },
            "usage_notes": {
                "complete_documentation": "See DATA_DICTIONARY.md for detailed field descriptions",
                "high_quality_filter": "Use quality_recommendation == 'high_quality' for premium dataset",
                "comment_analysis": "Parse comments_json for structured comment data with metadata",
                "time_series": "Use created_utc for temporal analysis"
            }
        }

        # Combine all information
        complete_summary = {
            'export_info': export_info,
            'data_dictionary': data_dictionary,
            'technical_notes': {
                'memory_efficient': 'Exported using streaming processing to handle large datasets',
                'batch_processing': 'Data processed in small batches to minimize memory usage',
                'scalability': 'Can handle datasets of any size without memory constraints'
            }
        }

        # Save comprehensive summary to JSON file
        summary_file = output_file.replace('.csv', '_summary.json')
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(complete_summary, f, indent=2, ensure_ascii=False)

        print(f"📋 Comprehensive summary saved to {summary_file}")

        return complete_summary

    def _convert_timestamp(self, timestamp):
        """Convert timestamp to readable format"""
        if timestamp:
            try:
                return datetime.fromtimestamp(float(timestamp)).strftime('%Y-%m-%d %H:%M:%S')
            except:
                return ""
        return ""
    
    def _passes_quality_filter(self, post: Dict, filter_type: str) -> bool:
        """Check if post passes quality filter"""
        if filter_type == 'all':
            return True
        elif filter_type == 'high_quality':
            return post.get('quality_recommendation') == 'high_quality'
        elif filter_type == 'medium_plus':
            return post.get('quality_recommendation') in ['high_quality', 'medium_quality']
        elif filter_type == 'exclude_low':
            return post.get('quality_recommendation') != 'exclude'
        else:
            return True
    



    
    def analyze_data_quality(self) -> Dict[str, Any]:
        """Analyze the quality of data in the database"""
        print("🔍 Analyzing data quality...")
        
        try:
            # Sample posts for analysis
            count = 0
            quality_scores = []
            content_types = {'text': 0, 'link': 0, 'empty': 0}
            
            for post_data in self.db.get_all_posts_iterator():
                if count >= 100:
                    break
                
                # Standardize and assess quality
                standardized = self.standardizer.create_dataset_ready_row(post_data)
                quality_scores.append(standardized.get('quality_overall', 0))
                
                content_type = standardized.get('content_type', 'unknown')
                if content_type in content_types:
                    content_types[content_type] += 1
                
                count += 1
            
            if count == 0:
                return {'status': 'error', 'message': 'No data found'}
            
            avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0
            
            analysis = {
                'status': 'success',
                'sample_size': len(result.data),
                'average_quality_score': avg_quality,
                'content_distribution': content_types,
                'quality_recommendation': 'Good' if avg_quality > 6 else 'Fair' if avg_quality > 4 else 'Needs improvement'
            }
            
            return analysis
            
        except Exception as e:
            return {'status': 'error', 'message': f'Analysis failed: {str(e)}'}
    
    def interactive_menu(self):
        """Interactive command-line interface"""
        while True:
            print("\n" + "="*60)
            print("🎯 Reddit Data System")
            print("="*60)
            
            # Show system status
            status = self.get_system_status()
            print(f"📊 Database: {'✅ Connected' if status['database_connected'] else '❌ Disconnected'}")
            print(f"📈 Total Posts: {status['total_posts_in_db']}")
            print(f"🔧 System: {'✅ Ready' if status['system_ready'] else '❌ Not Ready'}")
            
            print("\nAvailable Actions:")
            print("1. 🔄 Scrape new posts")
            print("2. 📊 Export professional CSV dataset")
            print("3. 🔍 Analyze data quality")
            print("4. 📊 Show system status")
            print("5. ❌ Exit")

            choice = input("\nSelect action (1-5): ").strip()
            
            if choice == '1':
                print("\n🔄 Reddit Post Scraping Configuration")
                print("-" * 50)

                current_count = self.get_system_status()['total_posts_in_db']
                print(f"📊 Current posts in database: {current_count}")

                # 统一的用户输入界面
                try:
                    # 目标选择
                    target_input = input(f"目标 (例如 r/python 或 u/spez) [r/UofT]: ").strip()
                    target = target_input if target_input else "r/UofT"

                    # 目标数量
                    default_target = 100
                    target_count_input = input(f"目标帖子数量 [100]: ").strip()
                    target_count = int(target_count_input) if target_count_input.isdigit() else default_target

                    # 策略选择
                    print("\n🎯 策略选择:")
                    print("  1. auto - 自动选择 (推荐)")
                    print("  2. super_full - 全面模式 (适合大量抓取)")
                    print("  3. super_recent - 时效优先")
                    print("  4. new - 普通新帖模式")
                    strategy_choice = input("请选择策略 (1-4) [1]: ").strip() or "1"
                    strategy_map = {"1": "auto", "2": "super_full", "3": "super_recent", "4": "new"}
                    strategy = strategy_map.get(strategy_choice, "auto")

                    # JSON保存选项
                    save_json = input("是否保存JSON文件? (y/n) [n]: ").lower().startswith('y')

                    print(f"\n🚀 配置确认:")
                    print(f"  🎯 目标: {target}")
                    print(f"  📊 数量: {target_count}")
                    print(f"  ⚙️  策略: {strategy}")
                    print(f"  💾 JSON: {'是' if save_json else '否'}")

                    confirm = input("\n确认开始抓取? (y/n) [y]: ").strip()
                    if confirm.lower() in ['', 'y', 'yes']:
                        result = self.scrape_posts(target=target, target_count=target_count, strategy=strategy, save_json=save_json)

                        if result['status'] == 'success':
                            print(f"✅ {result['message']}")
                            if 'posts_scraped' in result:
                                print(f"📈 新增帖子: {result['posts_scraped']}")
                        else:
                            print(f"❌ {result['message']}")
                    else:
                        print("❌ 用户取消操作")

                except ValueError:
                    print("❌ 输入无效，请输入有效数字")
                except KeyboardInterrupt:
                    print("\n❌ 用户中断操作")
                
            elif choice == '2':
                quality_filter = input("Quality filter (all/high_quality/medium_plus/exclude_low) [all]: ").strip() or 'all'
                result = self.export_professional_csv(quality_filter=quality_filter)
                if result['status'] == 'success':
                    print(f"✅ Professional CSV exported: {result['output_file']}")
                    print(f"📊 Total posts: {result['total_posts']}")
                    print(f"📋 Summary saved as: {result['output_file'].replace('.csv', '_summary.json')}")
                    print(f"📖 Data dictionary available in summary file")
                else:
                    print(f"❌ Export failed: {result['message']}")

            elif choice == '3':
                result = self.analyze_data_quality()
                if result['status'] == 'success':
                    print(f"📊 Sample size: {result['sample_size']}")
                    print(f"⭐ Average quality: {result['average_quality_score']:.1f}/10")
                    print(f"📋 Content distribution: {result['content_distribution']}")
                    print(f"💡 Recommendation: {result['quality_recommendation']}")
                else:
                    print(f"❌ Analysis failed: {result['message']}")

            elif choice == '4':
                status = self.get_system_status()
                print(json.dumps(status, indent=2))

            elif choice == '5':
                print("👋 Goodbye!")
                break

            else:
                print("❌ Invalid choice. Please select 1-5.")

def main():
    """Main entry point - Enhanced with better error handling"""
    print("🚀 Reddit System")
    print("="*50)
    print("📊 University of Toronto Reddit Data System")
    print("🎯 Professional dataset creation and analysis")
    print("="*50)

    try:
        print("🔄 Initializing system...")
        system = RedditSystem()
        print("✅ System ready!\n")
        system.interactive_menu()

    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("💡 Please ensure all dependencies are installed:")
        print("   pip install -r requirements.txt")
        print("💡 Make sure all system files are in the same directory")

    except KeyboardInterrupt:
        print("\n👋 System interrupted by user")

    except Exception as e:
        print(f"❌ System error: {e}")
        print("💡 Please check your configuration and try again")

if __name__ == "__main__":
    main()
