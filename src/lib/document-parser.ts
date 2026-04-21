import { GoogleGenAI, createPartFromBase64 } from '@google/genai'
import { parseOffice, OfficeParserAST, OfficeContentNode } from 'officeparser'
import JSZip from 'jszip'

function astToText(ast: OfficeParserAST): string {
  const walk = (n: OfficeContentNode): string => {
    if (n.text && n.text.trim()) return n.text
    if (n.children?.length) return n.children.map(walk).join('\n')
    return ''
  }
  return ast.content.map(walk).filter(Boolean).join('\n')
}

/**
 * Multi-format document parser for the Smart Product Importer.
 *
 * Strategy per file type:
 *   PDF        → sent directly to Gemini 2.5 Pro (handles embedded images, scans, layouts natively)
 *   Image      → sent directly to Gemini 2.5 Pro vision
 *   DOCX/PPTX  → text via officeparser  +  every embedded image extracted via JSZip and OCR'd by Gemini
 *   TXT/MD     → read as UTF-8
 *
 * Returns a single normalized text blob per source ready to feed into productExtractor.extractFromText.
 */

const GEMINI_MODEL = 'gemini-2.5-pro'

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('Missing GOOGLE_API_KEY')
  return new GoogleGenAI({ apiKey })
}

export interface ParsedDocument {
  source: string           // file name
  text: string             // concatenated extraction
  warnings?: string[]
}

// ── Public entry point ──
export async function parseDocument(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<ParsedDocument> {
  const lower = fileName.toLowerCase()
  const warnings: string[] = []

  // PDF → Gemini multimodal (best for menus / brochures with images)
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const text = await geminiExtractFromPdf(buffer)
    return { source: fileName, text, warnings }
  }

  // Standalone images
  if (mimeType.startsWith('image/')) {
    const text = await geminiExtractFromImage(buffer, mimeType)
    return { source: fileName, text, warnings }
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    return await parseOfficeDocWithImages(fileName, buffer, 'word')
  }

  // PPTX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lower.endsWith('.pptx')
  ) {
    return await parseOfficeDocWithImages(fileName, buffer, 'ppt')
  }

  // Plain text / markdown
  if (mimeType.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md')) {
    return { source: fileName, text: buffer.toString('utf-8'), warnings }
  }

  // Fallback — try officeparser, it handles xlsx / odt / odp too
  try {
    const ast = await parseOffice(buffer)
    return { source: fileName, text: astToText(ast), warnings }
  } catch {
    warnings.push(`Unsupported file type for ${fileName} (${mimeType})`)
    return { source: fileName, text: '', warnings }
  }
}

// ── DOCX / PPTX with embedded image OCR ──
async function parseOfficeDocWithImages(
  fileName: string,
  buffer: Buffer,
  kind: 'word' | 'ppt'
): Promise<ParsedDocument> {
  const warnings: string[] = []

  // 1) Native text via officeparser
  let bodyText = ''
  try {
    const ast = await parseOffice(buffer)
    bodyText = astToText(ast)
  } catch (e: any) {
    warnings.push(`officeparser failed on ${fileName}: ${e?.message ?? e}`)
  }

  // 2) Crack the zip and pull every embedded image, OCR each via Gemini vision
  let imageOcrText = ''
  try {
    const zip = await JSZip.loadAsync(buffer)
    const mediaFolder = kind === 'word' ? 'word/media/' : 'ppt/media/'
    const imageEntries = Object.keys(zip.files).filter(
      (p) => p.startsWith(mediaFolder) && /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(p)
    )

    if (imageEntries.length > 0) {
      const ocrResults: string[] = []
      // Sequential to avoid burst-rate limits; small files only
      for (const path of imageEntries) {
        const ext = path.split('.').pop()!.toLowerCase()
        const mime =
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
          ext === 'png' ? 'image/png' :
          ext === 'gif' ? 'image/gif' :
          ext === 'webp' ? 'image/webp' :
          'image/png'

        try {
          const buf = Buffer.from(await zip.files[path].async('arraybuffer'))
          // Skip tiny icons / chrome elements
          if (buf.byteLength < 4 * 1024) continue
          const ocr = await geminiExtractFromImage(buf, mime)
          if (ocr && ocr.trim().length > 0) {
            ocrResults.push(`[Embedded image: ${path.split('/').pop()}]\n${ocr}`)
          }
        } catch (e: any) {
          warnings.push(`OCR failed for ${path}: ${e?.message ?? e}`)
        }
      }
      imageOcrText = ocrResults.join('\n\n')
    }
  } catch (e: any) {
    warnings.push(`Could not unzip ${fileName} for image extraction: ${e?.message ?? e}`)
  }

  const combined = [bodyText, imageOcrText].filter(Boolean).join('\n\n--- EMBEDDED IMAGE OCR ---\n\n')
  return { source: fileName, text: combined, warnings }
}

// ── Gemini: PDF in one shot ──
async function geminiExtractFromPdf(buffer: Buffer): Promise<string> {
  const ai = getGeminiClient()
  const base64 = buffer.toString('base64')

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          createPartFromBase64(base64, 'application/pdf'),
          {
            text:
              'Extract every product, menu item, service, package, SKU, or offering described in this document. ' +
              'Include any text visible inside images, photos, scanned pages, or graphics. ' +
              'For each item include: name, description, ingredients/features (if shown), price (if shown), category. ' +
              'Be exhaustive — do not summarise. Output as plain text, one item per block, separated by blank lines.',
          },
        ],
      },
    ],
  })

  return (response.text ?? '').trim()
}

// ── Gemini: single image OCR / extraction ──
async function geminiExtractFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  const ai = getGeminiClient()
  const base64 = buffer.toString('base64')

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          createPartFromBase64(base64, mimeType),
          {
            text:
              'Read this image carefully. Extract every product, menu item, service, price, description, or offering visible. ' +
              'Transcribe all readable text. If there are no products visible, return an empty response. ' +
              'Output as plain text, one item per line.',
          },
        ],
      },
    ],
  })

  return (response.text ?? '').trim()
}
