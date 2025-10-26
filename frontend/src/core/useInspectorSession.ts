import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import type { ChatMessage } from "../types/chat";
import type {
  ConversationMetrics,
  ConversationPreferences,
  KernelCapabilities,
  KernelControlsState,
} from "./useKolibriChat";

export type InspectorActionType =
  | "conversation.title"
  | "conversation.reset"
  | "conversation.create"
  | "conversation.select"
  | "conversation.delete"
  | "conversation.archive"
  | "conversation.history.clear"
  | "conversation.export"
  | "conversation.export.failed"
  | "conversation.share"
  | "conversation.share.failed"
  | "mode.change"
  | "model.change"
  | "message.user"
  | "message.assistant"
  | "message.edit"
  | "message.continue"
  | "message.regenerate"
  | "message.copy-link"
  | "attachment.add"
  | "attachment.remove"
  | "attachment.clear"
  | "knowledge.refresh"
  | "suggestion.apply"
  | "plan.manage"
  | "session.recording.start"
  | "session.recording.stop"
  | "session.replay.offer"
  | "session.replay.answer"
  | "session.replay.close"
  | "screenshot.capture"
  | "bugreport.generate"
  | "preferences.update";

export interface InspectorAction {
  id: string;
  timestampIso: string;
  type: InspectorActionType;
  summary: string;
  payload?: unknown;
}

export type ConsoleLevel = "log" | "warn" | "error";

export interface ConsoleLogEntry {
  id: string;
  timestampIso: string;
  level: ConsoleLevel;
  message: string;
}

export interface ScreenshotCapture {
  id: string;
  label: string;
  dataUrl: string;
  width: number;
  height: number;
  takenAtIso: string;
}

export interface ScreenshotDiffState {
  baseline?: ScreenshotCapture;
  comparison?: ScreenshotCapture;
  diffPercentage?: number;
  status: "idle" | "capturing" | "ready" | "error";
  error?: string;
}

export interface SessionRecordingState {
  status: "idle" | "preparing" | "recording" | "ready" | "error";
  startedAtIso?: string;
  error?: string;
  downloadUrl?: string;
  blob?: Blob;
}

export interface WebRTCState {
  status: "idle" | "creating-offer" | "waiting-answer" | "connected" | "error";
  offerSdp?: string;
  answerSdp?: string;
  error?: string;
}

export interface BugReportStatus {
  isGenerating: boolean;
  error?: string;
  downloadUrl?: string;
  filename?: string;
  generatedAtIso?: string;
  reproductionScript?: string;
  summary?: {
    actionCount: number;
    messageCount: number;
    hasRecording: boolean;
    screenshotDiff?: number;
  };
}

export interface BugReportResult {
  blob: Blob;
  filename: string;
  downloadUrl: string;
  reproductionScript: string;
  summary: NonNullable<BugReportStatus["summary"]>;
}

interface UseInspectorSessionParams {
  conversationId: string;
  conversationTitle: string;
  messages: ChatMessage[];
  metrics: ConversationMetrics;
  kernelCapabilities: KernelCapabilities;
  kernelControls: KernelControlsState;
  preferences: ConversationPreferences;
  mode: string;
  getDraft: () => string;
}

export interface InspectorSessionApi {
  actions: InspectorAction[];
  consoleLogs: ConsoleLogEntry[];
  logAction: (type: InspectorActionType, summary: string, payload?: unknown) => void;
  screenshotState: ScreenshotDiffState;
  captureScreenshot: (mode: "baseline" | "comparison", label?: string) => Promise<void>;
  resetScreenshots: () => void;
  registerCaptureTarget: (element: HTMLElement | null) => void;
  recordingState: SessionRecordingState;
  startReplayRecording: () => Promise<void>;
  stopReplayRecording: () => void;
  webrtcState: WebRTCState;
  createWebRTCOffer: () => Promise<void>;
  acceptWebRTCAnswer: (sdp: string) => Promise<void>;
  closeWebRTC: () => void;
  bugReportStatus: BugReportStatus;
  generateBugReport: () => Promise<BugReportResult>;
}

const MAX_ACTIONS = 200;
const MAX_LOGS = 200;

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ins-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const stringifyConsoleArgs = (args: unknown[]): string =>
  args
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join(" ");

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (event) => {
      reject(event);
    };
    image.src = src;
  });

const toIso = (date: Date = new Date()) => date.toISOString();

