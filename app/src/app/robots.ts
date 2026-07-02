import type { MetadataRoute } from 'next';

// Strictly private tool: disallowed for all search engines and AI.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
