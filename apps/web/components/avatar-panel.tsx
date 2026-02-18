"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VisemeCue = {
  viseme: string;
  startMs: number;
  endMs: number;
};

const mouthStyles: Record<string, string> = {
  A: "h-7 w-16 rounded-[999px] bg-[#5f2e1e]",
  E: "h-5 w-14 rounded-[999px] bg-[#5f2e1e]",
  I: "h-5 w-10 rounded-[999px] bg-[#5f2e1e]",
  O: "h-8 w-12 rounded-[999px] bg-[#5f2e1e]",
  U: "h-6 w-8 rounded-[999px] bg-[#5f2e1e]",
  M: "h-2 w-14 rounded-[999px] bg-[#5f2e1e]",
};

export function AvatarPanel({
  latestText,
  speakEnabled,
}: {
  latestText: string;
  speakEnabled: boolean;
}) {
  const [avatarImage, setAvatarImage] = useState<string>("/avatar-placeholder.svg");
  const [activeViseme, setActiveViseme] = useState<string>("M");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pending, setPending] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cuesRef = useRef<VisemeCue[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem("avatar_image_url");
    if (saved) setAvatarImage(saved);
  }, []);

  const mouthClass = useMemo(
    () => mouthStyles[activeViseme] ?? mouthStyles.M,
    [activeViseme],
  );

  const triggerSpeech = async (text: string) => {
    if (!text.trim()) return;
    setPending(true);
    try {
      const response = await fetch("/api/avatar/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        audioBase64: string;
        mimeType: string;
        visemes: VisemeCue[];
      };
      if (!payload.audioBase64) return;
      const audio = new Audio(`data:${payload.mimeType};base64,${payload.audioBase64}`);
      audioRef.current = audio;
      cuesRef.current = payload.visemes ?? [];
      setIsSpeaking(true);
      setActiveViseme("M");
      audio.ontimeupdate = () => {
        const ms = audio.currentTime * 1000;
        const cue = cuesRef.current.find((item) => ms >= item.startMs && ms <= item.endMs);
        setActiveViseme(cue?.viseme ?? "M");
      };
      audio.onended = () => {
        setIsSpeaking(false);
        setActiveViseme("M");
      };
      void audio.play();
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (!speakEnabled || !latestText) return;
    void triggerSpeech(latestText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestText, speakEnabled]);

  return (
    <div className="card space-y-4 p-4">
      <div className="label">Avatar Panel</div>
      <p className="text-sm text-[var(--muted)]">
        AI-generated avatar with consent-gated voice behavior.
      </p>
      <label className="block">
        <span className="text-sm font-medium">Avatar image</span>
        <input
          type="file"
          accept="image/*"
          className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result);
              setAvatarImage(dataUrl);
              window.localStorage.setItem("avatar_image_url", dataUrl);
            };
            reader.readAsDataURL(file);
          }}
        />
      </label>

      <div className="relative mx-auto h-64 w-56 overflow-hidden rounded-3xl border border-[var(--line)] bg-[#f2eee8]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarImage} alt="Avatar" className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-7 flex justify-center">
          <div
            className={`${mouthClass} transition-all duration-75 ${isSpeaking ? "opacity-95" : "opacity-80"}`}
          />
        </div>
      </div>

      <button
        className="w-full rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg)] disabled:opacity-60"
        type="button"
        onClick={() => void triggerSpeech(latestText)}
        disabled={!latestText || pending}
      >
        {pending ? "Generating speech..." : "Speak latest answer"}
      </button>
    </div>
  );
}

