// Classifies a raw referrer into a readable source + a type. Priority: UTM > known referrer > direct.

type SourceType = 'search' | 'social' | 'ai' | 'referral' | 'direct';
export interface Source {
  source: string;
  source_type: SourceType;
}

const RULES: { match: RegExp; source: string; type: SourceType }[] = [
  // Search
  { match: /(^|\.)google\./, source: 'google', type: 'search' },
  { match: /(^|\.)bing\.com/, source: 'bing', type: 'search' },
  { match: /(^|\.)duckduckgo\.com/, source: 'duckduckgo', type: 'search' },
  { match: /search\.brave\.com/, source: 'brave', type: 'search' },
  { match: /(^|\.)ecosia\.org/, source: 'ecosia', type: 'search' },
  { match: /(^|\.)qwant\.com/, source: 'qwant', type: 'search' },
  { match: /(^|\.)yahoo\./, source: 'yahoo', type: 'search' },
  // AI (a human clicked a link inside an AI answer)
  { match: /(chatgpt\.com|chat\.openai\.com)/, source: 'chatgpt', type: 'ai' },
  { match: /(^|\.)perplexity\.ai/, source: 'perplexity', type: 'ai' },
  { match: /(^|\.)claude\.ai/, source: 'claude', type: 'ai' },
  { match: /gemini\.google\.com/, source: 'gemini', type: 'ai' },
  { match: /(grok\.com|(^|\.)x\.ai)/, source: 'grok', type: 'ai' },
  { match: /copilot\.microsoft\.com/, source: 'copilot', type: 'ai' },
  // Social
  { match: /(^|\.)(x\.com|twitter\.com|t\.co)/, source: 'x', type: 'social' },
  { match: /(linkedin\.com|lnkd\.in)/, source: 'linkedin', type: 'social' },
  { match: /(facebook\.com|fb\.com|fb\.me)/, source: 'facebook', type: 'social' },
  { match: /(reddit\.com|redd\.it)/, source: 'reddit', type: 'social' },
  { match: /(^|\.)instagram\.com/, source: 'instagram', type: 'social' },
  { match: /(youtube\.com|youtu\.be)/, source: 'youtube', type: 'social' },
  { match: /(^|\.)tiktok\.com/, source: 'tiktok', type: 'social' },
  { match: /(^|\.)threads\.net/, source: 'threads', type: 'social' },
];

const AI_UTM = new Set(['chatgpt', 'openai', 'perplexity', 'claude', 'gemini', 'grok', 'copilot']);
const SOCIAL_UTM = new Set(['x', 'twitter', 'linkedin', 'facebook', 'reddit', 'instagram', 'youtube', 'tiktok', 'threads']);
const SEARCH_UTM = new Set(['google', 'bing', 'duckduckgo', 'brave', 'ecosia', 'qwant', 'yahoo']);

export function classifySource(referrer: string, utmSource: string, selfHost: string): Source {
  const utm = utmSource.trim().toLowerCase();
  if (utm) {
    if (AI_UTM.has(utm)) return { source: utm, source_type: 'ai' };
    if (SOCIAL_UTM.has(utm)) return { source: utm, source_type: 'social' };
    if (SEARCH_UTM.has(utm)) return { source: utm, source_type: 'search' };
    return { source: utm, source_type: 'referral' };
  }

  if (!referrer) return { source: 'direct', source_type: 'direct' };

  let host = '';
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return { source: 'direct', source_type: 'direct' };
  }

  if (selfHost && host.endsWith(selfHost)) return { source: 'direct', source_type: 'direct' };

  for (const rule of RULES) {
    if (rule.match.test(host)) return { source: rule.source, source_type: rule.type };
  }
  return { source: host, source_type: 'referral' };
}
