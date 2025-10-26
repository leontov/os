import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedProfile, fetchCloudProfile, updateCloudProfile } from "../cloudProfile";

describe("cloudProfile", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    clearCachedProfile();
  });

  it("falls back to cached profile when network fails", async () => {
    window.localStorage.setItem(
      "kolibri:persona-profile",
      JSON.stringify({ personaId: "nocturne", motionPreference: "expressive", appearance: "dark", voiceId: "nocturne-voice" }),
    );

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    const profile = await fetchCloudProfile();

    expect(profile).not.toBeNull();
    expect(profile?.personaId).toBe("nocturne");
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("persists updates to the cloud endpoint and local cache", async () => {
    const mockResponse = new Response(
      JSON.stringify({ personaId: "prism", appearance: "light", motionPreference: "expressive", voiceId: "prism-voice" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    const result = await updateCloudProfile({
      personaId: "prism",
      appearance: "light",
      motionPreference: "expressive",
      voiceId: "prism-voice",
    });

    expect(result.personaId).toBe("prism");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const cached = window.localStorage.getItem("kolibri:persona-profile");
    expect(cached).toContain("prism");
  });
});