const useInspectorSession = ({
  conversationId,
  conversationTitle,
  messages,
  metrics,
  kernelCapabilities,
  kernelControls,
  preferences,
  mode,
  getDraft,
}: UseInspectorSessionParams): InspectorSessionApi => {
  const captureTargetRef = useRef<HTMLElement | null>(null);
  const previousMessagesRef = useRef<string[]>([]);
  const [actions, setActions] = useState<InspectorAction[]>([]);
  const actionsRef = useRef<InspectorAction[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const consoleLogsRef = useRef<ConsoleLogEntry[]>([]);
  const consoleLockRef = useRef(false);
  const [screenshotState, setScreenshotState] = useState<ScreenshotDiffState>({ status: "idle" });
  const [recordingState, setRecordingState] = useState<SessionRecordingState>({ status: "idle" });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);
  const [webrtcState, setWebRTCState] = useState<WebRTCState>({ status: "idle" });
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [bugReportStatus, setBugReportStatus] = useState<BugReportStatus>({ isGenerating: false });
  const bugReportUrlRef = useRef<string | null>(null);

  const logAction = useCallback(
    (type: InspectorActionType, summary: string, payload?: unknown) => {
      const entry: InspectorAction = {
        id: createId(),
        timestampIso: toIso(),
        type,
        summary,
        payload,
      };
      actionsRef.current = [...actionsRef.current, entry].slice(-MAX_ACTIONS);
      setActions(actionsRef.current);
    },
    [],
  );

  useEffect(() => {
    const previous = previousMessagesRef.current;
    const nextIds = messages.map((message) => message.id);
    const added = messages.filter((message) => !previous.includes(message.id));
    added.forEach((message) => {
      logAction(
        message.role === "assistant" ? "message.assistant" : "message.user",
        message.role === "assistant"
          ? `Ответ ассистента (${message.content.slice(0, 64) || "—"})`
          : `Сообщение пользователя (${message.content.slice(0, 64) || "—"})`,
        {
          messageId: message.id,
          role: message.role,
        },
      );
    });
    previousMessagesRef.current = nextIds;
  }, [logAction, messages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const levels: ConsoleLevel[] = ["log", "warn", "error"];
    const originals: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {};

    levels.forEach((level) => {
      const original = console[level] as (...args: unknown[]) => void;
      originals[level] = original;
      console[level] = (...args: unknown[]) => {
        if (consoleLockRef.current) {
          original?.(...args);
          return;
        }
        consoleLockRef.current = true;
        try {
          original?.(...args);
          const entry: ConsoleLogEntry = {
            id: createId(),
            timestampIso: toIso(),
            level,
            message: stringifyConsoleArgs(args),
          };
          consoleLogsRef.current = [...consoleLogsRef.current, entry].slice(-MAX_LOGS);
          setConsoleLogs(consoleLogsRef.current);
        } finally {
          consoleLockRef.current = false;
        }
      };
    });

    return () => {
      levels.forEach((level) => {
        const original = originals[level];
        if (original) {
          console[level] = original;
        }
      });
    };
  }, []);

  const registerCaptureTarget = useCallback((element: HTMLElement | null) => {
    captureTargetRef.current = element;
  }, []);

  const computeScreenshotDiff = useCallback(async (baseline: ScreenshotCapture, comparison: ScreenshotCapture) => {
    setScreenshotState((current) => ({ ...current, status: "capturing", error: undefined }));
    try {
      const [baselineImageObj, comparisonImageObj] = await Promise.all([
        loadImage(baseline.dataUrl),
        loadImage(comparison.dataUrl),
      ]);
      const width = Math.max(baselineImageObj.width, comparisonImageObj.width);
      const height = Math.max(baselineImageObj.height, comparisonImageObj.height);
      const canvasA = document.createElement("canvas");
      const canvasB = document.createElement("canvas");
      canvasA.width = width;
      canvasA.height = height;
      canvasB.width = width;
      canvasB.height = height;
      const ctxA = canvasA.getContext("2d");
      const ctxB = canvasB.getContext("2d");
      if (!ctxA || !ctxB) {
        throw new Error("Canvas 2D context unavailable");
      }
      ctxA.drawImage(baselineImageObj, 0, 0);
      ctxB.drawImage(comparisonImageObj, 0, 0);
      const dataA = ctxA.getImageData(0, 0, width, height).data;
      const dataB = ctxB.getImageData(0, 0, width, height).data;
      let diffPixels = 0;
      const totalPixels = width * height;
      for (let index = 0; index < totalPixels * 4; index += 4) {
        const delta =
          Math.abs(dataA[index] - dataB[index]) +
          Math.abs(dataA[index + 1] - dataB[index + 1]) +
          Math.abs(dataA[index + 2] - dataB[index + 2]);
        if (delta > 45) {
          diffPixels += 1;
        }
      }
      const diffRatio = diffPixels / totalPixels;
      setScreenshotState((current) => ({
        ...current,
        diffPercentage: Number((diffRatio * 100).toFixed(2)),
        status: "ready",
        error: undefined,
      }));
    } catch (error) {
      setScreenshotState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Не удалось сравнить скриншоты",
      }));
    }
  }, []);

  const captureScreenshot = useCallback(
    async (modeKey: "baseline" | "comparison", label?: string) => {
      if (typeof window === "undefined") {
        throw new Error("Скриншоты поддерживаются только в браузере");
      }
      const target = captureTargetRef.current;
      if (!target) {
        throw new Error("Не найден элемент для съёмки");
      }
      try {
        const canvas = await html2canvas(target, {
          backgroundColor: getComputedStyle(document.body).backgroundColor ?? "#0f172a",
          useCORS: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
        });
        const dataUrl = canvas.toDataURL("image/png");
        const capture: ScreenshotCapture = {
          id: createId(),
          label: label ?? (modeKey === "baseline" ? "Базовый снимок" : "Сравнение"),
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          takenAtIso: toIso(),
        };
        setScreenshotState((state) => {
          const next: ScreenshotDiffState = { ...state, status: "ready", error: undefined };
          if (modeKey === "baseline") {
            next.baseline = capture;
          } else {
            next.comparison = capture;
          }
          if (next.baseline && next.comparison) {
            void computeScreenshotDiff(next.baseline, next.comparison);
          } else {
            next.diffPercentage = undefined;
          }
          return next;
        });
        logAction("screenshot.capture", `Снимок: ${capture.label}`, {
          mode: modeKey,
          width: capture.width,
          height: capture.height,
        });
      } catch (error) {
        setScreenshotState({
          status: "error",
          error: error instanceof Error ? error.message : "Не удалось сделать скриншот",
        });
      }
    },
    [computeScreenshotDiff, logAction],
  );

  const resetScreenshots = useCallback(() => {
    setScreenshotState({ status: "idle" });
  }, []);

  const startReplayRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      setRecordingState({ status: "error", error: "Недоступно вне браузера" });
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setRecordingState({ status: "error", error: "Экранная запись не поддерживается" });
      return;
    }
    if (recordingState.status === "recording" || recordingState.status === "preparing") {
      return;
    }

    setRecordingState({ status: "preparing" });
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        if (recordingUrlRef.current) {
          URL.revokeObjectURL(recordingUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        setRecordingState({
          status: "ready",
          startedAtIso: recordingState.startedAtIso ?? toIso(),
          downloadUrl: url,
          blob,
        });
        logAction("session.recording.stop", "Запись сессии завершена", {
          size: blob.size,
          mimeType,
        });
      });
      recorder.start();
      setRecordingState({
        status: "recording",
        startedAtIso: toIso(),
      });
      logAction("session.recording.start", "Начата запись сессии (Replay)");
    } catch (error) {
      setRecordingState({
        status: "error",
        error: error instanceof Error ? error.message : "Не удалось начать запись",
      });
    }
  }, [logAction, recordingState.status, recordingState.startedAtIso]);

  const stopReplayRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
  }, []);

  const waitForIceGathering = async (peer: RTCPeerConnection): Promise<void> => {
    if (peer.iceGatheringState === "complete") {
      return;
    }
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", checkState);
        resolve();
      }, 1500);
      const checkState = () => {
        if (peer.iceGatheringState === "complete") {
          window.clearTimeout(timeout);
          peer.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };
      peer.addEventListener("icegatheringstatechange", checkState);
    });
  };

  const createWebRTCOffer = useCallback(async () => {
    if (typeof window === "undefined" || typeof RTCPeerConnection === "undefined") {
      setWebRTCState({ status: "error", error: "WebRTC недоступен" });
      return;
    }
    setWebRTCState({ status: "creating-offer" });
    try {
      const peer = new RTCPeerConnection();
      peerConnectionRef.current = peer;
      peer.createDataChannel("kolibri-inspector");
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) {
        throw new Error("Не удалось сформировать SDP");
      }
      setWebRTCState({ status: "waiting-answer", offerSdp: sdp });
      logAction("session.replay.offer", "Подготовлено SDP-предложение", { length: sdp.length });
    } catch (error) {
      setWebRTCState({
        status: "error",
        error: error instanceof Error ? error.message : "Не удалось создать предложение",
      });
    }
  }, [logAction]);

  const acceptWebRTCAnswer = useCallback(
    async (sdp: string) => {
      const peer = peerConnectionRef.current;
      if (!peer) {
        setWebRTCState({ status: "error", error: "Сначала создайте предложение" });
        return;
      }
      try {
        const description = new RTCSessionDescription({ type: "answer", sdp });
        await peer.setRemoteDescription(description);
        setWebRTCState((current) => ({
          status: "connected",
          offerSdp: current.offerSdp,
          answerSdp: sdp,
        }));
        logAction("session.replay.answer", "Получен ответ WebRTC", { length: sdp.length });
      } catch (error) {
        setWebRTCState({
          status: "error",
          error: error instanceof Error ? error.message : "Некорректный SDP ответ",
        });
      }
    },
    [logAction],
  );

  const closeWebRTC = useCallback(() => {
    const peer = peerConnectionRef.current;
    if (peer) {
      peer.close();
      peerConnectionRef.current = null;
    }
    setWebRTCState({ status: "idle" });
    logAction("session.replay.close", "WebRTC соединение закрыто");
  }, [logAction]);

  const buildReproductionScript = useCallback(() => {
    const userMessages = messages.filter((message) => message.role === "user");
    const steps = userMessages
      .map((message, index) => {
        const escaped = message.content.replace(/`/gu, "\\`");
        return `# Шаг ${index + 1}\nkolibri-cli dialog --message \`${escaped}\``;
      })
      .join("\n\n");
    return steps || "# Нет пользовательских сообщений для воспроизведения";
  }, [messages]);

  const blobToBase64 = async (blob: Blob | undefined): Promise<string | undefined> => {
    if (!blob) {
      return undefined;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result.split(",")[1] ?? result);
        } else {
          resolve(undefined);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  };

  const generateBugReport = useCallback(async (): Promise<BugReportResult> => {
    setBugReportStatus((state) => ({ ...state, isGenerating: true, error: undefined }));
    try {
      const report = {
        version: 1,
        generatedAtIso: toIso(),
        conversation: {
          id: conversationId,
          title: conversationTitle,
          mode,
          metrics,
          kernelControls,
          kernelCapabilities,
          preferences,
          draft: getDraft(),
        },
        messages,
        actions,
        consoleLogs,
        screenshots: {
          baseline: screenshotState.baseline,
          comparison: screenshotState.comparison,
          diffPercentage: screenshotState.diffPercentage,
        },
        sessionRecording: {
          status: recordingState.status,
          startedAtIso: recordingState.startedAtIso,
          mimeType: recordingState.blob?.type,
          dataBase64: await blobToBase64(recordingState.blob),
        },
        environment: {
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
          language: typeof navigator !== "undefined" ? navigator.language : "n/a",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        reproduction: buildReproductionScript(),
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const filename = `kolibri-bug-report-${conversationId.slice(0, 8)}-${Date.now()}.json`;
      if (bugReportUrlRef.current) {
        URL.revokeObjectURL(bugReportUrlRef.current);
      }
      const downloadUrl = URL.createObjectURL(blob);
      bugReportUrlRef.current = downloadUrl;
      const summary = {
        actionCount: actions.length,
        messageCount: messages.length,
        hasRecording: Boolean(report.sessionRecording.dataBase64),
        screenshotDiff: screenshotState.diffPercentage,
      };
      const reproductionScript = report.reproduction;
      const result: BugReportResult = {
        blob,
        filename,
        downloadUrl,
        reproductionScript,
        summary,
      };
      setBugReportStatus({
        isGenerating: false,
        downloadUrl,
        filename,
        generatedAtIso: report.generatedAtIso,
        reproductionScript,
        summary,
      });
      logAction("bugreport.generate", "Сформирован отчёт об ошибке", summary as Record<string, unknown>);
      return result;
    } catch (error) {
      setBugReportStatus({
        isGenerating: false,
        error: error instanceof Error ? error.message : "Не удалось собрать отчёт",
      });
      throw error;
    }
  }, [
    actions,
    buildReproductionScript,
    conversationId,
    conversationTitle,
    consoleLogs,
    getDraft,
    kernelCapabilities,
    kernelControls,
    logAction,
    messages,
    metrics,
    mode,
    preferences,
    recordingState.blob,
    recordingState.status,
    recordingState.startedAtIso,
    screenshotState.baseline,
    screenshotState.comparison,
    screenshotState.diffPercentage,
  ]);

  useEffect(() => () => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
    }
    if (bugReportUrlRef.current) {
      URL.revokeObjectURL(bugReportUrlRef.current);
    }
  }, []);

  const enrichedRecordingState = useMemo(() => {
    if (recordingState.status !== "ready") {
      return recordingState;
    }
    return {
      ...recordingState,
      downloadUrl: recordingState.downloadUrl,
    } satisfies SessionRecordingState;
  }, [recordingState]);

  return {
    actions,
    consoleLogs,
    logAction,
    screenshotState,
    captureScreenshot,
    resetScreenshots,
    registerCaptureTarget,
    recordingState: enrichedRecordingState,
    startReplayRecording,
    stopReplayRecording,
    webrtcState,
    createWebRTCOffer,
    acceptWebRTCAnswer,
    closeWebRTC,
    bugReportStatus,
    generateBugReport,
  };
};

export default useInspectorSession;
