"use client";

import { useEffect, useState } from "react";

type UserProfile = {
  shortBio: string | null;
  styleNotes: string | null;
  allowLearningFromConversations: boolean;
  voiceCloneConsent: boolean;
  voiceCloneProfileId: string | null;
};

export function OnboardingForm() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [voiceStatus, setVoiceStatus] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/profile");
      if (!response.ok) return;
      const payload = (await response.json()) as { user: UserProfile };
      setProfile(payload.user);
    })();
  }, []);

  if (!profile) {
    return <div className="card p-4">Loading profile...</div>;
  }

  const saveProfile = async () => {
    setSaving(true);
    setStatus("");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    if (!response.ok) {
      setStatus("Failed to save profile");
      return;
    }
    setStatus("Profile saved");
  };

  return (
    <div className="card space-y-4 p-6">
      <div>
        <p className="label">Avatar Profile</p>
        <h1 className="text-3xl font-semibold font-[var(--font-title)]">
          Define how your avatar should speak
        </h1>
      </div>
      <label className="block">
        <span className="text-sm font-medium">Short bio</span>
        <textarea
          className="mt-2 min-h-24 w-full rounded-xl border border-[var(--line)] px-3 py-2"
          value={profile.shortBio ?? ""}
          onChange={(event) =>
            setProfile((current) => (current ? { ...current, shortBio: event.target.value } : null))
          }
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">How I speak (style notes)</span>
        <textarea
          className="mt-2 min-h-28 w-full rounded-xl border border-[var(--line)] px-3 py-2"
          value={profile.styleNotes ?? ""}
          onChange={(event) =>
            setProfile((current) =>
              current ? { ...current, styleNotes: event.target.value } : null,
            )
          }
        />
      </label>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={profile.allowLearningFromConversations}
          onChange={(event) =>
            setProfile((current) =>
              current
                ? {
                    ...current,
                    allowLearningFromConversations: event.target.checked,
                  }
                : null,
            )
          }
        />
        <span className="text-sm">Allow learning from conversations</span>
      </label>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={profile.voiceCloneConsent}
          onChange={(event) =>
            setProfile((current) =>
              current
                ? {
                    ...current,
                    voiceCloneConsent: event.target.checked,
                  }
                : null,
            )
          }
        />
        <span className="text-sm">
          I consent to voice cloning when I upload voice samples.
        </span>
      </label>
      <p className="text-sm text-[var(--muted)]">
        Voice profile ID: {profile.voiceCloneProfileId ?? "Not configured"}
      </p>
      <form
        className="rounded-xl border border-[var(--line)] bg-white p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          formData.set("consent", String(profile.voiceCloneConsent));
          const response = await fetch("/api/avatar/voice-samples", {
            method: "POST",
            body: formData,
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok) {
            setVoiceStatus(`Voice profile created: ${payload.profileId}`);
            const profileResponse = await fetch("/api/profile");
            if (profileResponse.ok) {
              const profilePayload = (await profileResponse.json()) as { user: UserProfile };
              setProfile(profilePayload.user);
            }
            (event.target as HTMLFormElement).reset();
          } else {
            setVoiceStatus(payload.error || "Voice sample upload failed");
          }
        }}
      >
        <p className="text-sm font-medium">Upload voice samples (optional)</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Requires explicit consent checkbox above. Otherwise neutral TTS is used.
        </p>
        <input
          type="file"
          name="samples"
          accept="audio/*"
          multiple
          className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="mt-3 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
        >
          Upload samples
        </button>
        {voiceStatus ? <p className="mt-2 text-sm text-[var(--brand)]">{voiceStatus}</p> : null}
      </form>
      <div className="flex items-center gap-3">
        <button
          className="rounded-xl bg-[var(--brand)] px-4 py-2 font-medium text-white disabled:opacity-60"
          type="button"
          onClick={() => void saveProfile()}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
        <span className="text-sm text-[var(--muted)]">{status}</span>
      </div>
    </div>
  );
}
