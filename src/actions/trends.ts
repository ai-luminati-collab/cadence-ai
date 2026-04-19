'use server'
export const maxDuration = 60;

import { askExpertAgent } from '@/lib/openai-agent'
import { BrandInfo, Strategy } from '@/stores/brand'

export interface TrendItem {
  id: string
  title: string
  subreddit: string
  upvotes: number
  url: string
}

export async function fetchLiveTrends(): Promise<{ success: boolean; data?: TrendItem[]; error?: string }> {
  try {
    // We aggregate multiple entertainment/pop-culture hubs to source "Instagram-worthy" trends
    // e.g., movies, celebrity, viral memes.
    const sources = [
      'https://www.reddit.com/r/BollyBlindsNGossip/top.json?limit=4&t=day', // Indian Movies/Celeb Trends
      'https://www.reddit.com/r/popculturechat/top.json?limit=4&t=day',
      'https://www.reddit.com/r/movies/top.json?limit=3&t=day'
    ]

    const fetchPromises = sources.map(url => 
       fetch(url, {
          headers: { 'User-Agent': 'CadencePlatform/0.2' },
          next: { revalidate: 3600 }
       })
    )

    const responses = await Promise.all(fetchPromises)
    
    let items: TrendItem[] = []

    // 1. Process Reddit Entertainment Sources
    for (const res of responses) {
       if (res.ok) {
          const json = await res.json()
          const subItems = json.data.children.map((child: any) => ({
             id: child.data.id,
             title: child.data.title,
             subreddit: child.data.subreddit,
             upvotes: child.data.ups,
             url: child.data.url
          }))
          items = [...items, ...subItems]
       }
    }

    // 2. Process Instagram-Native Trends
    // If user has supplied a RapidAPI Key for Instagram Scraping, hit the aggressive proxy.
    // Otherwise, simulate known Instagram Reels trends for the demo environment to ensure platform flow continuity.
    if (process.env.RAPIDAPI_INSTAGRAM_KEY) {
       // Using the exact endpoint provided to scrape massive culture/meme hubs
       const targetAccounts = ['pubity', 'fuckjerry', 'daquan']
       const igPromises = targetAccounts.map(username => 
          fetch('https://instagram120.p.rapidapi.com/api/instagram/posts', {
             method: 'POST',
             headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': 'instagram120.p.rapidapi.com',
                'x-rapidapi-key': process.env.RAPIDAPI_INSTAGRAM_KEY!
             },
             body: JSON.stringify({ username, maxId: "" })
          })
       )

       try {
          const igResponses = await Promise.all(igPromises)
          for (const res of igResponses) {
             if (res.ok) {
                const json = await res.json()
                const edges = json.result?.edges || []
                
                const recentPosts = edges.slice(0, 2).map((edge: any) => {
                   const node = edge.node
                   return {
                      id: node.id || node.code,
                      title: (node.caption?.text || 'Trending Cultural Post').substring(0, 120).replace(/\n/g, ' ') + '...',
                      subreddit: 'Instagram: @' + (node.owner?.username || 'culture'),
                      upvotes: node.like_count || Math.floor(Math.random() * 500000) + 50000,
                      url: `https://instagram.com/p/${node.code}`
                   }
                })
                items = [...items, ...recentPosts]
             }
          }
       } catch (e) {
          console.error("IG API Failed:", e)
       }
    } else {
       // Simulated live Instagram Reel trends fallback
       const mockIgTrends: TrendItem[] = [
          { id: 'ig_1', title: 'Trending Audio: "Pedro Pedro Pedro" raccoon dancing meme', subreddit: 'Instagram Reels', upvotes: 950000, url: 'https://instagram.com/reels/' },
          { id: 'ig_2', title: 'Format: "We are [X], of course we [Y]" office tours', subreddit: 'Instagram Reels', upvotes: 620000, url: 'https://instagram.com/reels/' },
          { id: 'ig_3', title: 'Transition: Point of View (POV) screen tap zoom-in', subreddit: 'Instagram Reels', upvotes: 410000, url: 'https://instagram.com/reels/' }
       ]
       items = [...items, ...mockIgTrends]
    }

    // Sort by upvotes to get the most viral ones at the top
    items.sort((a, b) => b.upvotes - a.upvotes)

    return { success: true, data: items };
  } catch (e: any) {
    console.error("fetchLiveTrends Failed: ", e);
    return { success: false, error: e.message || "Failed to fetch live trends" };
  }
}

export async function hijackTrend(
   trendTitle: string,
   brandInfo: BrandInfo,
   strategy: Strategy
) {
   if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR_KEY_HERE')) {
     throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
   }

   const prompt = `
     System Prompt – Legendary Marketer (Trend Hijacking Specialist)
     You are the world's most clever and ruthless reactive marketer.
     Your goal: Bridge a massive cultural moment with a brand's core DNA without looking like a "trying-too-hard" corporate suit.

     Current Cultural Pulse: "${trendTitle}"
     
     Client Intelligence:
     Brand Name: ${brandInfo.name}
     Industry: ${brandInfo.industry}
     Strategic Voice: ${strategy.persona}
     Target Audience Psychographics: ${strategy.targetAudience}
     Psychographic Triggers to Pull: ${strategy.psychographicTriggers || 'General Appeal'}
     One-Line Strategy: ${strategy.oneLineStrategy}

     CRITICAL HIJACKING LAWS:
     1. NATIVE-FIRST: The content must feel like a high-performing creator post, not an ad.
     2. THE CLEVER BRIDGE: Find the sub-surface connection between the trend's tension and the brand's promise.
     3. NO PUFFERY: Don't just say "we like this trend". Use it to prove a brand code.

     Return your response STRICTLY as a JSON object with this exact structure (no markdown wrappers):
     {
        "strategicRationale": "A 2-3 sentence explanation of WHY this specific hijack works for this brand's TG and psychographic triggers.",
        "hook": "The first 3 seconds: A high-impact opening that stops the scroll.",
        "caption": "The witty, punchy, and culturally resonant caption. Use brand codes natively.",
        "visualIdea": "A detailed brief for a Reel, Meme, or Photo. Specify the 'look and feel', the 'transition', or the 'meme template' needed.",
        "engagementHack": "A specific question or CTA that exploits the current trend conversation to drive comments.",
        "viralityScore": "A percentage (e.g. 85%) based on trend relevance vs brand fit.",
        "executionComplexity": "Low/Medium/High"
     }
     
     Output must be 100% valid JSON. Do not include \`\`\`json blocks.
   `;

   try {
      const res = await askExpertAgent(prompt, true); // skipReview — real-time trend speed
      if (!res.success) throw new Error("Agent failed execution.");

      let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim();
      return { success: true, data: JSON.parse(resultText) };
   } catch (error: any) {
      console.error("Trend Hijack Failed:", error);
      return { success: false, error: error.message || "Failed to hijack trend" };
   }
}
