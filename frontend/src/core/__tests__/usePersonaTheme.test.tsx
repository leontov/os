import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../cloudProfile", () => {
  return {
    fetchCloudProfile: vi.fn(),
    updateCloudProfile: vi.fn(),
    clearCachedProfile: vi.fn(),
  };
});

import { fetchCloudProfile, updateCloudProfile } from "../cloudProfile";
import { __dangerousOverridePersonaProfileForStory, usePersonaTheme } from "../usePersonaTheme";

const mockedFetch = fetchCloudProfile as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = updateCloudProfile as unknown as ReturnType<typeof vi.fn>;

describe("usePersonaTheme", () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue(null);
    mockedUpdate.mockImplementation(async (profile) => ({ ...profile }));
    __dangerousOverridePersonaProfileForStory({ personaId: "aurora", appearance: "system", motionPreference: "auto" });
    document.documentElement.removeAttribute("data-persona");
    document.documentElement.removeAttribute("data-motion");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("switches persona and syncs with cloud", async () => {
    const { result } = renderHook(() => usePersonaTheme());

    await act(async () => {
      await waitFor(() => expect(result.current.isReady).toBe(true));
    });

    act(() => {
      result.current.setPersona("prism");
    });

    expect(result.current.activePersona.id).toBe("prism");
    expect(document.documentElement.getAttribute("data-persona")).toBe("prism");
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("updates motion preference and respects reduced mode", async () => {
    mockedFetch.mockResolvedValue({ personaId: "aurora", appearance: "system", motionPreference: "auto", voiceId: "aurora-voice" });

    const { result } = renderHook(() => usePersonaTheme());
    await act(async () => {
      await waitFor(() => expect(result.current.isReady).toBe(true));
    });

    await act(async () => {
      result.current.setMotionPreference("reduced");
    });

    await waitFor(() => expect(result.current.resolvedMotion).toBe("reduced"));
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduced");
  });
});
