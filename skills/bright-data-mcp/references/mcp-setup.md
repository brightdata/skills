# Bright Data MCP Server Setup

## Prerequisites

1. A Bright Data account - sign up at [brightdata.com](https://brightdata.com)
2. An API token from the [Bright Data Dashboard](https://brightdata.com/cp)

## Remote MCP Server (Recommended)

The remote MCP server requires no local installation. Connect directly via URL.

### Base URL

```
https://mcp.brightdata.com/mcp?token=<YOUR_BRIGHTDATA_API_TOKEN>
```

### Optional Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `pro` | `1` | Enable all Pro tools (browser automation, AI extraction, raw HTML) |
| `groups` | Group name(s) | Enable specific tool groups without full Pro mode |
| `tools` | Tool name(s) | Enable only specific individual tools |

### URL Examples

**Rapid (Free) mode** - search, scrape and pre-built scrapers:
```
https://mcp.brightdata.com/mcp?token=YOUR_TOKEN
```

**Full Pro mode** - all tools:
```
https://mcp.brightdata.com/mcp?token=YOUR_TOKEN&pro=1
```

**Specific groups** - e.g., pre-built scrapers + browser automation:
```
https://mcp.brightdata.com/mcp?token=YOUR_TOKEN&groups=scrapers,browser
```

**Specific tools** - e.g., only AI extraction and search:
```
https://mcp.brightdata.com/mcp?token=YOUR_TOKEN&tools=extract,search_engine
```

### Setup in Claude.ai

1. Go to Settings > Extensions
2. Click "Add Extension" or "Add MCP Server"
3. Enter the MCP URL with your token
4. Verify connection shows "Connected" status

### Setup in Claude Code

Add to your Claude Code MCP settings (typically `~/.claude/settings.json` or project-level `.claude/settings.json`):

```json
{
  "mcpServers": {
    "brightdata": {
      "url": "https://mcp.brightdata.com/mcp?token=YOUR_TOKEN&pro=1"
    }
  }
}
```

For Rapid (free) mode only:
```json
{
  "mcpServers": {
    "brightdata": {
      "url": "https://mcp.brightdata.com/mcp?token=YOUR_TOKEN"
    }
  }
}
```

## Local MCP Server

For users who prefer running the MCP server locally.

### Installation

Install via npm:
```bash
npm install -g @brightdata/mcp
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_TOKEN` | Yes | Your Bright Data API token |
| `PRO_MODE` | No | Set to `true` to enable Pro tools |
| `GROUPS` | No | Comma-separated group names |

### Running Locally

```bash
API_TOKEN=your_token PRO_MODE=true npx @brightdata/mcp
```

## Choosing Your Mode

All modes are **free for up to 5,000 requests per month** — including Pro tools.

### Rapid (Free) - Default
- `search_engine` and `scrape_as_markdown` available (plus batch variants)
- Scraper tools: structured data from 1,200+ sites (Amazon, LinkedIn, Instagram, TikTok, YouTube, etc.)
- Best for: everyday browsing, reading web pages, search queries, data extraction

### Pro Mode (`pro=1`)
- All tools enabled
- Browser automation tools, AI extraction, raw HTML
- Best for: interactive sites, automation, social media analysis, e-commerce monitoring

### Groups (Selective Pro)
Enable only the tool groups you need:
- `scrapers` - Pre-built scrapers for 1,200+ sites (on by default)
- `browser` - Full browser automation
- `advanced_scraping` - HTML scraping, AI extraction, batch operations
- `geo` - ChatGPT and Perplexity answer collection

Older group names (`ecommerce`, `social`, `business`, ...) still work and enable the scraper tools.

## Verifying Your Setup

After connecting, test with a simple tool call:

1. Ask Claude: "Use the Bright Data MCP to search for 'test query'"
2. This should call `search_engine` and return results
3. If it works, your MCP connection is active

If it fails:
- Check your API token is valid and not expired
- Verify the MCP URL is correctly formatted
- Check network connectivity to mcp.brightdata.com
- Try reconnecting in Settings > Extensions

## Documentation

Full documentation index: https://docs.brightdata.com/llms.txt
