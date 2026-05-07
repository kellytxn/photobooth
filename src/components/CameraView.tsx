"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface CameraViewProps {
  onComplete: (photos: string[], clips: Blob[]) => void;
}

const TOTAL_PHOTOS = 4;
const COUNTDOWN_SECONDS = 5;

export function CameraView({ onComplete }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number>(0);

  const [isReady, setIsReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [photosTaken, setPhotosTaken] = useState<string[]>([]);
  const [showFlash, setShowFlash] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(0);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => setIsReady(true)).catch(() => {});
          };
        }
      } catch (err) {
        console.error("Camera access denied:", err);
        alert("Camera access is required for the photobooth. Please allow camera permissions.");
      }
    }
    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Continuously draw mirrored video to record canvas
  const startDrawLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = recordCanvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;

    function draw() {
      if (!video || !canvas) return;
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      animFrameRef.current = requestAnimationFrame(draw);
    }
    draw();
  }, []);

  const startRecording = useCallback(() => {
    const canvas = recordCanvasRef.current;
    if (!canvas) return;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;
  }, []);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(new Blob([], { type: "video/webm" }));
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    return canvas.toDataURL("image/png");
  }, []);

  const triggerFlash = useCallback(() => {
    setShowFlash(true);
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}
    setTimeout(() => setShowFlash(false), 300);
  }, []);

  const runCountdown = useCallback((photoIndex: number, photos: string[], clips: Blob[]) => {
    if (photoIndex >= TOTAL_PHOTOS) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      onComplete(photos, clips);
      return;
    }
    setCurrentPhoto(photoIndex);
    let count = COUNTDOWN_SECONDS;
    setCountdown(count);

    // Start recording this clip
    startRecording();

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
        triggerFlash();

        const photo = capturePhoto();
        // Stop recording and collect clip
        stopRecording().then((clip) => {
          if (photo) {
            const newPhotos = [...photos, photo];
            const newClips = [...clips, clip];
            setPhotosTaken(newPhotos);
            setTimeout(() => runCountdown(photoIndex + 1, newPhotos, newClips), 800);
          }
        });
      }
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturePhoto, triggerFlash, onComplete, startRecording, stopRecording]);

  const handleStart = useCallback(() => {
    if (!isReady) return;
    setStarted(true);
    setCurrentPhoto(0);
    setPhotosTaken([]);
    startDrawLoop();
    setTimeout(() => runCountdown(0, [], []), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, runCountdown, startDrawLoop]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-hero p-6">
      {/* Decorative blobs */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-40 h-40 bg-accent-light/10 rounded-full blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-24 h-24 bg-primary-light/15 rounded-full blur-2xl" />

      {/* Title above camera */}
      {isReady && !started && (
        <div className="mb-5 flex flex-col items-center animate-scale-in">
          <h1 className="text-4xl italic font-normal" style={{ fontFamily: "Georgia, serif" }}>
            lili&apos;s film
          </h1>
          <p className="text-xl italic text-foreground/50 mt-1" style={{ fontFamily: "Georgia, serif" }}>
            xoxo
          </p>
        </div>
      )}

      {/* Camera viewport */}
      <div className="relative w-full max-w-2xl aspect-[4/3] rounded-2xl overflow-hidden bg-black shadow-xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />

        {/* Corner frame guides */}
        <div className="absolute inset-4 pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/30 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/30 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/30 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/30 rounded-br-lg" />
        </div>

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="text-[100px] font-bold text-white animate-countdown drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              {countdown}
            </span>
          </div>
        )}

        {/* Flash effect */}
        {showFlash && (
          <div className="absolute inset-0 bg-white animate-flash pointer-events-none" />
        )}

        {/* Loading state */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin mx-auto" />
              <p className="text-sm italic text-white/70" style={{ fontFamily: "Georgia, serif" }}>starting camera...</p>
            </div>
          </div>
        )}

        {/* Progress dots inside camera */}
        {started && (
          <div className="absolute top-3 left-0 right-0 flex items-center justify-center z-10">
            <div className="bg-black/40 backdrop-blur-sm rounded-full px-4 py-1.5 flex items-center gap-2">
              {Array.from({ length: TOTAL_PHOTOS }).map((_, i) => (
                <div key={i} className="relative">
                  {i < photosTaken.length ? (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center animate-scale-in">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        i === currentPhoto && countdown !== null
                          ? "border-primary bg-primary/30"
                          : "border-white/40"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Start button below camera */}
      {isReady && !started && (
        <button
          onClick={handleStart}
          className="btn-primary mt-6 px-10 py-3.5 text-base italic rounded-full animate-scale-in"
          style={{ fontFamily: "Georgia, serif" }}
        >
          start session
        </button>
      )}

      {/* Status text below camera */}
      {started && (
        <p className="mt-4 text-sm italic text-foreground/60" style={{ fontFamily: "Georgia, serif" }}>
          {countdown !== null
            ? `photo ${currentPhoto + 1} of ${TOTAL_PHOTOS}`
            : photosTaken.length < TOTAL_PHOTOS
            ? "get ready..."
            : "all done!"}
        </p>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={recordCanvasRef} className="hidden" />
    </div>
  );
}
