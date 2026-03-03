# LinkedIn Lead Scorer

Identify warm leads from your LinkedIn messages. Upload your LinkedIn data export, and this tool will score and rank your contacts based on engagement, recency, decision-making power, and relevance to AI/consulting services.

## How It Works

1. **Upload** your LinkedIn Messages CSV (and optionally your Connections CSV for richer data)
2. The tool **analyzes** engagement patterns — bidirectional messaging, frequency, recency
3. Contacts are **scored** (0–100) and categorized into tiers: Hot, Warm, Cool
4. **Download** the ranked list as a CSV for Dripify or other outreach tools

## Scoring Methodology

| Category | Max Points | What It Measures |
|----------|-----------|-----------------|
| Engagement | 40 | Message volume, back-and-forth balance, conversation depth |
| Recency | 25 | How recently you've exchanged messages |
| Title | 20 | Decision-maker seniority (C-suite, VP, Director, etc.) |
| Relevance | 15 | Keywords in conversations (AI, automation, operations, etc.) |

**Spam filtering:** One-way inbound messages (cold outreach with no reply) receive score penalties and are effectively filtered out.

## Getting Your LinkedIn Data

1. Go to [LinkedIn Settings](https://www.linkedin.com/mypreferences/d/download-my-data)
2. Select **Messages** (required) and **Connections** (optional, enriches with titles/companies)
3. Request the archive — LinkedIn will email you when it's ready
4. Download and unzip — look for `messages.csv` and `Connections.csv`

## Search & Filtering

The search bar supports natural language and prefix queries:

- `company:EY` — find people associated with EY
- `title:VP` — find VPs
- `mentioned:AI` — find people who discussed AI
- `Who mentioned automation?` — natural language search
- `Find people at McKinsey` — natural language company search
- Or just type any keyword to search across all fields

## Deploy on Netlify

This is a fully client-side app — no backend needed.

1. Push this repo to GitHub
2. Connect to [Netlify](https://app.netlify.com)
3. Set publish directory to the repo root (no build command needed)
4. Deploy

Or drag-and-drop the project folder directly into [Netlify Drop](https://app.netlify.com/drop).

## Privacy

All processing happens in your browser. No data is sent to any server. Your LinkedIn messages never leave your machine.
