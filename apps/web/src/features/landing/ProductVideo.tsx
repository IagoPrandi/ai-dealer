"use client";

import { useEffect, useRef, useState } from "react";

import { BRAND_NAME } from "@tyche/config";

// Scene starts in public/videos/tywish-round.* (see scripts/landing-video/).
const CHAPTERS = [
  { label: "The round", start: 0 },
  { label: "Write a rule", start: 2 },
  { label: "Pick numbers", start: 24.4 },
  { label: "Vote on the rule", start: 31.3 },
  { label: "Winning result", start: 37.4 },
] as const;

function chapterAt(time: number) {
  let index = 0;
  CHAPTERS.forEach((chapter, position) => {
    if (time >= chapter.start) index = position;
  });
  return index;
}

/**
 * Screen recording of the real /play app on mocked data. It autoplays muted
 * and loops, stops when scrolled away, and never autoplays for visitors who
 * ask for reduced motion. Chapters seek the video and follow playback.
 */
export function ProductVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [wantsPlay, setWantsPlay] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWantsPlay(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting && wantsPlay) {
        video.play().catch((error: unknown) => {
          // Autoplay can be refused (data saver, browser policy); the poster
          // and the play button stay, and the reason stays visible in devtools.
          console.warn("Product video autoplay was refused.", error);
        });
      } else {
        video.pause();
      }
    }, { threshold: 0.15 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [wantsPlay]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setWantsPlay(true);
      void video.play();
    } else {
      setWantsPlay(false);
      video.pause();
    }
  };

  const seek = (index: number) => {
    const video = videoRef.current;
    const target = CHAPTERS[index];
    if (!video || !target) return;
    video.currentTime = target.start;
    setChapter(index);
    setWantsPlay(true);
    void video.play();
  };

  return (
    <figure className="lp-video">
      <ol aria-label="Video chapters" className="lp-chapters">
        {CHAPTERS.map((item, index) => (
          <li key={item.label}>
            <button aria-current={chapter === index ? "step" : undefined} className="lp-chapter" onClick={() => seek(index)} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ol>
      <div className="lp-video-frame">
        <video
          aria-label={`Screen recording of the ${BRAND_NAME} desktop app: the round, writing a rule, picking numbers, voting on that rule, and winning with four matching numbers`}
          height={420}
          loop
          muted
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => setChapter(chapterAt(event.currentTarget.currentTime))}
          playsInline
          poster="/videos/tywish-round-poster.jpg"
          preload="metadata"
          ref={videoRef}
          width={672}
        >
          <source src="/videos/tywish-round.webm" type="video/webm" />
          <source src="/videos/tywish-round.mp4" type="video/mp4" />
        </video>
        <button aria-label={playing ? "Pause video" : "Play video"} className="lp-video-toggle" onClick={toggle} type="button">
          {playing ? (
            <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><path d="M8 5v14M16 5v14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" /></svg>
          ) : (
            <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><path d="M7 5l12 7-12 7V5z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.2" /></svg>
          )}
        </button>
      </div>
      <figcaption className="lp-video-caption">The real app · example round with sample data</figcaption>
    </figure>
  );
}
