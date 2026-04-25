import { z } from "zod";

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        content: z.string().optional(),
      })
    )
    .optional(),
});

export async function enrichWithTavily(query: string): Promise<{
  verified: boolean;
  snippet?: string;
  sourceUrl?: string;
}> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !query.trim()) return { verified: false };

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 1,
        search_depth: "basic",
      }),
    });

    if (!res.ok) return { verified: false };
    const parsed = tavilyResponseSchema.parse(await res.json());
    const first = parsed.results?.[0];
    if (!first) return { verified: false };

    const haystack = `${first.title ?? ""} ${first.content ?? ""} ${first.url ?? ""}`.toLowerCase();
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2)
      .slice(0, 5);

    // Require at least 2 query token hits to reduce unrelated enrichment noise.
    const matched = tokens.filter((token) => haystack.includes(token)).length;
    if (matched < 2) return { verified: false };

    return {
      verified: true,
      snippet: first.content,
      sourceUrl: first.url,
    };
  } catch {
    return { verified: false };
  }
}
