export default defineContentScript({
  // Matches all websites
  matches: ["<all_urls>"],
  main() {
    let box: HTMLDivElement | null = null;

    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "SHOW_VIEWFINDER") {
        if (box) box.remove();
        box = document.createElement("div");
        box.id = "snap-viewfinder-universal";

        const d = msg.payload || {
          width: 600,
          height: 337,
          top: 100,
          left: 100,
        };

        Object.assign(box.style, {
          position: "fixed",
          left: `${d.left}px`,
          top: `${d.top}px`,
          width: `${d.width}px`,
          height: `${d.height}px`,
        });

        box.innerHTML = `
          <div class="corner tl"></div><div class="corner tr"></div>
          <div class="corner bl"></div><div class="corner br"></div>
          <div class="drag-handle">Drag to Move / Resize Corner</div>
        `;
        document.body.appendChild(box);
      }

      if (msg.type === "GET_RECT") {
        if (!box) return sendResponse(null);
        // We get the position relative to the viewport
        const rect = box.getBoundingClientRect();
        sendResponse({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }

      if (msg.type === "HIDE_VIEWFINDER") {
        box?.remove();
        box = null;
      }
    });
  },
});
