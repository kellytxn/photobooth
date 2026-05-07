"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { FilterType } from "@/app/page";

interface StripPreviewProps {
  photos: string[];
  clips: Blob[];
  filter: FilterType;
  setFilter: (f: FilterType) => void;
  onRetake: () => void;
}

const filters: { id: FilterType; label: string; css: string }[] = [
  { id: "none", label: "Original", css: "none" },
  { id: "grayscale", label: "B&W", css: "grayscale(100%)" },
  { id: "sepia", label: "Sepia", css: "sepia(80%)" },
  { id: "warm", label: "Warm", css: "saturate(1.3) hue-rotate(-10deg)" },
  { id: "cool", label: "Cool", css: "saturate(0.9) hue-rotate(20deg) brightness(1.05)" },
  { id: "vintage", label: "Vintage", css: "sepia(30%) contrast(1.1) brightness(0.95) saturate(1.2)" },
];

function getFilterCSS(filter: FilterType): string {
  return filters.find(f => f.id === filter)?.css ?? "none";
}

const stripColors = [
  { id: "white", label: "White", hex: "#ffffff" },
  { id: "black", label: "Black", hex: "#1a1a1a" },
  { id: "pink", label: "Pink", hex: "#fce4ec" },
  { id: "lavender", label: "Lavender", hex: "#ede7f6" },
  { id: "mint", label: "Mint", hex: "#e0f2f1" },
  { id: "peach", label: "Peach", hex: "#fff3e0" },
];

