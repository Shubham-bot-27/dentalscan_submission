"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Camera, CheckCircle2, Loader2, MessageSquare, Send, ShieldCheck } from "lucide-react";

type GuideState = "adjust" | "steady" | "perfect";
type ChatMessage = {
  id: string;
  content: string;
  sender: "patient" | "dentist";
  createdAt?: string;
  pending?: boolean;
};

const VIEWS = [
  { label: "Front View", instruction: "Smile and look straight at the camera." },
  { label: "Left View", instruction: "Turn slightly left so your molars stay inside the guide." },
  { label: "Right View", instruction: "Turn slightly right and keep your teeth inside the mouth guide." },
  { label: "Upper Teeth", instruction: "Tilt your head back a little and lift your upper teeth into the guide." },
  { label: "Lower Teeth", instruction: "Tilt your chin down and center your lower teeth in the guide." },
] as const;

const GUIDE_STYLES: Record<GuideState, { ring: string; glow: string; badge: string; text: string; helper: string }> = {
  adjust: {
    ring: "border-rose-400/90",
    glow: "shadow-[0_0_0_1px_rgba(251,113,133,0.35),0_0_80px_rgba(251,113,133,0.2)]",
    badge: "bg-rose-500/20 text-rose-200 border border-rose-400/40",
    text: "Reposition",
    helper: "Move a little closer and center your mouth inside the guide.",
  },
  steady: {
    ring: "border-amber-300/90",
    glow: "shadow-[0_0_0_1px_rgba(252,211,77,0.35),0_0_80px_rgba(252,211,77,0.18)]",
    badge: "bg-amber-500/20 text-amber-100 border border-amber-300/40",
    text: "Almost ready",
    helper: "Hold still for a moment to improve sharpness.",
  },
  perfect: {
    ring: "border-emerald-400/90",
    glow: "shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_80px_rgba(52,211,153,0.18)]",
    badge: "bg-emerald-500/20 text-emerald-100 border border-emerald-300/40",
    text: "Great framing",
    helper: "Stable and centered. You can capture now.",
  },
};

const starterMessages: ChatMessage[] = [
  {
    id: "welcome",
    content: "Hi! I reviewed the upload queue. Send us a quick note if you feel pain, sensitivity, or want a callback.",
    sender: "dentist",
    createdAt: new Date().toISOString(),
  },
];

