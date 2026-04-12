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