export function StripPreview({ photos, clips, filter, setFilter, onRetake }: StripPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stripDataUrl, setStripDataUrl] = useState<string>("");
  const [stripColor, setStripColor] = useState("#ffffff");
  const [isRecordingLive, setIsRecordingLive] = useState(false);

  const photoWidth = 600;
  const photoHeight = 450;
  const gap = 24;
  const padding = 50;
  const bottomSpace = 140;
  const totalWidth = photoWidth + padding * 2;
  const totalHeight = padding + photoHeight * 4 + gap * 3 + bottomSpace;

  const generateStrip = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || photos.length === 0) return;

    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = stripColor;
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    for (let i = 0; i < photos.length; i++) {
      const img = await loadImage(photos[i]);
      const y = padding + i * (photoHeight + gap);

      ctx.save();
      ctx.filter = getFilterCSS(filter);
      ctx.drawImage(img, padding, y, photoWidth, photoHeight);
      ctx.restore();
    }

    const isDark = stripColor === "#1a1a1a";
    const photosBottom = padding + photoHeight * 4 + gap * 3;

    ctx.fillStyle = isDark ? "#ffffff" : "#333333";
    ctx.font = "italic 42px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("lili's film", totalWidth / 2, photosBottom + 55);

    ctx.fillStyle = isDark ? "#aaaaaa" : "#999999";
    ctx.font = "italic 30px Georgia, serif";
    ctx.fillText("xoxo", totalWidth / 2, photosBottom + 100);

    const dataUrl = canvas.toDataURL("image/png");
    setStripDataUrl(dataUrl);
  }, [photos, filter, stripColor, totalWidth, totalHeight, photoWidth, photoHeight, gap, padding]);

  useEffect(() => {
    generateStrip();
  }, [generateStrip]);

  const handleDownload = () => {
    if (!stripDataUrl) return;
    const link = document.createElement("a");
    link.download = `photobooth-${Date.now()}.png`;
    link.href = stripDataUrl;
    link.click();
  };

  const handleDownloadLive = useCallback(async () => {
    if (clips.length < 4) return;
    setIsRecordingLive(true);

    // Create hidden video elements for each clip
    const videos = await Promise.all(
      clips.map((clip) => {
        return new Promise<HTMLVideoElement>((resolve) => {
          const video = document.createElement("video");
          video.src = URL.createObjectURL(clip);
          video.muted = true;
          video.playsInline = true;
          video.onloadeddata = () => resolve(video);
          video.load();
        });
      })
    );

    // Create compositing canvas
    const liveCanvas = document.createElement("canvas");
    liveCanvas.width = totalWidth;
    liveCanvas.height = totalHeight;
    const ctx = liveCanvas.getContext("2d")!;

    // Start recording the canvas — prefer mp4 for broader compatibility
    const stream = liveCanvas.captureStream(30);
    let mimeType = "video/webm";
    if (MediaRecorder.isTypeSupported("video/mp4")) {
      mimeType = "video/mp4";
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      mimeType = "video/webm;codecs=vp9";
    }
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Play all videos
    videos.forEach((v) => {
      v.currentTime = 0;
      v.play();
    });
    recorder.start();

    // Draw loop
    const isDark = stripColor === "#1a1a1a";
    const filterCss = getFilterCSS(filter);

    function drawFrame() {
      ctx.fillStyle = stripColor;
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      for (let i = 0; i < videos.length; i++) {
        const y = padding + i * (photoHeight + gap);
        ctx.save();
        if (filterCss !== "none") ctx.filter = filterCss;
        ctx.drawImage(videos[i], padding, y, photoWidth, photoHeight);
        ctx.restore();
      }

      const photosBottom = padding + photoHeight * 4 + gap * 3;
      ctx.fillStyle = isDark ? "#ffffff" : "#333333";
      ctx.font = "italic 42px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("lili's film", totalWidth / 2, photosBottom + 55);

      ctx.fillStyle = isDark ? "#aaaaaa" : "#999999";
      ctx.font = "italic 30px Georgia, serif";
      ctx.fillText("xoxo", totalWidth / 2, photosBottom + 100);
    }

    let rafId: number;
    function loop() {
      drawFrame();
      rafId = requestAnimationFrame(loop);
    }
    loop();

    // Record for 5 seconds then stop
    setTimeout(() => {
      cancelAnimationFrame(rafId);
      recorder.stop();
      videos.forEach((v) => {
        v.pause();
        URL.revokeObjectURL(v.src);
      });
    }, 5000);

    recorder.onstop = () => {
      const isMp4 = mimeType.startsWith("video/mp4");
      const ext = isMp4 ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `photobooth-live-${Date.now()}.${ext}`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setIsRecordingLive(false);
    };
  }, [clips, stripColor, filter, totalWidth, totalHeight, photoWidth, photoHeight, gap, padding]);

  return (
    <div className="fixed inset-0 bg-gradient-hero flex items-center justify-center p-4 overflow-auto">
      {/* Decorative blobs */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-40 h-40 bg-accent-light/10 rounded-full blur-3xl" />

      <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start animate-slide-up w-full max-w-5xl mx-auto py-8">
        {/* Strip preview */}
        <div className="flex-1 flex flex-col items-center">
          <div className="shadow-xl">
            {stripDataUrl ? (
              <img
                src={stripDataUrl}
                alt="Photo strip"
                className="max-h-[75vh] w-auto"
              />
            ) : (
              <div className="w-[300px] h-[600px] flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mx-auto" />
                  <p className="text-foreground/50 text-sm italic" style={{ fontFamily: "Georgia, serif" }}>generating strip...</p>
                </div>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls */}
        <div className="w-full lg:w-80 flex flex-col gap-5">
          <div style={{ fontFamily: "Georgia, serif" }}>
            <h2 className="text-2xl italic">your photo strip</h2>
            <p className="text-sm italic text-foreground/50 mt-1">customise and download</p>
          </div>

          {/* Filter selector with thumbnails */}
          <div className="glass rounded-2xl p-4">
            <p className="text-xs italic tracking-wider text-foreground/50 mb-3" style={{ fontFamily: "Georgia, serif" }}>filter</p>
            <div className="grid grid-cols-3 gap-2">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
                    filter === f.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-transparent hover:border-primary/20 hover:bg-surface-alt/50"
                  }`}
                >
                  {photos[0] && (
                    <img
                      src={photos[0]}
                      alt={f.label}
                      className="w-full aspect-[4/3] object-cover rounded-lg"
                      style={{ filter: f.css === "none" ? undefined : f.css }}
                    />
                  )}
                  <span className={`text-[11px] italic ${
                    filter === f.id ? "text-primary" : "text-foreground/70"
                  }`} style={{ fontFamily: "Georgia, serif" }}>
                    {f.label.toLowerCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Strip colour */}
          <div className="glass rounded-2xl p-4">
            <p className="text-xs italic tracking-wider text-foreground/50 mb-3" style={{ fontFamily: "Georgia, serif" }}>strip colour</p>
            <div className="flex gap-2">
              {stripColors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setStripColor(c.hex)}
                  className={`w-9 h-9 rounded-full border-2 transition-all ${
                    stripColor === c.hex
                      ? "border-primary scale-110 shadow-sm"
                      : "border-border hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleDownload}
              className="btn-primary w-full py-3.5 px-4 italic rounded-xl text-sm"
              style={{ fontFamily: "Georgia, serif" }}
            >
              download strip
            </button>

            <button
              onClick={handleDownloadLive}
              disabled={isRecordingLive || clips.length < 4}
              className="w-full py-3.5 px-4 glass italic rounded-xl text-sm hover:bg-surface-alt/80 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
              style={{ fontFamily: "Georgia, serif" }}
            >
              {isRecordingLive ? "creating video..." : "download live"}
            </button>

            <button
              onClick={onRetake}
              className="w-full py-3.5 px-4 glass italic rounded-xl text-sm hover:bg-surface-alt/80 active:scale-[0.98] transition-all"
              style={{ fontFamily: "Georgia, serif" }}
            >
              retake photos
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
