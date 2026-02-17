import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  FileUp,
  Trash2,
  LayoutDashboard,
  X,
  Check,
} from "lucide-react";
import { PPTRepository } from "@/assets/repo";
import { Screenshot, Presentation } from "@/assets/db";

function App() {
  const [activePpt, setActivePpt] = useState<Presentation | null>(null);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [mode, setMode] = useState<"idle" | "adjusting">("idle");

  // 1. Initial Load: Get or Create Project
  useEffect(() => {
    const init = async () => {
      const ppts = await PPTRepository.getAllPresentations();
      let current = ppts[0];
      if (!current) {
        current = await PPTRepository.createPresentation("My Project");
      }
      setActivePpt(current);
      loadScreenshots(current.id);
    };
    init();
  }, []);

  const loadScreenshots = async (id: string) => {
    const data = await PPTRepository.getScreenshotsByPPT(id);
    setScreenshots(data.sort((a, b) => b.timestamp - a.timestamp));
  };

  // 2. Capture Engine
  const triggerCapture = useCallback(async () => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return;

    if (mode === "idle") {
      const saved = await browser.storage.local.get("viewfinderDim");
      await browser.tabs.sendMessage(tab.id, {
        type: "SHOW_VIEWFINDER",
        payload: saved.viewfinderDim,
      });
      setMode("adjusting");
    } else {
      await captureAndSave(tab.id);
    }
  }, [mode, activePpt]);

  const captureAndSave = async (tabId: number) => {
    try {
      // A. Get the box position
      const rect = await browser.tabs.sendMessage(tabId, { type: "GET_RECT" });
      if (!rect) throw new Error("Viewfinder not found");

      // B. Save position for next time
      await browser.storage.local.set({ viewfinderDim: rect });

      // C. STEALTH MODE: Hide the blue box so it isn't in the screenshot
      await browser.tabs.sendMessage(tabId, { type: "HIDE_VIEWFINDER" });

      // D. Wait for browser repaint (essential to avoid capturing the blue box)
      await new Promise((r) => setTimeout(r, 100));

      // E. Take the clean screenshot
      const dataUrl = await browser.tabs.captureVisibleTab(
        browser.windows.WINDOW_ID_CURRENT,
        {
          format: "png",
        },
      );
      if (!dataUrl) throw new Error("Capture failed");

      // F. Crop the image
      const croppedBlob = await cropImage(dataUrl, rect);

      // G. Save to Database
      if (activePpt && croppedBlob) {
        await PPTRepository.addScreenshot(activePpt.id, croppedBlob);
        await loadScreenshots(activePpt.id);
      }

      setMode("idle");
    } catch (err) {
      console.error("Capture failed:", err);
      setMode("idle");
    }
  };

  const cropImage = (src: string, rect: any): Promise<Blob> => {
    return new Promise((res, rej) => {
      const img = new Image();
      // Allow capturing images from other domains
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;

        // Ensure we handle High DPI (Retina) screens correctly
        const sX = Math.max(0, rect.left * dpr);
        const sY = Math.max(0, rect.top * dpr);
        const sW = rect.width * dpr;
        const sH = rect.height * dpr;

        canvas.width = sW;
        canvas.height = sH;

        const ctx = canvas.getContext("2d");
        if (!ctx) return rej("Canvas context failed");

        ctx.drawImage(img, sX, sY, sW, sH, 0, 0, sW, sH);

        canvas.toBlob((b) => {
          if (b) res(b);
          else rej("Blob generation failed");
        }, "image/png");
      };
      img.onerror = () => rej("Image load error");
      img.src = src;
    });
  };

  const cancelCapture = async () => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { type: "HIDE_VIEWFINDER" });
    }
    setMode("idle");
  };

  // 3. Shortcuts: S to toggle/confirm, Escape to cancel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't trigger if user is typing in an input
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        triggerCapture();
      }
      if (e.key === "Escape" && mode === "adjusting") {
        cancelCapture();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [triggerCapture, mode]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="p-4 border-b flex items-center justify-between bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg shadow-lg">
            <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="font-bold text-sm tracking-tight">SnapStack</h1>
        </div>
        <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
          {activePpt?.name}
        </Badge>
      </header>

      {/* Main Controls */}
      <div className="p-4 flex flex-col gap-4 flex-1 overflow-hidden">
        <Button
          onClick={triggerCapture}
          className="w-full h-16 flex-col items-center justify-center gap-1 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
          variant={mode === "adjusting" ? "default" : "secondary"}
        >
          <div className="flex items-center gap-2 font-bold">
            {mode === "adjusting" ? (
              <Check className="w-5 h-5 animate-in zoom-in" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
            {mode === "adjusting" ? "Confirm Selection" : "Open Viewfinder"}
          </div>
          <span className="text-[10px] font-normal opacity-60">
            Press <kbd className="border bg-muted px-1 rounded mx-1">S</kbd> to{" "}
            {mode === "adjusting" ? "capture" : "start"}
          </span>
        </Button>

        {mode === "adjusting" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelCapture}
            className="h-6 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3 h-3 mr-1" /> Cancel (Esc)
          </Button>
        )}

        <Separator />

        {/* Gallery Section */}
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
            Slide Stack ({screenshots.length})
          </h2>
          <Button
            variant="outline"
            size="xs"
            className="h-7 text-xs gap-1 font-semibold border-primary/20 hover:border-primary/50"
          >
            <FileUp className="w-3 h-3" /> Export PPT
          </Button>
        </div>

        <ScrollArea className="flex-1 -mr-2 pr-2">
          <div className="flex flex-col gap-4 pb-12 mt-1">
            {screenshots.map((s, i) => (
              <Card
                key={s.id}
                className="group relative border-none bg-secondary/20 rounded-xl overflow-hidden shadow-sm hover:ring-2 ring-primary/40 transition-all"
              >
                <CardContent className="p-0">
                  <div className="absolute top-2 left-2 z-10">
                    <span className="bg-black/70 text-white text-[9px] font-black px-2 py-0.5 rounded-md backdrop-blur-md border border-white/10">
                      SLIDE {screenshots.length - i}
                    </span>
                  </div>
                  <img
                    src={URL.createObjectURL(s.blob)}
                    className="w-full aspect-video object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="rounded-full h-9 w-9 shadow-2xl"
                      onClick={() =>
                        s.id &&
                        PPTRepository.deleteScreenshot(s.id).then(
                          () => activePpt && loadScreenshots(activePpt.id),
                        )
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {screenshots.length === 0 && (
              <div className="py-20 text-center border-2 border-dashed rounded-2xl border-muted/20 opacity-40 flex flex-col items-center">
                <Camera className="w-10 h-10 mb-2" />
                <p className="text-sm italic">No captures yet</p>
                <p className="text-[10px] mt-1 text-balance">
                  Navigate to a website and press 'S' to begin.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export default App;
