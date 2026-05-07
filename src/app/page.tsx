"use client";

import { useState, useCallback } from "react";
import { CameraView } from "@/components/CameraView";
import { StripPreview } from "@/components/StripPreview";

export type FilterType = "none" | "grayscale" | "sepia" | "warm" | "cool" | "vintage";

export default function Home() {
  const [state, setState] = useState<"capturing" | "review">("capturing");
  const [photos, setPhotos] = useState<string[]>([]);
  const [clips, setClips] = useState<Blob[]>([]);
  const [filter, setFilter] = useState<FilterType>("none");

  const handlePhotosComplete = useCallback((capturedPhotos: string[], capturedClips: Blob[]) => {
    setPhotos(capturedPhotos);
    setClips(capturedClips);
    setState("review");
  }, []);

  const handleRetake = useCallback(() => {
    setPhotos([]);
    setClips([]);
    setState("capturing");
  }, []);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen">
      {state === "capturing" && (
        <CameraView onComplete={handlePhotosComplete} />
      )}
      {state === "review" && (
        <StripPreview
          photos={photos}
          clips={clips}
          filter={filter}
          setFilter={setFilter}
          onRetake={handleRetake}
        />
      )}
    </main>
  );
}
