import OpenAI from 'openai'
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
 *   PDF        → sent directly to OpenAI multimodal file input
 *   Image      → sent directly to OpenAI vision
 *   DOCX/PPTX  → text via officeparser  +  every embedded image extracted via JSZip and OCR'd by OpenAI vision
 *   TXT/MD     → read as UTF-8
 *
 * Returns a single normalized text blob per source ready to feed into productExtractor.extractFromText.
 */

const VISION_MODEL = 'gpt-5.5'

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
  return new OpenAI({ apiKey })
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

  // PDF → OpenAI multimodal file input
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const text = await openAIExtractFromPdf(fileName, buffer)
    return { source: fileName, text, warnings }
  }

  // Standalone images
  if (mimeType.startsWith('image/')) {
    const text = await openAIExtractFromImage(buffer, mimeType)
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

  // 2) Crack the zip and pull every embedded image, OCR each via OpenAI vision
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
          const ocr = await openAIExtractFromImage(buf, mime)
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

// ── OpenAI: PDF in one shot ──
async function openAIExtractFromPdf(fileName: string, buffer: Buffer): Promise<string> {
  const openai = getOpenAIClient()
  const base64 = buffer.toString('base64')

  const response = await openai.responses.create({
    model: VISION_MODEL,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: fileName,
            file_data: `data:application/pdf;base64,${base64}`,
          },
          {
            type: 'input_text',
            text:
              'Extract every product, menu item, service, package, SKU, or offering described in this document. ' +
              'Include any text visible inside images, photos, scanned pages, or graphics. ' +
              'For each item include: name, description, ingredients/features (if shown), price (if shown), category. ' +
              'Be exhaustive. Do not summarize. Output as plain text, one item per block, separated by blank lines.',
          },
        ],
      },
    ],
  })

  return (response.output_text ?? '').trim()
}

// ── OpenAI: single image OCR / extraction ──
async function openAIExtractFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  const openai = getOpenAIClient()
  const base64 = buffer.toString('base64')

  const response = await openai.responses.create({
    model: VISION_MODEL,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: `data:${mimeType};base64,${base64}`,
            detail: 'high',
          },
          {
            type: 'input_text',
            text:
              'Read this image carefully. Extract every product, menu item, service, price, description, or offering visible. ' +
              'Transcribe all readable text. If there are no products visible, return an empty response. ' +
              'Output as plain text, one item per line.',
          },
        ],
      },
    ],
  })

  return (response.output_text ?? '').trim()
}
