#!/usr/bin/env python3
"""
Export Reddit scraped posts to Markdown format
将爬取的Reddit帖子导出为Markdown格式
"""

import os
import json
from datetime import datetime
from pathlib import Path

def export_to_markdown(json_dir: str, output_file: str = None, filter_username: str = None):
    """
    Export all Reddit posts to a single Markdown file
    
    If filter_username is provided, only comments from that user will be included
    
    Args:
        json_dir: Directory containing JSON files
        output_file: Output markdown file path (optional)
        filter_username: Only include comments from this username (optional)
    """
    json_path = Path(json_dir)
    
    if not json_path.exists():
        print(f"❌ Directory not found: {json_dir}")
        return
    
    # Get all JSON files
    json_files = sorted(json_path.glob("*.json"))
    
    if not json_files:
        print(f"❌ No JSON files found in {json_dir}")
        return
    
    # Default output file
    if not output_file:
        parent_dir = json_path.parent
        output_file = parent_dir / "posts_export.md"
    else:
        output_file = Path(output_file)
    
    print(f"📊 Found {len(json_files)} posts")
    print(f"📝 Exporting to: {output_file}")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        # Write header
        f.write("# Reddit Posts Export\n\n")
        f.write(f"**Export Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write(f"**Total Posts:** {len(json_files)}\n\n")
        if filter_username:
            f.write(f"**Comment Filter:** Only showing comments from u/{filter_username}\n\n")
        f.write("---\n\n")
        
        # Process each JSON file
        for idx, json_file in enumerate(json_files, 1):
            try:
                with open(json_file, 'r', encoding='utf-8') as jf:
                    data = json.load(jf)
                
                # Write post header
                f.write(f"## Post {idx}: {data.get('title', 'Untitled')}\n\n")
                
                # Write metadata
                f.write(f"**Post ID:** `{data.get('id', 'N/A')}`  \n")
                f.write(f"**Author:** u/{data.get('author', 'unknown')}  \n")
                f.write(f"**Subreddit:** r/{data.get('subreddit', 'unknown')}  \n")
                f.write(f"**Score:** {data.get('score', 0)} points  \n")
                f.write(f"**Comments:** {len(data.get('comments', []))}  \n")
                
                # Format date
                created_utc = data.get('created_utc', 0)
                if created_utc:
                    created_date = datetime.fromtimestamp(created_utc).strftime('%Y-%m-%d %H:%M:%S')
                    f.write(f"**Created:** {created_date}  \n")
                
                f.write(f"**URL:** {data.get('permalink', 'N/A')}  \n")
                
                if data.get('link_flair_text'):
                    f.write(f"**Flair:** {data['link_flair_text']}  \n")
                
                f.write("\n")
                
                # Write post content
                if data.get('selftext'):
                    f.write("### Post Content\n\n")
                    f.write(f"{data['selftext']}\n\n")
                
                # Write comments
                comments = data.get('comments', [])
                
                # Filter comments if username is specified
                if filter_username:
                    comments = [c for c in comments if c.get('author') == filter_username]
                
                if comments:
                    f.write(f"### Comments from u/{filter_username if filter_username else 'All Users'} ({len(comments)})\n\n")
                    
                    for comment in comments:
                        depth = comment.get('depth', 0)
                        indent = "  " * depth
                        
                        f.write(f"{indent}**{comment.get('author', 'unknown')}** ")
                        f.write(f"(score: {comment.get('score', 0)})\n")
                        f.write(f"{indent}> {comment.get('body', '').replace(chr(10), chr(10) + indent + '> ')}\n\n")
                
                f.write("---\n\n")
                
                if idx % 10 == 0:
                    print(f"✅ Processed {idx}/{len(json_files)} posts")
                    
            except Exception as e:
                print(f"⚠️ Error processing {json_file.name}: {e}")
                continue
    
    print(f"\n🎉 Export complete!")
    print(f"📄 File: {output_file}")
    print(f"📊 File size: {output_file.stat().st_size / 1024:.1f} KB")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python export_to_markdown.py <json_directory> [output_file.md] [filter_username]")
        print("\nExamples:")
        print("  # Export all comments")
        print("  python export_to_markdown.py output/reddit/run-2025-11-30T22-57-30/json")
        print("\n  # Export with custom filename")
        print("  python export_to_markdown.py output/reddit/run-2025-11-30T22-57-30/json my_posts.md")
        print("\n  # Export only comments from specific user")
        print("  python export_to_markdown.py output/reddit/run-2025-11-30T22-57-30/json auto Relevant-Formal-4650")
        sys.exit(1)
    
    json_dir = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != 'auto' else None
    filter_username = sys.argv[3] if len(sys.argv) > 3 else (sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != 'auto' and not sys.argv[2].endswith('.md') else None)
    
    export_to_markdown(json_dir, output_file, filter_username)