export default function ScanningFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camReady, setCamReady] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [guideState, setGuideState] = useState<GuideState>("adjust");
  const [scanId] = useState(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `scan-${Date.now()}`;
  });
  const [uploading, setUploading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  const isComplete = currentStep >= VIEWS.length;
  const guideMeta = GUIDE_STYLES[guideState];

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCamReady(true);
        }
      } catch (err) {
        console.error("Camera access denied", err);
        setScanError("We could not access the camera. Check browser permissions and try again.");
      }
    }

    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (isComplete) return;

    setGuideState("adjust");
    const toSteady = window.setTimeout(() => setGuideState("steady"), 900);
    const toPerfect = window.setTimeout(() => setGuideState("perfect"), 2200);

    return () => {
      window.clearTimeout(toSteady);
      window.clearTimeout(toPerfect);
    };
  }, [currentStep, isComplete]);

  const notifyScanComplete = useCallback(async (images: string[]) => {
    setUploading(true);
    setScanError(null);

    try {
      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId,
          status: "completed",
          userId: "demo-patient",
          images,
        }),
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error(error);
      setScanError("The scan finished locally, but the clinic notification could not be saved.");
    } finally {
      setUploading(false);
    }
  }, [scanId]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !camReady || uploading) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    setCapturedImages((prev) => {
      const nextImages = [...prev, dataUrl];
      const nextStep = nextImages.length;
      setCurrentStep(nextStep);

      if (nextStep === VIEWS.length) {
        void notifyScanComplete(nextImages);
      }

      return nextImages;
    });
  }, [camReady, notifyScanComplete, uploading]);

  const fetchMessages = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/messaging?threadId=${id}`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error("Failed to load messages", error);
    }
  }, []);

  useEffect(() => {
    if (threadId) {
      void fetchMessages(threadId);
    }
  }, [threadId, fetchMessages]);

  const handleSendMessage = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setMessageError(null);

    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      content: trimmed,
      sender: "patient",
      pending: true,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft("");

    try {
      const response = await fetch("/api/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          content: trimmed,
          sender: "patient",
          patientId: "demo-patient",
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to send message");
      }

      const data = await response.json();
      setThreadId(data.threadId);
      setMessages((prev) => {
        const updated = prev.map((message) => (message.id === optimisticMessage.id ? data.message : message));
        // Add clinic auto-reply if present
        if (data.clinicReply) {
          updated.push(data.clinicReply);
        }
        return updated;
      });
    } catch (error) {
      console.error(error);
      setMessageError("Message could not be sent. Your draft is safe. Please try again.");
      setDraft(trimmed);
      setMessages((prev) => prev.filter((message) => message.id !== optimisticMessage.id));
    } finally {
      setSending(false);
    }
  }, [draft, sending, threadId]);

  const progress = useMemo(() => ((Math.min(currentStep, VIEWS.length) / VIEWS.length) * 100).toFixed(0), [currentStep]);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col xl:flex-row">
        <section className="flex-1 border-b border-white/10 xl:border-b-0 xl:border-r xl:border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">DentalScan AI</p>
              <h1 className="mt-1 text-lg font-semibold sm:text-xl">Guided capture flow</h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">Progress</p>
              <p className="text-sm font-medium text-white">{Math.min(currentStep + 1, VIEWS.length)}/{VIEWS.length}</p>
            </div>
          </div>

          {!isComplete ? (
            <>
              <div className="px-4 pt-5 sm:px-6">
                <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
                  <span>{progress}% complete</span>
                  <span>{VIEWS[currentStep].label}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="relative mx-auto mt-5 aspect-[3/4] w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl shadow-cyan-950/20">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover opacity-90"
                />

                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,rgba(0,0,0,0.32)_66%,rgba(0,0,0,0.88)_100%)]" />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-10">
                  <div className={`relative aspect-[1.1/1] w-[74%] max-w-[280px] rounded-[45%] border-[3px] ${guideMeta.ring} ${guideMeta.glow} transition-all duration-500`}>
                    <div className="absolute inset-[10%] rounded-[42%] border border-white/15" />
                    <div className="absolute left-1/2 top-3 h-5 w-24 -translate-x-1/2 rounded-full border border-white/15" />
                    <div className="absolute bottom-4 left-1/2 h-6 w-32 -translate-x-1/2 rounded-full border border-white/10" />
                  </div>
                </div>

                <div className="absolute left-4 top-4 right-4 flex items-start justify-between gap-3">
                  <div className={`rounded-full px-3 py-1 text-xs font-medium backdrop-blur ${guideMeta.badge}`}>
                    {guideMeta.text}
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-zinc-200 backdrop-blur">
                    {camReady ? "Camera live" : "Starting camera..."}
                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 text-center">
                  <p className="text-lg font-semibold">{VIEWS[currentStep].label}</p>
                  <p className="mt-1 text-sm text-zinc-300">{VIEWS[currentStep].instruction}</p>
                  <p className="mt-3 text-xs text-zinc-400">{guideMeta.helper}</p>
                </div>
              </div>

              <div className="px-4 py-8 sm:px-6">
                {scanError && (
                  <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {scanError}
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    onClick={handleCapture}
                    disabled={!camReady || guideState === "adjust" || uploading}
                    className="group flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/80 transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-black transition group-active:scale-90">
                      {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
                    </div>
                  </button>
                </div>
                <p className="mt-4 text-center text-xs text-zinc-500">
                  Capture is enabled when the guide turns green.
                </p>
              </div>
            </>
          ) : (
            <div className="px-4 py-8 sm:px-6">
              <div className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/10 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <CheckCircle2 className="mt-1 text-emerald-400" size={28} />
                    <div>
                      <h2 className="text-2xl font-semibold">Scan complete</h2>
                      <p className="mt-1 text-sm text-zinc-300">
                        All 5 views were captured. The clinic has been notified and the patient can message from here.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
                    {uploading ? "Saving scan..." : "Notification queued"}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {capturedImages.map((image, index) => (
                  <div key={index} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                    <img src={image} alt={VIEWS[index].label} className="aspect-[4/3] w-full object-cover" />
                    <div className="p-3">
                      <p className="text-sm font-medium">{VIEWS[index].label}</p>
                      <p className="mt-1 text-xs text-zinc-400">Captured successfully</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-white/10 px-4 py-4 sm:px-6">
            <div className="flex gap-2 overflow-x-auto">
              {VIEWS.map((view, index) => (
                <div
                  key={view.label}
                  className={`w-24 shrink-0 rounded-2xl border p-2 ${
                    index < currentStep
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : index === currentStep && !isComplete
                        ? "border-cyan-400/50 bg-cyan-500/10"
                        : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="mb-2 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-black/40">
                    {capturedImages[index] ? (
                      <img src={capturedImages[index]} alt={view.label} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-zinc-500">{index + 1}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-300">{view.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="w-full xl:max-w-md">
          <div className="border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-300">
                <MessageSquare size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Quick message</h2>
                <p className="text-sm text-zinc-400">Patient to clinic communication on the result dashboard.</p>
              </div>
            </div>
          </div>

          <div className="border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <ShieldCheck className="text-emerald-400" size={18} />
                <span>Messages stay in the app and map to a persisted thread.</span>
              </div>
            </div>
          </div>

          <div className="flex h-[520px] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === "patient" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm ${
                      message.sender === "patient"
                        ? "bg-cyan-400 text-black"
                        : "border border-white/10 bg-white/[0.04] text-zinc-100"
                    }`}
                  >
                    <p>{message.content}</p>
                    <p className={`mt-2 text-[11px] ${message.sender === "patient" ? "text-black/60" : "text-zinc-500"}`}>
                      {message.pending ? "Sending..." : message.sender === "patient" ? "You" : "Clinic team"}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 px-4 py-4 sm:px-6">
              {messageError && (
                <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {messageError}
                </div>
              )}
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Tell the clinic about pain, bleeding, sensitivity, or questions you have."
                  className="min-h-28 w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">Thread: {threadId ?? "Will be created on first message"}</p>
                  <button
                    onClick={handleSendMessage}
                    disabled={!isComplete || sending || !draft.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                  >
                    {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    Send
                  </button>
                </div>
                {!isComplete && (
                  <p className="mt-3 text-xs text-zinc-500">Messaging unlocks after the scan is completed.</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
