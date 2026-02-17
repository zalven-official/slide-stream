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
  Crosshair,
  Image as ImageIcon,
} from "lucide-react";
import { PPTRepository } from "@/assets/repo";
import { Screenshot, Presentation } from "@/assets/db";

// Use the actual browser type provided by WXT
declare const browser: any;

function Index() {
  const [activePpt, setActivePpt] = useState<Presentation | null>(null);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [mode, setMode] = useState<"idle" | "adjusting">("idle");

  // 1. Initial Load from real DB
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
    // Sort newest first
    setScreenshots(data.sort((a, b) => b.timestamp - a.timestamp));
  };

  const triggerCapture = useCallback(async () => {
    if (typeof browser === "undefined") return;
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
    if (typeof browser === "undefined") return;
    try {
      // Get rect
      const rect = await browser.tabs.sendMessage(tabId, { type: "GET_RECT" });
      if (!rect) throw new Error("Viewfinder not found");

      // Hide viewfinder for stealth capture
      await browser.tabs.sendMessage(tabId, { type: "HIDE_VIEWFINDER" });
      await new Promise((r) => setTimeout(r, 100)); // Repaint delay

      // Take screenshot
      const dataUrl = await browser.tabs.captureVisibleTab(
        browser.windows.WINDOW_ID_CURRENT,
        { format: "png" },
      );
      if (!dataUrl) throw new Error("Capture failed");

      // Crop
      const croppedBlob = await cropImage(dataUrl, rect);

      // Save to real IDB
      if (activePpt && croppedBlob) {
        await PPTRepository.addScreenshot(activePpt.id, croppedBlob);
        await browser.storage.local.set({ viewfinderDim: rect });
        await loadScreenshots(activePpt.id);
      }

      setMode("idle");
    } catch (err) {
      console.error("Capture failed:", err);
      setMode("idle");
    }
  };

  const cropImage = (src: string, rect: any): Promise<Blob | null> => {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        const sX = Math.max(0, rect.left * dpr);
        const sY = Math.max(0, rect.top * dpr);
        const sW = rect.width * dpr;
        const sH = rect.height * dpr;
        canvas.width = sW;
        canvas.height = sH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return rej("Canvas context failed");
        ctx.drawImage(img, sX, sY, sW, sH, 0, 0, sW, sH);
        canvas.toBlob((b) => res(b), "image/png");
      };
      img.onerror = () => rej("Image load error");
      img.src = src;
    });
  };

  const cancelCapture = async () => {
    if (typeof browser === "undefined") return;
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { type: "HIDE_VIEWFINDER" });
    }
    setMode("idle");
  };

  // Shortcut Listener
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
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
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shadow-sm">
            <LayoutDashboard className="w-4 h-4" />
          </div>
          <h1 className="text-base font-bold text-foreground tracking-tight">
            Slide Stream
          </h1>
        </div>
        <Badge
          variant="secondary"
          className="text-[10px] font-mono font-bold uppercase tracking-wider"
        >
          {activePpt?.name ?? "Project"}
        </Badge>
      </div>

      {/* Main Controls */}
      <div className="px-4 pt-4 pb-3 space-y-3 shrink-0">
        <div className="space-y-2">
          <Button
            onClick={triggerCapture}
            className="w-full gap-2 h-12 shadow-sm font-bold"
            variant={mode === "adjusting" ? "default" : "secondary"}
          >
            {mode === "adjusting" ? (
              <Check className="w-5 h-5 animate-in zoom-in" />
            ) : (
              <Crosshair className="w-5 h-5" />
            )}
            {mode === "adjusting" ? "Confirm Snap" : "Capture Slide"}
          </Button>

          <p className="text-[10px] text-center text-muted-foreground uppercase font-bold tracking-widest opacity-60">
            Press <kbd className="bg-muted px-1 rounded border">S</kbd> to{" "}
            {mode === "adjusting" ? "save" : "start"}
          </p>
        </div>

        {mode === "adjusting" && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 h-8 text-muted-foreground"
            onClick={cancelCapture}
          >
            <X className="w-3.5 h-3.5" />
            Cancel (Esc)
          </Button>
        )}
      </div>

      <Separator />

      {/* Gallery Header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">
          Slide Stack ({screenshots.length})
        </p>
        <Button
          variant="outline"
          size="xs"
          className="gap-1.5 h-7 text-[10px] font-bold"
        >
          <FileUp className="w-3 h-3" />
          EXPORT
        </Button>
      </div>
      <div className="overflow-y-auto min-h-0 relative">
        {/* Scrollable Gallery */}
        <div className="flex-1 overflow-y-auto min-h-0 w-full custom-scrollbar">
          <div className="px-4 pb-10 space-y-4 overflow-auto">
            {screenshots.map((s, i) => (
              <Card
                key={s.id ?? i}
                className="overflow-hidden group border-none bg-secondary/20 hover:ring-2 ring-primary/40 transition-all"
              >
                <CardContent className="p-0 relative">
                  <div className="absolute top-2 left-2 z-10">
                    <Badge
                      variant="secondary"
                      className="text-[9px] font-black px-1.5 py-0.5 bg-black/60 text-white border-none backdrop-blur-md"
                    >
                      SLIDE {screenshots.length - i}
                    </Badge>
                  </div>

                  <img
                    src={URL.createObjectURL(s.blob)}
                    alt="Screenshot"
                    className="w-full aspect-video object-cover"
                  />

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="w-8 h-8 rounded-full shadow-xl"
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
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 opacity-40">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-xs font-bold uppercase tracking-tighter">
                  No captures yet
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Index;
