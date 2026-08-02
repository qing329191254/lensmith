import { generateImage } from "@/api/seq"

export function gridPosition(index: number, columns: 2 | 3) {
  const row = Math.floor(index / columns) + 1
  const col = (index % columns) + 1
  return { row, col, position: `Row ${row}, Column ${col}` }
}

function buildExtractionPrompt(index: number, columns: 2 | 3, kind: "main" | "transition") {
  const { position } = gridPosition(index, columns)

  if (kind === "transition") {
    return `
      Look at the provided transition storyboard grid.
      Extract strictly the single panel at position #${index + 1} (reading order: ${position}).
      Generate a high-resolution, full-frame cinematic version of THIS SPECIFIC PANEL ONLY.

      This is a transition keyframe (first or last frame).
      - Remove any text, captions, numbers, or borders.
      - Ensure the aspect ratio is standard 16:9 cinematic.
      - Maintain strict visual consistency with the master style.
    `.trim()
  }

  return `
      Look at the provided storyboard grid.
      Extract strictly the single panel at position #${index + 1} (reading order: ${position}).
      Generate a high-resolution, full-frame cinematic version of THIS SPECIFIC PANEL ONLY.

      QC INSTRUCTIONS:
      - Remove any text, captions, numbers, or borders.
      - Fix any non-standard elements or distortions.
      - Ensure the aspect ratio is standard 16:9 cinematic.
      - Maintain strict visual consistency with the master style.
      - This is a direct visual extraction and upscaling task.
    `.trim()
}

export async function extractPanelFromGrid(
  index: number,
  sourceUrl: string,
  opts: { columns: 2 | 3; kind: "main" | "transition" },
): Promise<string | null> {
  const formData = new FormData()
  formData.append("mode", "image-editing")
  formData.append("prompt", buildExtractionPrompt(index, opts.columns, opts.kind))
  formData.append("image1Url", sourceUrl)
  formData.append("aspectRatio", "landscape")

  try {
    const data = await generateImage(formData)
    return data.url || null
  } catch (e) {
    console.error(`Panel ${index + 1} extraction error:`, e)
    return null
  }
}

export async function extractAllPanels(
  sourceUrl: string,
  count: number,
  opts: { columns: 2 | 3; kind: "main" | "transition" },
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const extracted: string[] = []

  for (let i = 0; i < count; i++) {
    const url = await extractPanelFromGrid(i, sourceUrl, opts)
    if (url) extracted.push(url)
    onProgress?.(i + 1, count)
  }

  return extracted
}
