import axios from 'axios';
import { GoogleGenAI } from '@google/genai';

interface SearchResult {
  query: string;
  results: {
    title: string;
    url: string;
    content: string;
    score: number;
  }[];
  rawResultCount: number;
}

interface ResearchInsight {
  topic: string;
  keyFindings: string[];
  sources: string[];
  summary: string;
}

class TavilyService {
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';
  private geminiClient: GoogleGenAI | null = null;
  private geminiApiKey: string = '';

  constructor(apiKey: string, geminiApiKey?: string) {
    this.apiKey = apiKey;
    if (geminiApiKey) {
      this.geminiApiKey = geminiApiKey;
      this.geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
    }
  }

  /**
   * Uses Gemini to generate a concise, precise search query (< 400 chars)
   * Following Tavily best practices: keep queries concise, focused, specific
   */
  private async generateSearchQuery(script: string): Promise<{
    mainTopic: string;
    searchQuery: string;
    context: string;
    excludeDomains?: string[];
  }> {
    if (!this.geminiClient) {
      // Fallback: extract first meaningful sentence
      const sentences = script.split(/[.!?]\s+/).filter(s => s.length > 20);
      const query = sentences[0]?.substring(0, 200) || script.substring(0, 200);
      return {
        mainTopic: query.substring(0, 50),
        searchQuery: query.substring(0, 200),
        context: script.substring(0, 300),
      };
    }

    const prompt = `Analyze this script and extract:
1. The MAIN topic/entity (be VERY specific - include creator name, product name, distinguishing details)
2. A concise search query (< 200 chars) that will find relevant, recent information
3. Key distinguishing context
4. Any domains to exclude (e.g., if searching for "Bird CLI" exclude "tinybird.co" to avoid Tinybird confusion)

Script excerpt:
${script.substring(0, 1500)}

Respond in JSON:
{
  "mainTopic": "specific topic name",
  "searchQuery": "concise query under 200 chars with key distinguishing terms",
  "context": "key details",
  "excludeDomains": ["domain1.com", "domain2.com"] // optional array
}`;

    try {
      const response = await this.geminiClient.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        config: {
          temperature: 0.2, // Lower temp for more precise queries
          maxOutputTokens: 300,
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          mainTopic: parsed.mainTopic || script.split(/\s+/).slice(0, 5).join(' '),
          searchQuery: (parsed.searchQuery || parsed.mainTopic).substring(0, 200), // Enforce 200 char limit
          context: parsed.context || script.substring(0, 200),
          excludeDomains: parsed.excludeDomains || [],
        };
      }
    } catch (error) {
      console.error('Gemini query generation error:', error);
    }

