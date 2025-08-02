import OpenAI from 'openai';
import { logger } from '@/utils/logger';
import { redis } from '@/utils/redis';
import { ProcessedQuery } from '@/types';

class LLMService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  /**
   * Process a natural language music request and extract structured query
   */
  async processRequest(userInput: string): Promise<ProcessedQuery> {
    const cacheKey = `llm:query:${Buffer.from(userInput).toString('base64')}`;
    
    // Check cache first
    const cached = await redis.getJson<ProcessedQuery>(cacheKey);
    if (cached) {
      logger.info('LLM query cache hit');
      return cached;
    }

    const systemPrompt = `You are a music intelligence AI that converts natural language requests into structured search queries.

Your task is to analyze user requests and extract:
1. Search intent (search, analyze, discover)
2. Search terms for YouTube
3. Filters for BPM, key, genre, mood, energy
4. Sorting preferences

Examples:
User: "Find me chill lofi house tracks around 120 BPM"
Response: {
  "intent": "search",
  "searchTerms": ["chill lofi house", "lofi house music", "ambient house"],
  "filters": {
    "bpm": {"min": 115, "max": 125},
    "genre": ["house", "lofi", "ambient"],
    "mood": ["chill", "relaxed"]
  },
  "maxResults": 10,
  "sortBy": "relevance"
}

User: "I need energetic progressive trance for peak time, 128-132 BPM"
Response: {
  "intent": "search", 
  "searchTerms": ["energetic progressive trance", "peak time trance", "uplifting trance"],
  "filters": {
    "bpm": {"min": 128, "max": 132},
    "genre": ["trance", "progressive trance"],
    "mood": ["energetic", "uplifting"],
    "energy": {"min": 0.7, "max": 1.0}
  },
  "maxResults": 10,
  "sortBy": "popularity"
}

User: "Deep house tracks in the key of C minor for sunset vibes"
Response: {
  "intent": "search",
  "searchTerms": ["deep house", "deep house sunset", "melodic deep house"],
  "filters": {
    "key": ["C minor", "Cm"],
    "genre": ["deep house", "house"],
    "mood": ["sunset", "melodic", "atmospheric"]
  },
  "maxResults": 10,
  "sortBy": "relevance"
}

Always respond with valid JSON. If the request is unclear, make reasonable assumptions.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput }
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const processedQuery: ProcessedQuery = JSON.parse(responseText);
      
      // Validate the response
      if (!processedQuery.intent || !processedQuery.searchTerms) {
        throw new Error('Invalid response format from LLM');
      }

      // Set defaults
      processedQuery.maxResults = processedQuery.maxResults || 10;
      processedQuery.sortBy = processedQuery.sortBy || 'relevance';

      // Cache for 1 hour
      await redis.setJson(cacheKey, processedQuery, 3600);

      logger.info('LLM processed request successfully', { 
        input: userInput.substring(0, 100),
        intent: processedQuery.intent 
      });

      return processedQuery;

    } catch (error) {
      logger.error('LLM processing error:', error);
      
      // Fallback: create a basic query from the input
      const fallbackQuery: ProcessedQuery = {
        intent: 'search',
        searchTerms: [userInput],
        filters: {},
        maxResults: 10,
        sortBy: 'relevance'
      };

      return fallbackQuery;
    }
  }

  /**
   * Extract metadata from track titles and descriptions
   */
  async extractMetadata(title: string, description?: string): Promise<{
    genre?: string;
    mood?: string;
    bpm?: number;
    key?: string;
  }> {
    const cacheKey = `llm:metadata:${Buffer.from(title).toString('base64')}`;
    
    // Check cache first
    const cached = await redis.getJson<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `Extract music metadata from this track information:
Title: "${title}"
${description ? `Description: "${description}"` : ''}

Extract and return as JSON:
- genre (electronic, house, techno, trance, etc.)
- mood (energetic, chill, dark, uplifting, etc.)  
- bpm (estimated BPM if mentioned)
- key (musical key if mentioned, like "C minor", "F major")

Only include fields if you're confident. Return empty object if no metadata is clear.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        return {};
      }

      const metadata = JSON.parse(responseText);
      
      // Cache for 24 hours
      await redis.setJson(cacheKey, metadata, 86400);

      return metadata;

    } catch (error) {
      logger.error('Metadata extraction error:', error);
      return {};
    }
  }

  /**
   * Suggest related search terms
   */
  async suggestRelated(query: string): Promise<string[]> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Suggest 5 related music search terms for: "${query}". Return as JSON array of strings.`
        }],
        temperature: 0.3,
        max_tokens: 100,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        return [];
      }

      const response = JSON.parse(responseText);
      return Array.isArray(response.suggestions) ? response.suggestions : [];

    } catch (error) {
      logger.error('Related suggestions error:', error);
      return [];
    }
  }
}

export const llmService = new LLMService();
