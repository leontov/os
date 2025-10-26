import { memo } from "react";

type MessageAlignment = "left" | "right";

interface MessageSkeletonProps {
  alignment?: MessageAlignment;
  withAvatar?: boolean;
}

const lineClass = "h-3 rounded-full bg-gradient-to-r from-text/10 via-text/5 to-text/10";

const MessageSkeleton = ({ alignment = "left", withAvatar = true }: MessageSkeletonProps) => {
  const isRight = alignment === "right";
  return (
    <div
      className={`flex w-full gap-4 ${isRight ? "flex-row-reverse" : "flex-row"}`}
      aria-hidden="true"
      data-testid="message-skeleton"
    >
      {withAvatar ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted/80" />
      ) : null}
      <div className={`flex w-full max-w-3xl flex-col gap-2 ${isRight ? "items-end" : "items-start"}`}>
        <div className="w-full rounded-3xl border border-border/60 bg-background-card/70 p-5 shadow-inner animate-pulse">
          <div className={`flex flex-col gap-3 ${isRight ? "items-end" : "items-start"}`}>
            <span className={`${lineClass} w-28`} />
            <span className={`${lineClass} w-full`} />
            <span className={`${lineClass} w-11/12`} />
            <span className={`${lineClass} w-2/3`} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(MessageSkeleton);
