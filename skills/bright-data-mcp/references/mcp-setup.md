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

All tools are enabled by default. To limit the server, add `&groups=` (e.g. `scrapers`, `browser`, `advanced_scraping`, `geo`) or `&tools=` (comma-separated tool names).

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
| `GROUPS` | No | Limit to these tool groups (default: all tools) |
| `TOOLS` | No | Limit to these tools (default: all tools) |

### Running Locally

```bash
API_TOKEN=your_token npx @brightdata/mcp
```

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
