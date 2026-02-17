import ReactDOM from "react-dom/client";
import { Camera } from "lucide-react";
import { PPTRepository } from "@/assets/repo";

export default defineContentScript({
  matches: ["<all_urls>"], // Works on every website
  main(ctx) {
    const injectFloatingButton = () => {
      if (document.getElementById("snapstack-floating-btn")) return;

      const container = document.createElement("div");
      container.id = "snapstack-floating-btn";

      // Styling the floating button
      Object.assign(container.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: "2147483647", // Max z-index to stay on top
        width: "44px",
        height: "44px",
        backgroundColor: "#000",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        border: "2px solid #fff",
        transition: "transform 0.2s",
      });

      container.onmouseenter = () => (container.style.transform = "scale(1.1)");
      container.onmouseleave = () => (container.style.transform = "scale(1)");

      document.body.appendChild(container);

      const root = ReactDOM.createRoot(container);
      root.render(
        <div onClick={handleGlobalCapture}>
          <Camera size={22} color="white" />
        </div>,
      );
    };

    const handleGlobalCapture = async () => {
      // 1. Send message to background to take a tab screenshot
      // Content scripts can't capture the tab, so we ask the background script
      const dataUrl = await browser.runtime.sendMessage({
        type: "SCREENSHOT_CURRENT_TAB",
      });

      if (dataUrl) {
        // 2. Convert DataURL to Blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        // 3. Save to Database
        const ppts = await PPTRepository.getAllPresentations();
        const activePpt =
          ppts[0] || (await PPTRepository.createPresentation("My Project"));

        await PPTRepository.addScreenshot(activePpt.id, blob);

        // Visual Feedback (Flash)
        const flash = document.createElement("div");
        Object.assign(flash.style, {
          position: "fixed",
          inset: "0",
          backgroundColor: "white",
          zIndex: "2147483647",
          opacity: "0.8",
          transition: "opacity 0.2s",
        });
        document.body.appendChild(flash);
        setTimeout(() => {
          flash.style.opacity = "0";
          setTimeout(() => flash.remove(), 200);
        }, 50);
      }
    };

    injectFloatingButton();
  },
});
