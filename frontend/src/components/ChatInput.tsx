import { Paperclip, Plus, RefreshCw, SendHorizontal } from "lucide-react";
import {
  forwardRef,
  type FormEvent,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from "react";

interface ChatInputProps {
  value: string;
  mode: string;
  isBusy: boolean;
  onChange: (value: string) => void;
  onModeChange: (mode: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}

const modes = ["Быстрый ответ", "Исследование", "Творческий"];

const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  ({ value, mode, isBusy, onChange, onModeChange, onSubmit, onReset }, ref) => {
    const textAreaId = useId();
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => textAreaRef.current as HTMLTextAreaElement | null, []);

    useEffect(() => {
      const element = textAreaRef.current;
      if (!element) {
        return;
      }

      element.style.height = "0px";
      const next = Math.max(element.scrollHeight, 160);
      element.style.height = `${next}px`;
    }, [value]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSubmit();
    };

    return (
      <form
        onSubmit={handleSubmit}
        className="group mt-8 flex flex-col gap-6 rounded-[32px] border border-white/60 bg-white/80 p-8 shadow-layer backdrop-blur-xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-coral/20 text-base font-semibold text-accent-coral">
              К
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-text-light">Режим ответа</p>
              <div className="flex items-center gap-3">
                <label htmlFor={textAreaId} className="text-sm font-medium text-text-dark">
                  {mode}
                </label>
                <select
                  id={textAreaId}
                  className="rounded-2xl border border-white/70 bg-background-light/60 px-4 py-2 text-sm font-semibold text-text-dark transition-colors focus:border-primary focus:outline-none"
                  value={mode}
                  onChange={(event) => onModeChange(event.target.value)}
                  disabled={isBusy}
                >
                  {modes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-light">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
            Ядро онлайн • Ответ через миллисекунды
          </div>
        </div>
        <textarea
          id={`${textAreaId}-textarea`}
          ref={textAreaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Опиши запрос для Колибри..."
          className="min-h-[160px] w-full resize-none rounded-3xl border border-white/70 bg-background-light/60 px-5 py-4 text-base text-text-dark placeholder:text-text-light focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-sm text-text-light">
            <button
              type="button"
              className="flex items-center gap-2 rounded-2xl border border-transparent bg-background-light/60 px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:text-text-dark"
              disabled={isBusy}
            >
              <Paperclip className="h-4 w-4" />
              Вложить материалы
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-2 rounded-2xl border border-transparent bg-background-light/60 px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:text-text-dark"
            >
              <Plus className="h-4 w-4" />
              Новый диалог
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-2 rounded-2xl border border-transparent bg-background-light/60 px-4 py-2 text-sm font-semibold text-text-light transition-colors hover:border-primary/40 hover:text-text-dark"
              disabled={isBusy}
            >
              <RefreshCw className="h-4 w-4" />
              Сбросить
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-all hover:shadow-hero focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || !value.trim()}
            >
              <SendHorizontal className="h-4 w-4" />
              Отправить
            </button>
          </div>
        </div>
      </form>
    );
  }
);

ChatInput.displayName = "ChatInput";

export default ChatInput;
