import { PPTRepository } from "@/assets/repo";

export default defineBackground(() => {
  // --- ADD THIS LINE TO ENABLE SIDE PANEL ON CLICK ---
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CAPTURE_VIDEO_AREA") {
      (async () => {
        try {
          // 1. Capture the entire tab pixels
          const dataUrl = await browser.tabs.captureVisibleTab({
            format: "png",
          });

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
        } catch (err) {
          console.error("Capture failed in background:", err);
        }
      })();
      return true;
    }
  });
});

// Helper function remains the same
async function cropScreenshot(dataUrl: string, rect: any): Promise<Blob> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(
    rect.width * rect.dpr,
    rect.height * rect.dpr,
  );
  const ctx = canvas.getContext("2d");

  ctx?.drawImage(
    bitmap,
    rect.x * rect.dpr,
    rect.y * rect.dpr,
    rect.width * rect.dpr,
    rect.height * rect.dpr,
    0,
    0,
    rect.width * rect.dpr,
    rect.height * rect.dpr,
  );
  return await canvas.convertToBlob({ type: "image/png" });
}
