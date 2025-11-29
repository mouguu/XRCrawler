#!/usr/bin/env python3
"""
Reddit API Server
提供 HTTP API 接口，替代 spawn 子进程通信方式
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os
import json
import traceback

# 添加当前目录到路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from enhanced_scraper import run_scraping_session
from post_scraper import RedditPostScraper

app = Flask(__name__)
CORS(app)  # 允许跨域请求

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'reddit-api-server',
        'version': '1.0.0'
    })

@app.route('/api/scrape/subreddit', methods=['POST'])
def scrape_subreddit():
    """爬取 subreddit"""
    try:
        data = request.get_json() or {}
        
        subreddit = data.get('subreddit', 'UofT')
        max_posts = data.get('max_posts', 100)
        strategy = data.get('strategy', 'auto')
        save_json = data.get('save_json', False)
        
        # 自动选择策略
        if strategy == 'auto':
            if max_posts > 5000:
                strategy = 'super_full'
            elif max_posts > 2000:
                strategy = 'super_recent'
            else:
                strategy = 'new'
        
        config = {
            'subreddit': subreddit,
            'max_posts': max_posts,
            'strategy': strategy,
            'save_json': save_json,
            'mode': 'incremental'
        }
        
        result = run_scraping_session(config)
        
        return jsonify({
            'success': result.get('status') == 'success',
            'data': result,
            'message': result.get('message', 'Scraping completed')
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/scrape/post', methods=['POST'])
def scrape_post():
    """爬取单个 Reddit 帖子"""
    try:
        data = request.get_json() or {}
        post_url = data.get('post_url')
        
        if not post_url:
            return jsonify({
                'success': False,
                'error': 'post_url is required'
            }), 400
        
        scraper = RedditPostScraper()
        result = scraper.scrape_post(post_url)
        
        if result.get('status') == 'success':
            # 保存到输出目录
            output_dir = os.path.join(os.getcwd(), 'output', 'reddit')
            os.makedirs(output_dir, exist_ok=True)
            
            output_file = os.path.join(
                output_dir, 
                f"reddit_post_{result['post']['id']}.json"
            )
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            
            return jsonify({
                'success': True,
                'data': {
                    'post': result['post'],
                    'comments': result['comments'],
                    'comment_count': result['comment_count'],
                    'file_path': output_file
                },
                'message': f"Successfully scraped post with {result['comment_count']} comments"
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('message', 'Unknown error')
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/status', methods=['GET'])
def status():
    """获取服务状态"""
    return jsonify({
        'status': 'running',
        'service': 'reddit-api-server',
        'endpoints': [
            '/api/scrape/subreddit',
            '/api/scrape/post',
            '/health'
        ]
    })

if __name__ == '__main__':
    port = int(os.environ.get('REDDIT_API_PORT', 5002))
    host = os.environ.get('REDDIT_API_HOST', '127.0.0.1')
    
    print(f"🚀 Starting Reddit API Server on {host}:{port}")
    app.run(host=host, port=port, debug=False)

