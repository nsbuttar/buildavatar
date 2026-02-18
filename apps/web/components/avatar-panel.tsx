"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VisemeCue = {
  viseme: string;
  startMs: number;
  endMs: number;
};

type SpeechMode = "realtime" | "balanced" | "cinematic";

type LipSyncProfile = {
  mode: SpeechMode;
  switchHoldMs: number;
};

const mouthStyles: Record<string, string> = {
  A: "h-7 w-16 rounded-[999px] bg-[#5f2e1e]",
  E: "h-5 w-14 rounded-[999px] bg-[#5f2e1e]",
  I: "h-5 w-10 rounded-[999px] bg-[#5f2e1e]",
  O: "h-8 w-12 rounded-[999px] bg-[#5f2e1e]",
  U: "h-6 w-8 rounded-[999px] bg-[#5f2e1e]",
  M: "h-2 w-14 rounded-[999px] bg-[#5f2e1e]",
};

const defaultSwitchHoldMs: Record<SpeechMode, number> = {
  realtime: 34,
  balanced: 54,
  cinematic: 72,
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
  const [speechMode, setSpeechMode] = useState<SpeechMode>("balanced");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cuesRef = useRef<VisemeCue[]>([]);
  const cueIndexRef = useRef(0);
  const activeVisemeRef = useRef("M");
  const lastSwitchAtRef = useRef(0);
  const switchHoldMsRef = useRef(defaultSwitchHoldMs.balanced);
  const rafRef = useRef<number | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("avatar_image_url");
    if (saved) setAvatarImage(saved);
    const savedMode = window.localStorage.getItem("avatar_speech_mode");
    if (savedMode === "realtime" || savedMode === "balanced" || savedMode === "cinematic") {
      setSpeechMode(savedMode);
      switchHoldMsRef.current = defaultSwitchHoldMs[savedMode];
    }
  }, []);

  useEffect(() => {
    activeVisemeRef.current = activeViseme;
  }, [activeViseme]);

  const mouthClass = useMemo(
    () => mouthStyles[activeViseme] ?? mouthStyles.M,
    [activeViseme],
  );

  const stopPlayback = (resetMouth = true) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    cueIndexRef.current = 0;
    setIsSpeaking(false);
    if (resetMouth) {
      activeVisemeRef.current = "M";
      setActiveViseme("M");
    }
  };

  const animateMouth = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const cues = cuesRef.current;
    const timeMs = audio.currentTime * 1000;
    while (cueIndexRef.current < cues.length && timeMs > cues[cueIndexRef.current].endMs) {
      cueIndexRef.current += 1;
    }

    const cue = cues[cueIndexRef.current];
    const nextViseme =
      cue && timeMs >= cue.startMs && timeMs <= cue.endMs ? cue.viseme : "M";

    if (nextViseme !== activeVisemeRef.current) {
      const now = performance.now();
      const canSwitch =
        now - lastSwitchAtRef.current >= switchHoldMsRef.current || nextViseme === "M";
      if (canSwitch) {
        lastSwitchAtRef.current = now;
        activeVisemeRef.current = nextViseme;
        setActiveViseme(nextViseme);
      }
    }

    if (!audio.paused && !audio.ended) {
      rafRef.current = window.requestAnimationFrame(animateMouth);
    }
  };

  const triggerSpeech = async (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;

    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const requestId = ++requestSeqRef.current;

    setPending(true);
    stopPlayback();
    switchHoldMsRef.current = defaultSwitchHoldMs[speechMode];
    try {
      const response = await fetch("/api/avatar/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: normalized,
          speechMode,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        audioBase64: string;
        mimeType: string;
        visemes: VisemeCue[];
        lipSyncProfile?: LipSyncProfile;
      };
      if (!payload.audioBase64) return;
      if (payload.lipSyncProfile?.switchHoldMs) {
        switchHoldMsRef.current = payload.lipSyncProfile.switchHoldMs;
      }

      const audio = new Audio(`data:${payload.mimeType};base64,${payload.audioBase64}`);
      audioRef.current = audio;
      cuesRef.current = payload.visemes ?? [];
      cueIndexRef.current = 0;
      lastSwitchAtRef.current = performance.now();
      setIsSpeaking(true);
      setActiveViseme("M");
      activeVisemeRef.current = "M";
      audio.onended = () => {
        stopPlayback();
      };
      const playResult = await audio.play().catch(() => undefined);
      if (playResult === undefined && (audio.paused || audio.ended)) {
        stopPlayback();
        return;
      }

      rafRef.current = window.requestAnimationFrame(animateMouth);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    } finally {
      if (requestSeqRef.current === requestId) {
        setPending(false);
      }
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!speakEnabled || !latestText) return;
    void triggerSpeech(latestText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestText, speakEnabled, speechMode]);

  useEffect(() => {
    return () => {
      requestAbortRef.current?.abort();
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card space-y-4 p-4">
      <div className="label">Avatar Panel</div>
      <p className="text-sm text-[var(--muted)]">
        AI-generated avatar with consent-gated voice behavior.
      </p>
      <label className="block">
        <span className="text-sm font-medium">Lip-sync mode</span>
        <select
          value={speechMode}
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          onChange={(event) => {
            const mode = event.target.value as SpeechMode;
            setSpeechMode(mode);
            switchHoldMsRef.current = defaultSwitchHoldMs[mode];
            window.localStorage.setItem("avatar_speech_mode", mode);
          }}
        >
          <option value="realtime">Realtime (lowest latency)</option>
          <option value="balanced">Balanced (default)</option>
          <option value="cinematic">Cinematic (smoothest mouth motion)</option>
        </select>
      </label>
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
