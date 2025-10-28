import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: "success" | "error";
}

interface ToastContextValue {
  publish: (message: Omit<ToastMessage, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const publish = (message: Omit<ToastMessage, "id">) => {
    setMessages((current) => [...current, { ...message, id: crypto.randomUUID() }]);
  };

  const value = useMemo<ToastContextValue>(() => ({ publish }), []);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {messages.map((message) => (
          <ToastPrimitive.Root
            key={message.id}
            className="mb-3 flex w-[320px] items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elev)] p-4 shadow-[var(--shadow-2)]"
            onOpenChange={(open: boolean) => {
              if (!open) {
                setMessages((current) => current.filter((entry) => entry.id !== message.id));
              }
            }}
          >
            <span className="mt-1 text-[var(--brand)]">
              {message.tone === "success" ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden className="text-[var(--danger)]" />}
            </span>
            <div className="flex flex-col gap-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-[var(--text)]">{message.title}</ToastPrimitive.Title>
              {message.description ? (
                <ToastPrimitive.Description className="text-sm text-[var(--muted)]">{message.description}</ToastPrimitive.Description>
              ) : null}
            </div>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-6 right-6 z-50 flex max-w-full flex-col" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast должен использоваться внутри ToastProvider");
  }
  return context;
};
