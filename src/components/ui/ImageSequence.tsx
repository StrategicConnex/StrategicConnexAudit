"use client";
import React, { useEffect, useRef } from "react";

export function ImageSequence({ 
  folder = "/Iframe", 
  prefix = "nosotros_", 
  frameCount = 80, 
  extension = "jpg",
  fps = 30
}: { 
  folder?: string; 
  prefix?: string; 
  frameCount?: number;
  extension?: string;
  fps?: number;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let images: HTMLImageElement[] = [];

    // Preload images into browser cache to avoid flickering
    for (let i = 0; i < frameCount; i++) {
        const img = new Image();
        const frameNumber = i.toString().padStart(3, '0');
        img.src = `${folder}/${prefix}${frameNumber}.${extension}`;
        images.push(img);
    }

    let frame = 0;
    let intervalId: NodeJS.Timeout;

    const updateFrame = () => {
        if (imgRef.current && images[frame].complete) {
            const frameNumber = frame.toString().padStart(3, '0');
            imgRef.current.src = `${folder}/${prefix}${frameNumber}.${extension}`;
        }
        frame = (frame + 1) % frameCount;
    };

    // Start playback
    intervalId = setInterval(updateFrame, 1000 / fps);

    return () => clearInterval(intervalId);
  }, [frameCount, folder, prefix, extension, fps]);

  return (
    <img 
      ref={imgRef}
      src={`${folder}/${prefix}000.${extension}`}
      alt="Corporate Video Sequence" 
      className="about-video" 
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