    // Fallback
    const words = script.split(/\s+/).slice(0, 8).join(' ');
    return {
      mainTopic: words,
      searchQuery: words.substring(0, 200),
      context: script.substring(0, 200),
    };
  }

  /**
   * Performs optimized Tavily search following best practices:
   * - search_depth=advanced for highest relevance
   * - chunks_per_source=3 for targeted snippets
   * - max_results=10 (not too high)
   * - Score-based filtering (> 0.7)
   * - Time range filtering for recent results
   */
  async searchAndAnalyze(
    script: string,
    includeContent: boolean = true
  ): Promise<SearchResult> {
    try {
      // Generate intelligent search query
      const { mainTopic, searchQuery, context, excludeDomains = [] } = await this.generateSearchQuery(script);

      console.log(`[Tavily] Query: "${searchQuery}" | Topic: "${mainTopic}"`);
      if (excludeDomains.length > 0) {
        console.log(`[Tavily] Excluding domains: ${excludeDomains.join(', ')}`);
      }

      // Perform Tavily search with optimized parameters
      const response = await axios.post(
        `${this.baseUrl}/search`,
        {
          api_key: this.apiKey,
          query: searchQuery,
          // Best practices from Tavily docs:
          search_depth: 'advanced', // Highest relevance, returns chunks
          chunks_per_source: 3, // Multiple relevant snippets per source
          max_results: 10, // Get more results for filtering (best practice: 10, not 300)
          include_answer: true, // Get LLM-generated answer
          include_raw_content: false, // Don't need full content for our use case
          topic: 'general', // Can be 'news' for recent events
          time_range: 'month', // Filter to recent results (last month)
          exclude_domains: excludeDomains, // Exclude confusing domains
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      let results = response.data.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: includeContent ? r.content : '',
        score: r.score || 0,
      }));

      // Score-based filtering (best practice: filter by relevance score)
      // Tavily scores range 0-1, higher is better
      const MIN_SCORE = 0.65; // Filter out low-relevance results
      results = results.filter((r: { score: number }) => r.score >= MIN_SCORE);

      // Sort by score descending (most relevant first)
      results.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

      // Limit to top 5 after filtering
      results = results.slice(0, 5);

      console.log(`[Tavily] Filtered to ${results.length} relevant results (min score: ${MIN_SCORE})`);
      if (results.length > 0) {
        console.log(`[Tavily] Top result: "${results[0].title}" (score: ${results[0].score.toFixed(3)})`);
      }

      return {
        query: searchQuery,
        results,
        rawResultCount: response.data.results.length,
        answer: response.data.answer, // Include Tavily's LLM-generated answer
      } as SearchResult & { answer?: string };
    } catch (error: any) {
      console.error('Tavily search error:', error.response?.data || error.message);
      throw new Error(`Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates research insights from search results
   */
  async generateInsights(scriptTopic: string, script: string): Promise<ResearchInsight> {
    try {
      // Use the full script for better query generation
      const searchResults = await this.searchAndAnalyze(script);

      // Extract key findings from top results
      // Use the answer field if available (LLM-generated summary from Tavily)
      const answer = (searchResults as SearchResult & { answer?: string }).answer;
      
      const keyFindings = searchResults.results
        .slice(0, 3)
        .map((r) => {
          // Extract first meaningful chunk or sentence
          const chunks = r.content.split(/<<chunk \d+>>/).filter(c => c.trim().length > 30);
          if (chunks.length > 0) {
            return chunks[0].substring(0, 250);
          }
          // Fallback: extract first sentence
          const sentences = r.content.split(/[.!?]\s+/).filter(s => s.length > 30);
          return sentences[0]?.substring(0, 250) || r.content.substring(0, 250);
        })
        .filter(Boolean);

      const sources = searchResults.results.map((r) => r.url);

      // Use Tavily's answer if available, otherwise create summary
      const summary = answer
        ? `Based on analysis of "${scriptTopic}": ${answer.substring(0, 300)}`
        : keyFindings.length > 0
        ? `Based on analysis of "${scriptTopic}": ${keyFindings[0]}`
        : `Research gathered for "${scriptTopic}" from ${sources.length} sources.`;

      return {
        topic: scriptTopic || searchResults.query,
        keyFindings,
        sources,
        summary,
      };
    } catch (error) {
      console.error('Research generation error:', error);
      throw error;
    }
  }

  // Quick fact-checking against current information
  async factCheck(claim: string): Promise<{ verified: boolean; sources: string[] }> {
    try {
      const results = await this.searchAndAnalyze(claim);
      return {
        verified: results.results.length > 0 && results.results[0].score > 0.7,
        sources: results.results.map((r) => r.url),
      };
    } catch (error) {
      console.error('Fact-check error:', error);
      throw error;
    }
  }

  // Finds trending topics and related keywords
  async getTrendingContext(topic: string): Promise<string[]> {
    try {
      const results = await this.searchAndAnalyze(`${topic} trends 2026`);
      return results.results.map((r) => r.title);
    } catch (error) {
      console.error('Trending context error:', error);
      return [];
    }
  }
}

export default TavilyService;
export type { SearchResult, ResearchInsight };
