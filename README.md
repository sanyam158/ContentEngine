# Script 2 Thread - AI Twitter Thread Generator

Convert your video scripts into viral X/Twitter threads using AI. This full-stack application combines **Gemini 3**, **Tavily web search**, and **Composio's X/Twitter integration** to create authentic, high-quality Twitter threads without the "AI slop" feel.

## 🎯 Features

- **📝 Smart Script Input**: Paste text or upload PDF files (including Google Docs exports)
- **✨ Authentic Thread Generation**: Uses advanced prompting to avoid generic AI language
- **🔍 Web Research Integration**: Tavily API adds real-time context and fact-checking
- **🧵 Thread Management**: Preview, edit, and generate variations before posting
- **🐦 Direct X/Twitter Posting**: Seamlessly post threads using Composio MCP
- **🎨 Multiple Variations**: Generate 3+ different takes on the same content for A/B testing
- **⚡ Production Ready**: Built with TypeScript, tested, and optimized for speed

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

## 🚀 Quick Start

### 1. Clone & Setup

```bash
# Navigate to project directory
cd script2thread

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
