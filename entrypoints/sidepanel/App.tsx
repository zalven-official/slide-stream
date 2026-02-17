import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Camera,
  FileUp,
  Trash2,
  LayoutDashboard,
  X,
  Check,
  Crosshair,
  Image as ImageIcon,
  FileSpreadsheet,
  FileArchive,
  ChevronDown,
  Presentation as PptIcon, // Added icon for PPT
} from "lucide-react";
import { PPTRepository } from "@/assets/repo";
import { Screenshot, Presentation } from "@/assets/db";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import pptxgen from "pptxgenjs"; // Added PPT library

declare const browser: any;

function Index() {
  const [activePpt, setActivePpt] = useState<Presentation | null>(null);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [mode, setMode] = useState<"idle" | "adjusting">("idle");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const ppts = await PPTRepository.getAllPresentations();
      let current =
        ppts[0] || (await PPTRepository.createPresentation("My Project"));
      setActivePpt(current);
      loadScreenshots(current.id);
    };
    init();
  }, []);

  const loadScreenshots = async (id: string) => {
    const data = await PPTRepository.getScreenshotsByPPT(id);
    setScreenshots(data.sort((a, b) => b.timestamp - a.timestamp));
  };
  const exportAsPPT = async () => {
    if (screenshots.length === 0) return;
    setIsExporting(true);

    try {
      const pres = new pptxgen();

      // We'll use the standard layout
      pres.layout = "LAYOUT_16x9";

      const chronological = [...screenshots].reverse();

      for (const [index, s] of chronological.entries()) {
        const slide = pres.addSlide();

        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(s.blob);
        });

        slide.addImage({
          data: base64,
          x: 0,
          y: 0,
          w: "100%",
          h: "100%",
        });
      }
      const blob = (await pres.write({ outputType: "blob" })) as Blob;
      saveAs(blob, `${activePpt?.name || "SlideStream"}.pptx`);
    } catch (error) {
      console.error("PPT Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };
  const exportAsImages = async () => {
    if (screenshots.length === 0) return;
    setIsExporting(true);
    const zip = new JSZip();

    screenshots.forEach((s, index) => {
      const fileName = `slide-${screenshots.length - index}.png`;
      zip.file(fileName, s.blob);
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${activePpt?.name || "slides"}-images.zip`);
    setIsExporting(false);
  };

  const exportAsExcel = () => {
    if (screenshots.length === 0) return;
    const data = screenshots.map((s, index) => ({
      Slide: screenshots.length - index,
      Timestamp: new Date(s.timestamp).toLocaleString(),
      ID: s.id,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Slides");
    XLSX.writeFile(workbook, `${activePpt?.name || "slides"}-report.xlsx`);
  };

  // --- CAPTURE LOGIC ---

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
    try {
      const rect = await browser.tabs.sendMessage(tabId, { type: "GET_RECT" });
      if (!rect) throw new Error("Viewfinder not found");

      await browser.tabs.sendMessage(tabId, { type: "HIDE_VIEWFINDER" });

      // IMPORTANT: Google Slides/Canva need a longer delay (250ms+)
      // to re-render the canvas properly after the viewfinder overlay is hidden.
      await new Promise((r) => setTimeout(r, 250));

      const dataUrl = await browser.tabs.captureVisibleTab(
        browser.windows.WINDOW_ID_CURRENT,
        { format: "png" },
      );

      const croppedBlob = await cropImage(dataUrl, rect);

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
    return new Promise((res) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(
          img,
          rect.left * dpr,
          rect.top * dpr,
          rect.width * dpr,
          rect.height * dpr,
          0,
          0,
          rect.width * dpr,
          rect.height * dpr,
        );
        canvas.toBlob((b) => res(b), "image/png");
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
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shadow-sm">
            <LayoutDashboard className="w-4 h-4" />
          </div>
          <h1 className="text-base font-bold tracking-tight">Slide Stream</h1>
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
        {mode === "adjusting" && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-muted-foreground"
            onClick={cancelCapture}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Cancel (Esc)
          </Button>
        )}
      </div>

      <Separator />

      {/* Gallery Header with Dropdown */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 bg-background/95 backdrop-blur-sm z-10">
        <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">
          Slide Stack ({screenshots.length})
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              className="gap-1.5 h-7 text-[10px] font-bold border-primary/20"
              disabled={screenshots.length === 0 || isExporting}
            >
              <FileUp className="w-3 h-3" />
              {isExporting ? "EXPORTING..." : "EXPORT"}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={exportAsPPT}
              className="gap-2 cursor-pointer"
            >
              <PptIcon className="w-4 h-4 text-red-500" />
              <span className="font-medium">PowerPoint (.pptx)</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={exportAsImages}
              className="gap-2 cursor-pointer"
            >
              <FileArchive className="w-4 h-4 text-orange-500" />
              <span className="font-medium">Images (ZIP)</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={exportAsExcel}
              className="gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="font-medium">Report (Excel)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Scrollable Gallery */}
      <div className="flex-1 overflow-y-auto min-h-0 w-full custom-scrollbar">
        <div className="px-4 pb-10 space-y-4">
          {screenshots.map((s, i) => (
            <Card
              key={s.id ?? i}
              className="overflow-hidden group border-none bg-secondary/20 hover:ring-2 ring-primary/40 transition-all shadow-sm"
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
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-3 opacity-40">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-tighter">
                Stack is empty
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Index;
