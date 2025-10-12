import { Paperclip, Plus, RefreshCw, SendHorizontal } from "lucide-react";
import { useId } from "react";

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

const ChatInput = ({ value, mode, isBusy, onChange, onModeChange, onSubmit, onReset }: ChatInputProps) => {
  const textAreaId = useId();

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border-strong bg-background-input/90 p-6 backdrop-blur">
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">К</div>
          <span>Режим</span>
          <select
            id={textAreaId}
            className="rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 text-xs font-semibold text-text-primary focus:border-primary focus:outline-none"
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
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary"
          disabled={isBusy}
        >
          <Plus className="h-4 w-4" />
          Новый диалог
        </button>
      </div>
      <textarea
        id={`${textAreaId}-textarea`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Сообщение для Колибри"
        className="min-h-[140px] w-full resize-none rounded-2xl border border-border-strong bg-background-card/80 px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
        <div className="flex gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 transition-colors hover:text-text-primary"
            disabled={isBusy}
          >
            <Paperclip className="h-4 w-4" />
            Вложить
          </button>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 transition-colors hover:text-text-primary"
            disabled={isBusy}
          >
            <RefreshCw className="h-4 w-4" />
            Сбросить
          </button>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy || !value.trim()}
        >
          <SendHorizontal className="h-4 w-4" />
          Отправить
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
