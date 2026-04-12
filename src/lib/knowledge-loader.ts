'use server'

import fs from 'fs'
import path from 'path'

/**
 * Master Knowledge Base Loader
 * Maps platform+format to the correct research-backed knowledge file.
 * These files are injected into AI prompts for content generation, 
 * calendar planning, and creative direction.
 */

const KB_DIR = path.join(process.cwd(), 'src', 'knowledge-base')

// Map platform+format combos to their knowledge files
const KB_MAP: Record<string, string> = {
  // Meta (Instagram/Facebook)
  'meta_reel':      '01-meta-reel-knowledge.md',
  'meta_carousel':  '02-meta-carousel-knowledge.md',
  'meta_static':    '03-meta-static-knowledge.md',
  'meta_story':     '04-meta-story-knowledge.md',
  'meta_video':     '01-meta-reel-knowledge.md', // Reels = video on Meta
  
  // X (Twitter)
  'x_text':         '05-x-text-knowledge.md',
  'x_thread':       '06-x-thread-knowledge.md',
  'x_image':        '07-x-image-video-knowledge.md',
  'x_video':        '07-x-image-video-knowledge.md',
  
  // LinkedIn
  'linkedin_text':      '08-linkedin-text-knowledge.md',
  'linkedin_article':   '08-linkedin-text-knowledge.md',
  'linkedin_carousel':  '09-linkedin-carousel-static-knowledge.md',
  'linkedin_static':    '09-linkedin-carousel-static-knowledge.md',
  'linkedin_video':     '10-linkedin-video-knowledge.md',
}

// Universal files that get appended to every prompt
const UNIVERSAL_FILES = [
  '11-cross-platform-intelligence.md',
  '12-universal-quality-standards.md',
  '13-content-examples-annotated.md',
  '14-anti-patterns.md',
]

/**
 * Get the platform-specific knowledge for a given platform+format combo.
 * Returns the full markdown content to inject into AI prompts.
 */
export async function getPlatformKnowledge(platform: string, format: string): Promise<string> {
  const key = `${platform.toLowerCase().replace(/[^a-z]/g, '')}_${format.toLowerCase().replace(/[^a-z]/g, '')}`
  
  // Try exact match first, then partial matches
  let kbFile = KB_MAP[key]
  
  if (!kbFile) {
    // Fuzzy match: try just the platform prefix
    for (const [mapKey, file] of Object.entries(KB_MAP)) {
      if (key.startsWith(mapKey.split('_')[0])) {
        kbFile = file
        break
      }
    }
  }
  
  let content = ''
  
  if (kbFile) {
    try {
      content = fs.readFileSync(path.join(KB_DIR, kbFile), 'utf-8')
    } catch {
      // File not found, continue without platform-specific knowledge
    }
  }
  
  return content
}

/**
 * Get the universal knowledge that applies to ALL platforms.
 * Includes cross-platform intelligence and quality standards.
 */
export async function getUniversalKnowledge(): Promise<string> {
  const parts: string[] = []
  
  for (const file of UNIVERSAL_FILES) {
    try {
      parts.push(fs.readFileSync(path.join(KB_DIR, file), 'utf-8'))
    } catch {
      // Skip missing files
    }
  }
  
  return parts.join('\n\n---\n\n')
}

/**
 * Get FULL knowledge context for a specific post.
 * Combines platform-specific + universal knowledge.
 * This is what gets injected into AI prompts.
 */
export async function getFullKnowledgeContext(platform: string, format: string): Promise<string> {
  const [platformKB, universalKB] = await Promise.all([
    getPlatformKnowledge(platform, format),
    getUniversalKnowledge()
  ])
  
  const parts: string[] = []
  
  if (platformKB) {
    parts.push(`=== PLATFORM-SPECIFIC KNOWLEDGE BASE ===\n${platformKB}`)
  }
  
  if (universalKB) {
    parts.push(`=== UNIVERSAL QUALITY STANDARDS ===\n${universalKB}`)
  }
  
  return parts.join('\n\n')
}

/**
 * Get ALL knowledge files concatenated — used for calendar-level planning
 * where the AI needs to understand all platforms to assign formats correctly.
 */
export async function getAllKnowledgeSummary(): Promise<string> {
  const allFiles = [...Object.values(KB_MAP), ...UNIVERSAL_FILES]
  const uniqueFiles = [...new Set(allFiles)]
  const parts: string[] = []
  
  for (const file of uniqueFiles) {
    try {
      const content = fs.readFileSync(path.join(KB_DIR, file), 'utf-8')
      // Extract just the headers and rules (skip detailed field descriptions for brevity)
      const lines = content.split('\n')
      const summary = lines.filter(l => 
        l.startsWith('#') || 
        l.startsWith('- ') || 
        l.startsWith('1.') || l.startsWith('2.') || l.startsWith('3.') ||
        l.includes('AI Rule:') ||
        l.includes('RULE') ||
        l.includes('Best Practice')
      ).join('\n')
      parts.push(summary)
    } catch {}
  }
  
  return parts.join('\n\n')
}
