# ContentEngine — AI Content Generation Platform

Convert your video scripts into viral X/Twitter threads using AI. This full-stack application combines **Gemini 3**, **Tavily web search**, and **Composio's X/Twitter integration** to create authentic, high-quality Twitter threads without the "AI slop" feel.

## 🎯 Features

- **📝 Smart Script Input**: Paste text or upload PDF files (including Google Docs exports)
- **✨ Authentic Thread Generation**: Uses advanced prompting to avoid generic AI language
- **🔍 Web Research Integration**: Tavily API adds real-time context and fact-checking
- **🧵 Thread Management**: Preview, edit, and generate variations before posting
- **🐦 Direct X/Twitter Posting**: Seamlessly post threads using Composio MCP
- **🎨 Multiple Variations**: Generate 3+ different takes on the same content for A/B testing
- **⚡ Production Ready**: Built with TypeScript, tested, and optimized for speed
- **🎬 CaptionedVideoGenerator**: Render captioned social videos via GitHub Actions ([VideoCreater](https://github.com/sanyam158/VideoCreater))

## 📋 Prerequisites

You'll need API keys for:

1. **Gemini 3 API** - Get from [ai.google.dev](https://ai.google.dev)
   - Use `gemini-3-flash-preview` or `gemini-3-pro-preview`

2. **Tavily Web Search** - Get from [tavily.com](https://tavily.com)
   - For research and fact-checking

3. **Composio** - Get from [composio.dev](https://composio.dev)
   - Handles X/Twitter OAuth and posting

4. **X/Twitter App** - Set up at [developer.twitter.com](https://developer.twitter.com)
   - For OAuth callback setup with Composio

## 🎬 CaptionedVideoGenerator

Renders captioned social media videos by dispatching GitHub Actions workflows in the [VideoCreater](https://github.com/sanyam158/VideoCreater) repo.

**Supported Platforms:** Instagram Reel, TikTok, YouTube Shorts, Instagram Feed (4:5), X/Twitter Square, LinkedIn Feed

**Workflow:**
1. Fill in content (title, hook, body) and style settings in the **CaptionedVideoGenerator** tab
2. Click **Render Videos** — triggers the `render.yml` workflow in VideoCreater via GitHub API
3. Page polls GitHub Actions every 8 seconds for completion (typically 1–5 minutes)
4. Download rendered video ZIPs directly from GitHub Artifacts

**Additional env vars required (backend `backend/.env`):**
```env
VCG_GITHUB_TOKEN=your_github_pat   # needs repo + actions:read scopes
VCG_GITHUB_REPO=sanyam158/VideoCreater
```

---

## 🚀 Quick Start

### 1. Clone & Setup

```bash
# Navigate to project directory
cd ContentEngine

# Copy environment template
cp backend/.env.example backend/.env
```

### 2. Configure Environment Variables

Edit `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_key
TAVILY_API_KEY=your_tavily_key
COMPOSIO_API_KEY=your_composio_key
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

See `backend/.env.example` for full list.

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 4. Run Development Servers

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
# Server runs on http://localhost:5000
```

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
# UI runs on http://localhost:3000
```

## 📐 Architecture

### Backend (Node.js + Express)

- **Gemini Service**: Thread generation with custom system prompts for authenticity
- **Tavily Service**: Web search for research context
- **Composio Service**: X/Twitter OAuth and posting
- **File Processing**: PDF/text extraction and analysis
- **API Routes**: RESTful endpoints for all operations

### Frontend (React + TypeScript)

- **ScriptInput**: Text paste and file upload component
- **ThreadPreview**: Visual thread rendering with copy-to-clipboard
- **VariationsView**: Side-by-side comparison of thread variations
- **Main App**: State management and navigation

## 🔌 API Endpoints

### Generate Thread
```http
POST /api/generate-thread
Content-Type: application/json

{
  "script": "Your video script here...",
  "toneOfVoice": "natural and conversational",
  "targetAudience": "tech creators",
  "includeResearch": true
}
```

### Upload and Process File
```http
POST /api/process-file
Content-Type: multipart/form-data

[PDF or text file]
```

### Post Thread to X/Twitter
```http
POST /api/post-thread
Content-Type: application/json

{
  "tweets": ["Tweet 1", "Tweet 2", "..."],
  "replyChain": true
}
```

### Generate Variations
```http
POST /api/generate-variations
Content-Type: application/json

{
  "script": "Your script...",
  "count": 3,
  "targetAudience": "creators"
}
```

## 🗞️ Noise2Article — Niche System

The Noise2Article pipeline scrapes Reddit, HN, and RSS feeds, filters signal from noise via an LLM gatekeeper, synthesizes trending themes, and generates ready-to-post articles. It is fully niche-driven — every prompt, regex, and source list is controlled by a niche preset.

### Available Niches

| Niche ID | Display Name | Key Sources |
|---|---|---|
| `ai-tech` | AI & Tech | LocalLLaMA, ClaudeAI, OpenAI, MIT Review, TechCrunch AI |
| `personal-finance` | Personal Finance | r/personalfinance, r/FIRE, NerdWallet, Mr. Money Mustache |
| `health-wellness` | Health & Wellness | r/longevity, r/fitness, NIH, Examine.com |
| `digital-marketing` | Digital Marketing | r/SEO, r/PPC, Moz, Backlinko, HubSpot |
| `productivity` | Productivity & Tools | r/ObsidianMD, r/Notion, Ness Labs, Zapier blog |
| `travel` | Travel | r/solotravel, r/digitalnomad, Nomadic Matt, The Points Guy |
| `geopolitics` | Geopolitics | r/geopolitics, r/CredibleDefense, Foreign Affairs, The Diplomat, War on the Rocks |
| `hinduism` | Hinduism & Indian Culture | r/hinduism, r/Vedanta, Swarajya, Dharma Dispatch, Indica Today |
| `stock-market` | Stock Market & Investing | r/stocks, r/wallstreetbets, MarketWatch, Bloomberg, Seeking Alpha |

### How to Add a New Niche

Adding a niche requires changes in **two files only**:

#### 1. Backend — `backend/src/services/noise2article/types.ts`

Add a new entry to the `NICHE_PRESETS` object. Every field is injected directly into LLM prompts — no code changes elsewhere are needed.

```typescript
'your-niche-id': {
  context: {
    id: 'your-niche-id',
    displayName: 'Your Niche Name',          // shown in UI dropdown
    brandVoice: 'your brand voice descriptor', // tone for writer/synthesizer prompts
    platformDescriptor: 'your platform type', // identity for gatekeeper/enricher prompts
    specificityExamples: 'Term1, Tool2, Brand3', // concrete examples for gatekeeper check
    hnFrontPagePattern: 'keyword1|keyword2',  // regex to filter HN posts (compiled at runtime)
    bangerDefinition: 'what makes a great article in this niche', // injected into writer prompt
  },
  configOverrides: {
    subreddits: [
      // Tier 1 = core communities, Tier 2 = niche, Tier 3 = strict filter (minComments enforced)
      { name: 'subreddit_name', tier: 1, minScore: 50, minComments: 0 },
    ],
    hnQueries: ['keyword OR keyword2'],       // HN Algolia search queries
    rssFeeds: ['https://example.com/feed'],   // RSS/Atom feed URLs
  },
},
```

#### 2. Frontend — `frontend/src/pages/Noise2Article.tsx`

Add a line to the `NICHE_OPTIONS` array (around line 220):

```typescript
const NICHE_OPTIONS = [
  // ... existing niches ...
  { value: 'your-niche-id', label: 'Your Niche Name' },
];
```

That's it — the pipeline, API validation, and article generation all pick up the new niche automatically.

---

## 🎨 Customization

### Change LLM Model

Edit [backend/src/services/geminiService.ts](backend/src/services/geminiService.ts):

```typescript
private model = 'gemini-3-pro-preview'; // Switch to Pro for more complex content
```

### Adjust System Prompt

The system prompt in `buildSystemPrompt()` controls authenticity. Modify to match your voice:

```typescript
private buildSystemPrompt(toneRequest?: string): string {
  return `You are writing threads as [YOUR NAME/BRAND]...`;
}
```

### Configure Tavily Research Depth

In [backend/src/services/tavilyService.ts](backend/src/services/tavilyService.ts):

```typescript
searchDepth: 'advanced', // 'basic' or 'advanced'
topic: 'general', // Can be 'news', 'research', 'general'
```

## 🔐 Security Considerations

1. **Never commit `.env` files** - Use `.env.example` template
2. **Rotate API keys regularly** - Especially Composio and Twitter tokens
3. **Rate limiting** - Implemented with 2-second delays between tweets
4. **Input validation** - All endpoints validate and sanitize inputs
5. **CORS configuration** - Restricted to frontend URL only

## 📊 How It Works

1. **Input**: User provides script (text or PDF)
2. **Analysis**: Script is cleaned, topics extracted, word count calculated
3. **Research** (optional): Tavily searches for relevant context
4. **Generation**: Gemini creates thread with custom system prompt emphasizing authenticity
5. **Preview**: User sees tweets, can regenerate or create variations
6. **Posting**: Composio handles OAuth and posts as thread on X/Twitter
7. **Follow-up** (future): Analytics and engagement tracking

## 🎯 Prompt Strategy for Authenticity

The system uses several techniques to avoid "AI slop":

- **Conversational patterns** - Natural contractions, sentence fragments
- **Real examples** - Research context added to threads
- **Personal voice** - Customizable tone and audience targeting
- **Emoji usage** - Authentic emoji placement, not overdone
- **Real patterns** - Avoids corporate jargon and buzzwords
- **Brevity** - Short, punchy sentences like real creators write

## 🐛 Troubleshooting

### "Failed to authenticate with Twitter"
- Ensure Composio API key is valid
- Check X/Twitter app OAuth redirect URLs match frontend URL
- Verify consumer key/secret in Composio dashboard

### "API rate limit exceeded"
- Wait a few minutes before generating more threads
- Increase the delay between tweets in ComposioService

### "PDF parsing errors"
- Ensure PDF is text-based (not scanned images)
- Try converting text in Google Docs first
- Max file size is 10MB

### Port already in use
```bash
# Change in backend/.env
PORT=5001

# If frontend port busy, change in frontend/vite.config.ts
port: 3001
```

## 🚢 Production Deployment

See **[DEPLOY.md](DEPLOY.md)** for full setup:
- **Frontend**: Vercel (connect GitHub, root `frontend`)
- **Backend**: Google Cloud Run (CI/CD via GitHub Actions)
- **Cron**: Noise2Article every 6 hours

## 📈 Cost Optimization

- **Gemini Flash**: ~$0.075 per 1M input tokens (cheapest option)
- **Tavily**: ~$1 per 1,000 searches (optional for basic usage)
- **Composio**: Free tier available, premium for higher limits

**Estimated cost per thread**: $0.01 - $0.05

## 🤝 Contributing

Feel free to fork, create issues, and submit PRs for improvements!

## 📄 License

MIT License - see LICENSE file for details

## 🙋 Support

- Issues: GitHub Issues
- Discussions: GitHub Discussions
- Email: support@example.com

---

**Made with ❤️ for creators** | v1.0.0 | February 2026
