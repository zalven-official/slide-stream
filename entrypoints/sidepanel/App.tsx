import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

  useEffect(() => {
    const init = async () => {
      const ppts = await PPTRepository.getAllPresentations();
      let current = ppts[0];
      if (!current) {
        const id = await PPTRepository.createPresentation("My Video Deck");
        current = { id, name: "My Video Deck", createdAt: Date.now() };
      }
      setActivePpt(current);
      loadScreenshots(current.id);
    };
    init();
  }, []);

  const loadScreenshots = async (id: string) => {
    const data = await PPTRepository.getScreenshotsByPPT(id);
    setScreenshots(data.sort((a, b) => b.timestamp - a.timestamp)); // Newest first
  };

  const toggleViewfinder = async () => {
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
  };

  const captureAndSave = async (tabId: number) => {
    // 1. Get location from box
    const rect = await browser.tabs.sendMessage(tabId, { type: "GET_RECT" });
    if (!rect) return;

    // 2. Save location for next time
    await browser.storage.local.set({
      viewfinderDim: {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      },
    });

    // 3. Take screenshot
    const dataUrl = await browser.tabs.captureVisibleTab();

    // 4. Crop using Canvas
    const croppedBlob = await cropImage(dataUrl, rect);

    // 5. Save to DB
    if (activePpt) {
      await PPTRepository.addScreenshot(activePpt.id, croppedBlob);
      await loadScreenshots(activePpt.id);
    }

    // 6. Cleanup
    await browser.tabs.sendMessage(tabId, { type: "HIDE_VIEWFINDER" });
    setMode("idle");
  };

  const cropImage = (src: string, rect: any): Promise<Blob> => {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(
          img,
          rect.left * dpr,
          rect.top * dpr,
          rect.width * dpr,
          rect.height * dpr,
          0,
          0,
          rect.width,
          rect.height,
        );
        canvas.toBlob((b) => res(b!), "image/png");
      };
      img.src = src;
    });
  };

  const cancelCapture = async () => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id)
      await browser.tabs.sendMessage(tab.id, { type: "HIDE_VIEWFINDER" });
    setMode("idle");
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground p-4 gap-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="font-bold text-lg leading-none">SnapStack</h1>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <Button
          onClick={toggleViewfinder}
          className="w-full h-12 text-md font-semibold gap-2 shadow-lg"
          variant={mode === "adjusting" ? "default" : "secondary"}
        >
          {mode === "adjusting" ? (
            <Check className="w-5 h-5" />
          ) : (
            <Camera className="w-5 h-5" />
          )}
          {mode === "adjusting" ? "Confirm Snap" : "Capture YouTube Slide"}
        </Button>

        {mode === "adjusting" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelCapture}
            className="text-muted-foreground"
          >
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
        )}
      </div>

      <Separator />

      <div className="flex-1 overflow-hidden flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Current Stack ({screenshots.length})
          </span>
          <Button variant="outline" size="xs" className="h-7 text-xs gap-1">
            <FileUp className="w-3 h-3" /> Export PPT
          </Button>
        </div>

        <ScrollArea className="flex-1 pr-3">
          <div className="flex flex-col gap-4">
            {screenshots.map((s) => (
              <Card
                key={s.id}
                className="group relative border-none bg-secondary/30 overflow-hidden transition-all hover:ring-2 ring-primary/50"
              >
                <CardContent className="p-0">
                  <img
                    src={URL.createObjectURL(s.blob)}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      variant="destructive"
                      size="icon"
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
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl opacity-40">
                <Camera className="w-8 h-8 mb-2" />
                <p className="text-sm">Ready for your first capture</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export default App;
