import { PPTRepository } from "@/assets/repo";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CAPTURE_VIDEO_AREA") {
      (async () => {
        // 1. Capture the entire tab pixels (ignores YouTube security)
        const dataUrl = await browser.tabs.captureVisibleTab({ format: "png" });

        // 2. Crop the image to just the video player
        const blob = await cropScreenshot(dataUrl, msg.payload.rect);

        // 3. Save to Database
        const ppts = await PPTRepository.getAllPresentations();
        let targetPpt =
          ppts.find((p) => p.name === "YouTube Captures") || ppts[0];

        if (!targetPpt) {
          targetPpt =
            await PPTRepository.createPresentation("YouTube Captures");
        }

        await PPTRepository.addScreenshot(targetPpt.id, blob);
        console.log("Saved cropped YouTube capture!");
      })();
      return true;
    }

    // Keep your existing SAVE_YOUTUBE_CAPTURE logic if needed for other things
  });
});

// Helper function to crop the screenshot in the background
async function cropScreenshot(dataUrl: string, rect: any): Promise<Blob> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  // We use OffscreenCanvas because standard 'document.createElement' doesn't exist in background
  const canvas = new OffscreenCanvas(
    rect.width * rect.dpr,
    rect.height * rect.dpr,
  );
  const ctx = canvas.getContext("2d");

  // Inside your background crop function:
  // Source (the full screenshot) -> Destination (the small video blob)
  ctx?.drawImage(
    bitmap,
    rect.x * rect.dpr, // Start at the left of the video
    rect.y * rect.dpr, // Start at the top of the video
    rect.width * rect.dpr,
    rect.height * rect.dpr,
    0,
    0,
    rect.width * rect.dpr,
    rect.height * rect.dpr,
  );
  return await canvas.convertToBlob({ type: "image/png" });
}
