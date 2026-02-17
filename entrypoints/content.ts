import "./style.css";
export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    let box: HTMLDivElement | null = null;
    let isDragging = false;
    let startX: number, startY: number, startLeft: number, startTop: number;

    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

        // --- Dragging Logic ---
        box.addEventListener("mousedown", (e) => {
          // Don't drag if clicking the bottom-right resize handle
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
    });
  },
});
