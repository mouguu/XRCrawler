# Reddit Scraper & Data System

A clean, modular, and general-purpose Reddit scraper and data management system.

## 🚀 Features

- **Generic**: Works with **any subreddit** (e.g., `r/python`, `r/dataisbeautiful`) or **user** (`u/spez`).
- **Modular**: Clean architecture with pluggable strategies.
- **Smart**: Handles rate limiting, session rotation, and timeouts automatically.
- **Comprehensive**: Includes scraping, standardization, and export tools.

## 📦 Architecture

### Core Components

- **`scraper.py`**: Main entry point. Simplified orchestrator.
- **`core/`**: Rate limiting (`rate_limiter.py`) and session management (`session_manager.py`).
- **`strategies/`**: Pluggable scraping logic (`paginated`, `search`, `time_range`).
- **`scrapers/`**: Specialized handlers for users and subreddits.

## 🛠️ Usage

### Python API

```python
from scraper import RedditScraper

# Scrape a subreddit
scraper = RedditScraper("r/python")
result = scraper.scrape(max_posts=100, sort_type='hot')

# Scrape a user profile
scraper = RedditScraper("u/spez")
result = scraper.scrape(max_posts=50)

# With keywords
scraper = RedditScraper("r/programming")
result = scraper.scrape(
    max_posts=200,
    sort_type='new',
    keywords=['tutorial', 'beginner', 'guide']
)
```

### Command Line

```bash
# Scrape a subreddit
python reddit_cli.py --target r/python --max_posts 100

# Scrape a user
python reddit_cli.py --target u/spez --max_posts 50
```

### Interactive System

```bash
python reddit_system.py
```

Launches an interactive menu to scrape, export, and analyze data.

## 📊 Data Dictionary

The system produces standardized data with the following structure:

### Core Fields

| Field       | Type   | Description                             |
| ----------- | ------ | --------------------------------------- |
| `post_id`   | String | Unique Reddit post ID (e.g., `1m3ml6v`) |
| `title`     | String | Cleaned post title                      |
| `content`   | String | Cleaned post body text                  |
| `author`    | String | Reddit username                         |
| `subreddit` | String | Source subreddit                        |
| `url`       | String | Direct URL to the post                  |

### Metrics & Timestamps

| Field          | Type    | Description                     |
| -------------- | ------- | ------------------------------- |
| `score`        | Integer | Net score (upvotes - downvotes) |
| `num_comments` | Integer | Total comment count             |
| `upvote_ratio` | Float   | Upvote ratio (0.0 - 1.0)        |
| `created_utc`  | Integer | Unix timestamp of creation      |
| `created_date` | String  | Human-readable date             |

### Quality & Analysis (Calculated)

| Field              | Type    | Description                          |
| ------------------ | ------- | ------------------------------------ |
| `quality_score`    | Float   | Algorithmic quality score (0-10)     |
| `engagement_score` | Integer | `score + (comments * 2)`             |
| `content_type`     | String  | `text` or `link`                     |
| `has_discussion`   | Boolean | True if post has meaningful comments |

### Comments

The `comments_json` field contains a nested array of comment objects, each with:

- `id`, `author`, `body` (cleaned), `score`, `level` (depth), `replies` (nested).

## 🔧 Installation

```bash
pip install -r requirements.txt
```

## 📝 Notes

- **`time_range.py`**: This file in `strategies/` implements the logic for scraping "Top" posts by time range (day/week/month/year). It is a core code file, not documentation.
- **Data Storage**: Scraped data is saved locally in `data/` and can be exported to CSV.
