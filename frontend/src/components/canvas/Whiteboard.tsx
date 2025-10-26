import { Link2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCollabSession } from "../../core/collaboration/CollabSessionProvider";

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
};

type LinkState = {
  from: string;
};

const EMOJI_SET = ["⚡", "🔥", "💡", "✅", "✨", "🚀"] as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const Whiteboard = () => {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const {
    whiteboard,
    participants,
    createNode,
    updateNode,
    removeNode,
    connectNodes,
    removeEdge,
    addReaction,
  } = useCollabSession();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [linkState, setLinkState] = useState<LinkState | null>(null);
  const [reactionAnchor, setReactionAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!drag) {
      return undefined;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const board = boardRef.current;
      if (!board) {
        return;
      }
      const rect = board.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left - drag.offsetX, 0, rect.width - 120);
      const y = clamp(event.clientY - rect.top - drag.offsetY, 0, rect.height - 80);
      updateNode(drag.id, { x, y });
    };
    const handlePointerUp = () => {
      setDrag(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [drag, updateNode]);

  const handleNodePointerDown = (id: string, event: React.PointerEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    if (!board) {
      return;
    }
    const rect = board.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - (event.currentTarget.offsetLeft ?? 0);
    const offsetY = event.clientY - rect.top - (event.currentTarget.offsetTop ?? 0);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id, offsetX, offsetY });
  };

  const handleBoardDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const id = createNode({ x: clamp(x - 110, 0, rect.width - 220), y: clamp(y - 60, 0, rect.height - 120) });
    if (!id) {
      return;
    }
    updateNode(id, { label: "Новая заметка" });
  };

  const handleLinkToggle = (id: string) => {
    if (linkState?.from === id) {
      setLinkState(null);
      return;
    }
    if (linkState) {
      if (linkState.from !== id) {
        connectNodes(linkState.from, id);
      }
      setLinkState(null);
      return;
    }
    setLinkState({ from: id });
  };

  const handleReactionRequest = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setReactionAnchor({ x, y });
  };

  const handleEmojiSelect = (emoji: string) => {
    if (!reactionAnchor) {
      return;
    }
    const author = participants[0]?.name ?? "Вы";
    addReaction({ emoji, x: reactionAnchor.x, y: reactionAnchor.y, author });
    setReactionAnchor(null);
  };

  const presenceAvatars = useMemo(
    () =>
      participants.map((participant) => (
        <span
          key={participant.clientId}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow-lg"
          style={{ backgroundColor: participant.color }}
          title={`${participant.name} · ${participant.status}`}
        >
          {participant.name.slice(0, 1).toUpperCase()}
        </span>
      )),
    [participants],
  );

  return (
    <section className="glass-panel flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border/40 px-4 py-3 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-text-primary">Коллаборативный холст</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">{presenceAvatars}</div>
          <button
            type="button"
            onClick={() => {
              const board = boardRef.current;
              if (!board) {
                return;
              }
              const rect = board.getBoundingClientRect();
              createNode({ x: rect.width / 2 - 110, y: rect.height / 2 - 60 });
            }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Новый блок
          </button>
        </div>
      </header>
      <div
        ref={boardRef}
        className="relative flex-1 cursor-crosshair bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.18),transparent_55%),linear-gradient(135deg,#0f172a,#1e293b)]"
        onDoubleClick={handleBoardDoubleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          handleReactionRequest(event as unknown as React.MouseEvent<HTMLDivElement>);
        }}
      >
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          {whiteboard.edges.map((edge) => {
            const from = whiteboard.nodes.find((node) => node.id === edge.from);
            const to = whiteboard.nodes.find((node) => node.id === edge.to);
            if (!from || !to) {
              return null;
            }
            const startX = from.x + from.width / 2;
            const startY = from.y + from.height / 2;
            const endX = to.x + to.width / 2;
            const endY = to.y + to.height / 2;
            return (
              <g key={edge.id}>
                <defs>
                  <marker id={`arrow-${edge.id}`} markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L9,3 z" fill="rgba(99,102,241,0.8)" />
                  </marker>
                </defs>
                <path
                  d={`M ${startX} ${startY} C ${(startX + endX) / 2} ${startY}, ${(startX + endX) / 2} ${endY}, ${endX} ${endY}`}
                  stroke="rgba(99,102,241,0.7)"
                  strokeWidth={2.5}
                  fill="none"
                  markerEnd={`url(#arrow-${edge.id})`}
                  className="cursor-pointer"
                  onDoubleClick={() => removeEdge(edge.id)}
                />
              </g>
            );
          })}
        </svg>

        {whiteboard.nodes.map((node) => (
          <div
            key={node.id}
            role="group"
            tabIndex={0}
            className="absolute flex h-[120px] w-[220px] cursor-grab flex-col rounded-2xl border border-white/10 bg-white/5 p-3 text-white shadow-[0_20px_45px_-25px_rgba(59,130,246,0.65)] backdrop-blur transition-transform focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ left: node.x, top: node.y, borderColor: `${node.color}40`, background: `${node.color}20` }}
            onPointerDown={(event) => handleNodePointerDown(node.id, event)}
            onDoubleClick={(event) => {
              event.stopPropagation();
            }}
          >
            <textarea
              value={node.label}
              onChange={(event) => updateNode(node.id, { label: event.target.value })}
              className="flex-1 resize-none bg-transparent text-sm font-semibold leading-snug text-white placeholder:text-white/70 focus:outline-none"
              placeholder="Идея"
            />
            <div className="mt-2 flex items-center justify-between text-[0.7rem] uppercase tracking-[0.25em] text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.65rem] transition-colors ${
                  linkState?.from === node.id ? "border-white bg-white/20 text-slate-800" : "border-white/30 hover:border-white"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleLinkToggle(node.id);
                }}
              >
                <Link2 className="h-3 w-3" />
                Связать
              </button>
              <button
                type="button"
                className="rounded-full border border-white/30 p-1 transition-colors hover:border-red-300 hover:text-red-200"
                onClick={(event) => {
                  event.stopPropagation();
                  removeNode(node.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}

        {whiteboard.reactions.map((reaction) => (
          <span
            key={reaction.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-2xl drop-shadow"
            style={{ left: reaction.x, top: reaction.y }}
            title={`${reaction.emoji} · ${reaction.author}`}
          >
            {reaction.emoji}
          </span>
        ))}

        {reactionAnchor ? (
          <div
            className="absolute z-20 flex -translate-x-1/2 -translate-y-full gap-2 rounded-full border border-white/30 bg-slate-900/90 px-3 py-2 shadow-lg"
            style={{ left: reactionAnchor.x, top: reactionAnchor.y }}
          >
            {EMOJI_SET.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="text-xl transition-transform hover:scale-110"
                onClick={() => handleEmojiSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className="text-xs uppercase tracking-[0.3em] text-white/60"
              onClick={() => setReactionAnchor(null)}
            >
              Закрыть
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default Whiteboard;
