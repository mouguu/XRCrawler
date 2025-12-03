# CLI Usage Guide

Complete command-line interface reference for XRCrawler.

## Building the Project

Before using CLI commands, build the project:

```bash
pnpm run build
```

After building, use `node dist/cli.js` or the npm scripts. For development, you can use `ts-node cli.ts`.

## Twitter/X Commands

### Basic Profile Scraping

**Quick Mode (GraphQL API - < 800 tweets)**

```bash
# Scrape 50 tweets using username
node dist/cli.js twitter -u elonmusk -c 50

# Scrape using profile URL
node dist/cli.js twitter -U https://x.com/elonmusk -c 50

# Or use npm script
pnpm start twitter -u elonmusk -c 50
```

**Deep Archive Mode (Puppeteer - Unlimited)**

```bash
# Scrape 2000 tweets (auto-detects >800 and switches to date chunking)
node dist/cli.js twitter -u elonmusk -c 2000 --mode puppeteer
```

### Resume Interrupted Scrapes

```bash
# Continues from where you left off (based on oldest tweet ID)
node dist/cli.js twitter -u elonmusk -c 2000 --mode puppeteer --resume

# Resume from a specific tweet ID
node dist/cli.js twitter -u elonmusk -c 2000 --mode puppeteer --resume-from 1234567890123456789
```

### Thread Scraping

```bash
# Archive a specific thread with up to 100 replies
node dist/cli.js twitter --thread https://x.com/username/status/123456789 --max-replies 100
```

### Home Timeline

```bash
# Scrape the logged-in account's home feed (For You / Following)
node dist/cli.js twitter --home -c 100
```

### Search Mode

```bash
# Search for tweets matching a query
node dist/cli.js twitter --query "climate change" -c 200

# Search with date range (requires puppeteer mode)
node dist/cli.js twitter --query "from:username keyword" -c 500 --mode puppeteer
```

### Advanced Options

**Persona Analysis**

Generates a comprehensive AI prompt based on the user's tweets and reply style.

```bash
node dist/cli.js twitter -u elonmusk --persona
```

**Scrape Likes**

```bash
node dist/cli.js twitter -u elonmusk --likes
```

**Scrape with Replies Tab**

```bash
# Include replies in the user's timeline
node dist/cli.js twitter -u elonmusk --with-replies -c 200
```

**Batch Processing**

Scrape multiple accounts from a file (one username/URL per line). Supports mixing usernames, @handles, and profile URLs.

```bash
# Scrape multiple accounts, merge results into one file
node dist/cli.js twitter -f accounts.txt --merge

# Scrape multiple accounts, save separately
node dist/cli.js twitter -f accounts.txt --separate
```

**Session Selection**

Manually select a specific session file:

```bash
node dist/cli.js twitter -u elonmusk -c 100 --session account1.json
```

## Monitor Service

Track multiple users for new tweets and generate daily reports:

```bash
# Monitor users for new tweets
node dist/cli.js monitor -u elonmusk,trump,billgates
```

**Note**: Monitor API endpoints were removed with the migration to BullMQ/Redis. The CLI monitor command remains for basic use; advanced keyword/lookback settings are available in the Web UI.

## Reddit Commands

### Scrape a Subreddit

```bash
# Scrape 100 posts from r/UofT
node dist/cli.js reddit -r UofT -c 100

# Deep scrape with specific strategy
node dist/cli.js reddit -r AskReddit -c 500 -s super_full

# Save individual JSON files
node dist/cli.js reddit -r AskReddit -c 100 --save-json

# Available strategies: auto, super_full, super_recent, new
```

### Scrape a Reddit Post

```bash
# Scrape a specific Reddit post with all comments (via web interface)
# Or use the Python API directly:
curl -X POST http://127.0.0.1:5002/api/scrape/post \
  -H "Content-Type: application/json" \
  -d '{"post_url": "https://www.reddit.com/r/.../comments/..."}'
```

**Note**: Reddit scraping requires the Python API server to be running. Start it with `pnpm run dev:reddit` or `python3 platforms/reddit/reddit_api_server.py`.

## Command Options

### Common Options

**User Identification:**
- `-u, --username <username>` - Twitter username (without @)
- `-U, --url <url>` - Twitter profile URL
- `-f, --file <path>` - Batch process from file (one username/URL per line)
- `--session <filename>` - Use specific cookie file (e.g., account1.json)

**Scraping Configuration:**
- `-c, --count <number>` - Number of tweets to scrape
- `--mode <mode>` - Scraping mode: `graphql` (API, fast, <800 tweets), `puppeteer` (browser, unlimited), or `mixed` (auto-switch)
- `--resume` - Resume from last checkpoint
- `--resume-from <tweetId>` - Resume from specific tweet ID
- `--with-replies` - Include replies in timeline
- `--likes` - Scrape liked tweets
- `--home` - Scrape home timeline (For You / Following)
- `--thread <url>` - Scrape a specific tweet thread
- `--max-replies <number>` - Max replies for thread mode (default: 100)
- `--query <query>` - Search query (e.g., "climate change" or "from:username keyword")

**Output Options:**
- `-o, --output <dir>` - Output directory (default: from config)
- `-m, --merge` - Merge batch results into one file
- `--merge-file <filename>` - Merge file name (default: 'merged')
- `-s, --separate` - Save batch results separately (each account in its own file)
- `--format <format>` - Export format: `md` (default), `json`, or `csv`
- `--json` - Additionally export as JSON (consolidated into one file)
- `--csv` - Additionally export as CSV (consolidated into one file)
- `--timezone <timezone>` - Timezone for timestamp output (IANA name, e.g., 'America/New_York')

**Advanced Options:**
- `--persona` - Generate AI persona analysis (auto-enables with-replies, increases count to 100)
- `--headless <boolean>` - Run browser in headless mode (default: from config)
- `-d, --debug` - Enable debug mode with verbose logs

### Full CLI Help

```bash
node dist/cli.js --help
node dist/cli.js twitter --help
node dist/cli.js reddit --help
node dist/cli.js monitor --help
```
