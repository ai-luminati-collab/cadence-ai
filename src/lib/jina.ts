export async function extractWebsiteContent(url: string): Promise<string | null> {
  if (!url) return null;
  
  // Ensure protocol
  let finalUrl = url.trim();
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = 'https://' + finalUrl;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    // Jina Reader API - Free tier, converts URL to Markdown
    const response = await fetch(`https://r.jina.ai/${finalUrl}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        // Optional: 'Authorization': 'Bearer YOUR_JINA_API_KEY'
        'X-Return-Format': 'markdown'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Jina API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data.data?.content || data.content || null;
  } catch (error) {
    console.error(`Failed to extract website content from ${finalUrl}:`, error);
    return null;
  }
}

/**
 * Deep multi-page extraction: scrapes the homepage, then discovers and
 * scrapes up to `maxSubpages` high-signal internal pages (about, products,
 * menu, services, pricing, story). Returns a combined markdown dossier.
 */
export async function extractWebsiteDeep(
  url: string,
  maxSubpages: number = 3
): Promise<string | null> {
  if (!url) return null;

  let base = url.trim();
  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'https://' + base;
  }

  const home = await extractWebsiteContent(base);
  if (!home) return null;

  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return home;
  }

  // Discover same-domain links in the homepage markdown
  const linkRe = /\]\((https?:\/\/[^)\s]+)\)/g;
  const HIGH_SIGNAL = /about|story|product|shop|menu|service|pricing|plans|features|collections|our-/i;
  const seen = new Set<string>([base, base + '/', origin, origin + '/']);
  const candidates: string[] = [];

  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(home)) !== null) {
    const link = m[1].split('#')[0].replace(/\/$/, '');
    if (!link.startsWith(origin) || seen.has(link)) continue;
    seen.add(link);
    if (HIGH_SIGNAL.test(link)) candidates.push(link);
  }

  const subpages = candidates.slice(0, maxSubpages);
  if (subpages.length === 0) return home;

  console.log(`🔎 Deep scrape: homepage + ${subpages.length} subpages`, subpages);
  const results = await Promise.allSettled(subpages.map(link => extractWebsiteContent(link)));

  const sections: string[] = [`## HOMEPAGE (${base})\n${home.substring(0, 12000)}`];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      sections.push(`## SUBPAGE (${subpages[i]})\n${r.value.substring(0, 5000)}`);
    }
  });

  return sections.join('\n\n');
}
