/** What the Distribution Tracker needs to publish a carousel to Instagram.
 *
 *  Instagram's publishing API takes one caption per carousel and reads JPEG
 *  only, so the per-slide captions fold into one and the slides are re-encoded
 *  in the browser before they leave the laptop. */

export const MAX_CAPTION_CHARS = 2200
export const MAX_SLIDES = 20
/** Instagram's feed width. The carousel builder renders slides at twice this. */
const FEED_WIDTH = 1080

/** One caption from a draft written slide by slide: the "Slide N:" labels go,
 *  the sections stay in slide order. A draft without labels comes back as is. */
export function singleCaptionFrom(draft: string): string {
  return draft
    .split(/^Slide \d+:[ \t]*$/m)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n")
}

/** Slide files in the order the builder numbered them, slide-02 before slide-10. */
export function orderSlides<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  )
}

export async function toInstagramJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const height = Math.round((bitmap.height / bitmap.width) * FEED_WIDTH)
  const canvas = document.createElement("canvas")
  canvas.width = FEED_WIDTH
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("This browser cannot prepare the slides.")
  context.drawImage(bitmap, 0, 0, FEED_WIDTH, height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("A slide could not be turned into a JPEG.")),
      "image/jpeg",
      0.92,
    ),
  )
}
