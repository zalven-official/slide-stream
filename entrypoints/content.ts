import "./style.css";
import ReactDOM from "react-dom/client";
import { Camera } from "lucide-react";
import { PPTRepository } from "@/assets/repo";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // 1. --- GLOBAL VARIABLES ---
    let box: HTMLDivElement | null = null;
    let isDragging = false;
    let startX: number, startY: number, startLeft: number, startTop: number;

    // 2. --- YOUTUBE SPECIFIC LOGIC ---
    // Replace your existing injectYoutubeButton with this Vanilla version:
    const injectYoutubeButton = () => {
      const controlBar = document.querySelector(".ytp-right-controls");
      if (!controlBar || document.getElementById("snap-yt-btn")) return;

      const btn = document.createElement("button");
      btn.id = "snap-yt-btn";
      btn.className = "ytp-button";
      btn.title = "Instant Snapshot";

      // Manual styling since we aren't using JSX/React here
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.cursor = "pointer";

      // SVG for the Camera Icon (Vanilla equivalent of <Camera />)
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" 
             viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" 
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
      `;

      btn.onclick = (e) => handleYoutubeCapture(e);

      controlBar.prepend(btn);
    };

    const handleYoutubeCapture = async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const video = document.querySelector("video");
      if (!video) return;

      // 1. SELECT EVERY POSSIBLE UI OVERLAY
      const overlays = [
        ".ytp-chrome-bottom", // Progress bar & buttons
        ".ytp-chrome-top", // Title & Share
        ".ytp-gradient-bottom", // Bottom shadow
        ".ytp-gradient-top", // Top shadow
        ".ytp-bezel", // Large play/pause icon middle
        ".ytp-iv-video-content", // Annotation/Cards
        ".ytp-paid-content-overlay", // "Includes paid promotion"
        ".annotation", // Old style annotations
        ".ytp-subtitles-player-content", // Subtitles/Captions
      ];

      // 2. HIDE EVERYTHING (Using display: none is more reliable for screenshots)
      const elements = overlays.map(
        (selector) => document.querySelector(selector) as HTMLElement,
      );
      elements.forEach((el) => {
        if (el) el.style.setProperty("display", "none", "important");
      });

      const rect = video.getBoundingClientRect();

      // 3. WAIT 50ms (CRITICAL) - This gives the browser time to remove the UI
      setTimeout(() => {
        browser.runtime.sendMessage({
          type: "CAPTURE_VIDEO_AREA",
          payload: {
            rect: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
              dpr: window.devicePixelRatio || 1,
            },
          },
        });

        // 4. WAIT another 100ms for the background to finish, then bring everything back
        setTimeout(() => {
          elements.forEach((el) => {
            if (el) el.style.setProperty("display", "block", "");
          });

          // Visual Feedback
          video.style.filter = "brightness(1.5)";
          setTimeout(() => (video.style.filter = ""), 150);
        }, 100);
      }, 50);

      console.log("Requested Clean Frame...");
    };
    // FOOLPROOF FIX: Check the URL directly without using a variable
    if (window.location.hostname.includes("youtube.com")) {
      const observer = new MutationObserver(injectYoutubeButton);
      observer.observe(document.body, { childList: true, subtree: true });
      injectYoutubeButton();
    }

    // 3. --- UNIVERSAL VIEWFINDER LOGIC ---
    browser.runtime.onMessage.addListener(
      (msg: any, sender: any, sendResponse: any) => {
        if (msg.type === "SHOW_VIEWFINDER") {
          if (box) box.remove();
          box = document.createElement("div");
          box.id = "snap-viewfinder-universal";

          const d = msg.payload || {
            width: 400,
            height: 225,
            top: 100,
            left: 100,
          };
          Object.assign(box.style, {
            position: "fixed",
            left: `${d.left}px`,
            top: `${d.top}px`,
            width: `${d.width}px`,
            height: `${d.height}px`,
            zIndex: "2147483647",
          });

          box.innerHTML = `
          <div class="corner tl"></div><div class="corner tr"></div>
          <div class="corner bl"></div><div class="corner br"></div>
          <div class="drag-handle">Drag to Move / Pull Corner to Resize</div>
        `;
          document.body.appendChild(box);

          box.addEventListener("mousedown", (e: MouseEvent) => {
            if (
              e.offsetX > box!.clientWidth - 20 &&
              e.offsetY > box!.clientHeight - 20
            )
              return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(box!.style.left);
            startTop = parseInt(box!.style.top);

            const onMouseMove = (moveEvent: MouseEvent) => {
              if (!isDragging || !box) return;
              box.style.left = `${startLeft + (moveEvent.clientX - startX)}px`;
              box.style.top = `${startTop + (moveEvent.clientY - startY)}px`;
            };

            const onMouseUp = () => {
              isDragging = false;
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
          });
        }

        if (msg.type === "GET_RECT") {
          if (!box) return sendResponse(null);
          sendResponse(box.getBoundingClientRect());
        }

        if (msg.type === "HIDE_VIEWFINDER") {
          box?.remove();
          box = null;
        }
      },
    );
  },
});
