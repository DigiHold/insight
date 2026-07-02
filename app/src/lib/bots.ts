// AI bot detection by user-agent token. IP verification (against the official ranges)
// will be added in a later phase; for now verified=0 by default.

export type BotCategory = 'answer' | 'search' | 'training';

export interface BotInfo {
  bot_name: string;
  vendor: string;
  category: BotCategory;
}

// Order matters: the most specific tokens come first (e.g. Claude-User before ClaudeBot).
const BOTS: { token: RegExp; bot_name: string; vendor: string; category: BotCategory }[] = [
  // OpenAI
  { token: /ChatGPT-User/i, bot_name: 'ChatGPT', vendor: 'openai', category: 'answer' },
  { token: /OAI-SearchBot/i, bot_name: 'OAI-SearchBot', vendor: 'openai', category: 'search' },
  { token: /GPTBot/i, bot_name: 'GPTBot', vendor: 'openai', category: 'training' },
  // Anthropic
  { token: /Claude-User/i, bot_name: 'Claude', vendor: 'anthropic', category: 'answer' },
  { token: /Claude-SearchBot/i, bot_name: 'Claude-SearchBot', vendor: 'anthropic', category: 'search' },
  { token: /ClaudeBot|anthropic-ai/i, bot_name: 'ClaudeBot', vendor: 'anthropic', category: 'training' },
  // Perplexity
  { token: /Perplexity-User/i, bot_name: 'Perplexity', vendor: 'perplexity', category: 'answer' },
  { token: /PerplexityBot/i, bot_name: 'PerplexityBot', vendor: 'perplexity', category: 'search' },
  // Google
  { token: /Google-Extended/i, bot_name: 'Google-Extended', vendor: 'google', category: 'training' },
  { token: /Google-CloudVertexBot|GoogleAgent-Mariner|Google-NotebookLM/i, bot_name: 'Gemini', vendor: 'google', category: 'answer' },
  { token: /GoogleOther/i, bot_name: 'GoogleOther', vendor: 'google', category: 'search' },
  { token: /Googlebot/i, bot_name: 'Googlebot', vendor: 'google', category: 'search' },
  // Microsoft / Bing
  { token: /BingBot|bingbot|msnbot|MicrosoftPreview/i, bot_name: 'Bing', vendor: 'microsoft', category: 'search' },
  // Amazon
  { token: /Amazonbot/i, bot_name: 'Amazon', vendor: 'amazon', category: 'search' },
  // Apple
  { token: /Applebot-Extended/i, bot_name: 'Applebot-Extended', vendor: 'apple', category: 'training' },
  { token: /Applebot/i, bot_name: 'Apple', vendor: 'apple', category: 'search' },
  // Meta
  { token: /meta-externalagent|FacebookBot|meta-externalfetcher/i, bot_name: 'Meta', vendor: 'meta', category: 'training' },
  // xAI (Grok)
  { token: /xai|grok/i, bot_name: 'Grok', vendor: 'xai', category: 'answer' },
  // DuckDuckGo
  { token: /DuckAssistBot/i, bot_name: 'DuckDuckGo', vendor: 'duckduckgo', category: 'answer' },
  { token: /DuckDuckBot|DuckDuckGo-Favicons-Bot/i, bot_name: 'DuckDuckGo', vendor: 'duckduckgo', category: 'search' },
  // Others
  { token: /Bytespider/i, bot_name: 'Bytespider', vendor: 'bytedance', category: 'training' },
  { token: /CCBot/i, bot_name: 'CCBot', vendor: 'commoncrawl', category: 'training' },
  { token: /cohere-ai|cohere-training-data-crawler/i, bot_name: 'Cohere', vendor: 'cohere', category: 'training' },
  { token: /Timpibot/i, bot_name: 'Timpi', vendor: 'timpi', category: 'training' },
  { token: /YouBot/i, bot_name: 'You.com', vendor: 'you', category: 'search' },
];

export function detectBot(ua: string): BotInfo | null {
  if (!ua) return null;
  for (const b of BOTS) {
    if (b.token.test(ua)) return { bot_name: b.bot_name, vendor: b.vendor, category: b.category };
  }
  return null;
}

// Generic bots + headless browsers + previews/monitors. Used to filter the tracker
// (the same way GA4 excludes bots), so a fake visitor never shows up on the map.
const GENERIC_BOT_RE = /bot\b|crawl|spider|slurp|headless|puppeteer|playwright|phantom|lighthouse|prerender|pre-?render|preview|monitor|pingdom|uptime|statuscake|curl|wget|python-requests|node-fetch|axios|go-http|okhttp|java\/|apache-httpclient|libwww|scrapy|facebookexternalhit|whatsapp|telegram|discord|slackbot|embedly|redditbot|semrush|ahrefs|mj12|dotbot|petalbot|dataprovider|google-inspectiontool|chrome-lighthouse/i;

export function isBot(ua: string): boolean {
  if (!ua) return true; // a pageview with no User-Agent = script/bot
  return GENERIC_BOT_RE.test(ua) || detectBot(ua) !== null;
}

// Single regex (union of the tokens) for the site-side snippets: a quick filter before sending.
export const AI_BOT_REGEX = 'GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|Googlebot|Google-Extended|GoogleOther|Google-CloudVertexBot|Google-NotebookLM|bingbot|BingBot|Amazonbot|Applebot|meta-externalagent|FacebookBot|Bytespider|CCBot|DuckAssistBot|DuckDuckBot|YouBot|cohere-ai|xai|grok';
