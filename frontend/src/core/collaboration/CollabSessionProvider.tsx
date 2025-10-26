/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

type PresenceStatus = "online" | "away" | "offline";

type ParticipantPresence = {
  clientId: number;
  name: string;
  color: string;
  status: PresenceStatus;
  lastActiveIso: string;
};

type CollabMessage = {
  id: string;
  author: string;
  role: string;
  content: string;
  createdAtIso: string;
  parentId: string | null;
  reactions: Record<string, number>;
};

type CollabThread = CollabMessage & {
  replies: CollabMessage[];
};

type CollabNote = {
  id: string;
  title: string;
  content: string;
  updatedAtIso: string;
};

type CanvasNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

type CanvasEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

type CanvasReaction = {
  id: string;
  emoji: string;
  x: number;
  y: number;
  author: string;
  createdAtIso: string;
};

type WhiteboardState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  reactions: CanvasReaction[];
};

type CollabSessionContextValue = {
  roomId: string;
  shareLink: string | null;
  participants: ParticipantPresence[];
  messages: CollabThread[];
  notes: CollabNote[];
  whiteboard: WhiteboardState;
  syncMessagesSnapshot: (messages: Array<{ id: string; role: string; content: string; author?: string }>) => void;
  addMessage: (payload: { id?: string; content: string; role?: string; author?: string }) => string | null;
  updateMessage: (id: string, updates: Partial<Pick<CollabMessage, "content">>) => void;
  addReply: (parentId: string, content: string, author?: string) => string | null;
  toggleReaction: (id: string, reaction: string) => void;
  addNote: (payload: { id?: string; title: string; content: string }) => string | null;
  updateNote: (id: string, updates: Partial<Omit<CollabNote, "id">>) => void;
  removeNote: (id: string) => void;
  createNode: (payload?: Partial<Omit<CanvasNode, "id">>) => string | null;
  updateNode: (id: string, updates: Partial<Omit<CanvasNode, "id">>) => void;
  removeNode: (id: string) => void;
  connectNodes: (from: string, to: string, label?: string) => string | null;
  removeEdge: (id: string) => void;
  addReaction: (reaction: Omit<CanvasReaction, "id" | "createdAtIso">) => string | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  updatePresence: (updates: Partial<Omit<ParticipantPresence, "clientId">>) => void;
};

type RuntimeState = {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  messagesMap: Y.Map<Y.Map<unknown>>;
  messagesOrder: Y.Array<string>;
  notesMap: Y.Map<Y.Map<unknown>>;
  nodesMap: Y.Map<Y.Map<unknown>>;
  edgesMap: Y.Map<Y.Map<unknown>>;
  reactionsArray: Y.Array<Y.Map<unknown>>;
  undoManager: Y.UndoManager;
};

type AwarenessState = {
  name?: string;
  color?: string;
  status?: PresenceStatus;
  lastActiveIso?: string;
};

const DEFAULT_COLLAB_ENDPOINT = "wss://demos.yjs.dev";

const CollabSessionContext = createContext<CollabSessionContextValue | null>(null);

const createRuntime = (roomId: string, endpoint: string | undefined): RuntimeState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const doc = new Y.Doc();
  const provider = new WebsocketProvider(endpoint || DEFAULT_COLLAB_ENDPOINT, roomId, doc, { connect: true });
  const messagesMap = doc.getMap<Y.Map<unknown>>("messages");
  const messagesOrder = doc.getArray<string>("messages:order");
  const notesMap = doc.getMap<Y.Map<unknown>>("notes");
  const nodesMap = doc.getMap<Y.Map<unknown>>("whiteboard:nodes");
  const edgesMap = doc.getMap<Y.Map<unknown>>("whiteboard:edges");
  const reactionsArray = doc.getArray<Y.Map<unknown>>("whiteboard:reactions");
  const undoManager = new Y.UndoManager([messagesMap, messagesOrder, notesMap, nodesMap, edgesMap, reactionsArray]);

  return {
    doc,
    provider,
    messagesMap,
    messagesOrder,
    notesMap,
    nodesMap,
    edgesMap,
    reactionsArray,
    undoManager,
  };
};

const readMessage = (message: Y.Map<unknown>): CollabMessage | null => {
  const id = message.get("id");
  const content = message.get("content");
  const role = message.get("role");
  const createdAtIso = message.get("createdAtIso");
  if (typeof id !== "string" || typeof content !== "string" || typeof createdAtIso !== "string") {
    return null;
  }

  const reactionsMap = message.get("reactions");
  const rawReactions: Record<string, number> = {};
  if (reactionsMap instanceof Y.Map) {
    reactionsMap.forEach((value, key) => {
      if (typeof value === "number" && value > 0) {
        rawReactions[key] = value;
      }
    });
  }

  return {
    id,
    content,
    role: typeof role === "string" ? role : "assistant",
    author: typeof message.get("author") === "string" ? (message.get("author") as string) : "participant",
    parentId: typeof message.get("parentId") === "string" ? (message.get("parentId") as string) : null,
    createdAtIso,
    reactions: rawReactions,
  };
};

const readNotes = (notesMap: Y.Map<Y.Map<unknown>>): CollabNote[] => {
  const notes: CollabNote[] = [];
  notesMap.forEach((value) => {
    const id = value.get("id");
    const title = value.get("title");
    const content = value.get("content");
    const updatedAtIso = value.get("updatedAtIso");
    if (typeof id === "string" && typeof title === "string" && typeof content === "string" && typeof updatedAtIso === "string") {
      notes.push({ id, title, content, updatedAtIso });
    }
  });
  return notes.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
};

const readNodes = (nodesMap: Y.Map<Y.Map<unknown>>): CanvasNode[] => {
  const nodes: CanvasNode[] = [];
  nodesMap.forEach((value) => {
    const id = value.get("id");
    const label = value.get("label");
    const x = value.get("x");
    const y = value.get("y");
    const width = value.get("width");
    const height = value.get("height");
    const color = value.get("color");
    if (
      typeof id === "string" &&
      typeof label === "string" &&
      typeof x === "number" &&
      typeof y === "number" &&
      typeof width === "number" &&
      typeof height === "number" &&
      typeof color === "string"
    ) {
      nodes.push({ id, label, x, y, width, height, color });
    }
  });
  return nodes;
};

const readEdges = (edgesMap: Y.Map<Y.Map<unknown>>): CanvasEdge[] => {
  const edges: CanvasEdge[] = [];
  edgesMap.forEach((value) => {
    const id = value.get("id");
    const from = value.get("from");
    const to = value.get("to");
    if (typeof id === "string" && typeof from === "string" && typeof to === "string") {
      const label = value.get("label");
      edges.push({ id, from, to, label: typeof label === "string" ? label : undefined });
    }
  });
  return edges;
};

const readReactions = (reactionsArray: Y.Array<Y.Map<unknown>>): CanvasReaction[] =>
  reactionsArray
    .toArray()
    .map((reaction) => {
      const id = reaction.get("id");
      const emoji = reaction.get("emoji");
      const x = reaction.get("x");
      const y = reaction.get("y");
      const author = reaction.get("author");
      const createdAtIso = reaction.get("createdAtIso");
      if (
        typeof id === "string" &&
        typeof emoji === "string" &&
        typeof x === "number" &&
        typeof y === "number" &&
        typeof author === "string" &&
        typeof createdAtIso === "string"
      ) {
        return { id, emoji, x, y, author, createdAtIso } satisfies CanvasReaction;
      }
      return null;
    })
    .filter((reaction): reaction is CanvasReaction => Boolean(reaction));

const buildThreads = (messages: CollabMessage[]): CollabThread[] => {
  const byId = new Map<string, CollabMessage & { replies: CollabMessage[] }>();
  const roots: Array<CollabMessage & { replies: CollabMessage[] }> = [];
  messages.forEach((message) => {
    const withReplies = { ...message, replies: [] };
    byId.set(message.id, withReplies);
  });
  messages.forEach((message) => {
    if (message.parentId) {
      const parent = byId.get(message.parentId);
      if (parent) {
        parent.replies.push({ ...message });
      }
    }
  });
  byId.forEach((value) => {
    if (!value.parentId) {
      roots.push(value);
    }
  });
  return roots.map((thread) => ({ ...thread, replies: thread.replies.sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso)) }));
};

const randomColor = () => {
  const colors = ["#6366f1", "#14b8a6", "#f97316", "#ec4899", "#22d3ee", "#a855f7"];
  return colors[Math.floor(Math.random() * colors.length)] ?? "#6366f1";
};

const resolveShareLink = (roomId: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    return url.toString();
  } catch {
    return null;
  }
};

const CollabSessionProvider = ({ roomId, endpoint, children }: PropsWithChildren<{ roomId: string; endpoint?: string }>) => {
  const runtimeRef = useRef<RuntimeState | null>(null);
  const [messages, setMessages] = useState<CollabThread[]>([]);
  const [notes, setNotes] = useState<CollabNote[]>([]);
  const [whiteboard, setWhiteboard] = useState<WhiteboardState>({ nodes: [], edges: [], reactions: [] });
  const [participants, setParticipants] = useState<ParticipantPresence[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(() => resolveShareLink(roomId));

  useEffect(() => {
    runtimeRef.current?.provider?.destroy();
    runtimeRef.current?.doc?.destroy();
    runtimeRef.current = createRuntime(roomId, endpoint) ?? null;

    const runtime = runtimeRef.current;
    if (!runtime) {
      setMessages([]);
      setNotes([]);
      setWhiteboard({ nodes: [], edges: [], reactions: [] });
      setParticipants([]);
      return () => undefined;
    }

    const updateState = () => {
      const orderedIds = runtime.messagesOrder.toArray();
      const orderedMessages = orderedIds
        .map((id) => runtime.messagesMap.get(id))
        .filter((entry): entry is Y.Map<unknown> => entry instanceof Y.Map)
        .map((entry) => readMessage(entry))
        .filter((entry): entry is CollabMessage => Boolean(entry));
      setMessages(buildThreads(orderedMessages));
      setNotes(readNotes(runtime.notesMap));
      setWhiteboard({
        nodes: readNodes(runtime.nodesMap),
        edges: readEdges(runtime.edgesMap),
        reactions: readReactions(runtime.reactionsArray),
      });
      setCanUndo(runtime.undoManager.undoStack.length > 0);
      setCanRedo(runtime.undoManager.redoStack.length > 0);
    };

    updateState();

    const handleDocUpdate = () => updateState();
    runtime.doc.on("update", handleDocUpdate);

    const handleStackChange = () => {
      setCanUndo(runtime.undoManager.undoStack.length > 0);
      setCanRedo(runtime.undoManager.redoStack.length > 0);
    };
    runtime.undoManager.on("stack-item-added", handleStackChange);
    runtime.undoManager.on("stack-item-popped", handleStackChange);

    const awareness = runtime.provider?.awareness;
    const handleAwareness = () => {
      if (!awareness) {
        setParticipants([]);
        return;
      }
      const states: ParticipantPresence[] = [];
      awareness.getStates().forEach((value, clientId) => {
        const state = value as AwarenessState;
        states.push({
          clientId,
          name: state.name ?? `Участник ${clientId}`,
          color: state.color ?? randomColor(),
          status: state.status ?? "online",
          lastActiveIso: state.lastActiveIso ?? new Date().toISOString(),
        });
      });
      setParticipants(states);
    };

    if (awareness) {
      awareness.on("change", handleAwareness);
      handleAwareness();
      const localName = awareness.getLocalState()?.name ?? `Вы #${runtime.doc.clientID.toString(16)}`;
      awareness.setLocalStateField("name", localName);
      awareness.setLocalStateField("color", randomColor());
      awareness.setLocalStateField("status", "online");
      awareness.setLocalStateField("lastActiveIso", new Date().toISOString());
    }

    setShareLink(resolveShareLink(roomId));

    return () => {
      runtime.doc.off("update", handleDocUpdate);
      runtime.undoManager.off("stack-item-added", handleStackChange);
      runtime.undoManager.off("stack-item-popped", handleStackChange);
      awareness?.off("change", handleAwareness);
      runtime.provider?.destroy();
      runtime.doc.destroy();
      runtimeRef.current = null;
    };
  }, [roomId, endpoint]);

  const syncMessagesSnapshot = useCallback<CollabSessionContextValue["syncMessagesSnapshot"]>((snapshots) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }

    runtime.doc.transact(() => {
      const seenIds = new Set<string>();
      snapshots.forEach((snapshot) => {
        const id = snapshot.id;
        seenIds.add(id);
        const existing = runtime.messagesMap.get(id);
        if (existing) {
          existing.set("content", snapshot.content);
          existing.set("role", snapshot.role ?? "assistant");
          existing.set("author", snapshot.author ?? snapshot.role ?? "participant");
          if (!existing.get("reactions")) {
            existing.set("reactions", new Y.Map<number>());
          }
          return;
        }

        const message = new Y.Map<unknown>();
        message.set("id", id);
        message.set("content", snapshot.content);
        message.set("role", snapshot.role ?? "assistant");
        message.set("createdAtIso", new Date().toISOString());
        message.set("author", snapshot.author ?? snapshot.role ?? "participant");
        message.set("parentId", null);
        message.set("reactions", new Y.Map<number>());
        runtime.messagesMap.set(id, message);
      });

      runtime.messagesMap.forEach((_, messageId) => {
        if (!seenIds.has(messageId)) {
          runtime.messagesMap.delete(messageId);
        }
      });

      const desiredOrder = snapshots.map((snapshot) => snapshot.id);
      const currentOrder = runtime.messagesOrder.toArray();
      const orderChanged =
        currentOrder.length !== desiredOrder.length || currentOrder.some((value, index) => value !== desiredOrder[index]);

      if (orderChanged) {
        if (runtime.messagesOrder.length > 0) {
          runtime.messagesOrder.delete(0, runtime.messagesOrder.length);
        }
        if (desiredOrder.length > 0) {
          runtime.messagesOrder.insert(0, desiredOrder);
        }
      }
    });
  }, []);

  const generateId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(16).slice(2)}`);

  const addMessage = useCallback<CollabSessionContextValue["addMessage"]>((payload) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return null;
    }
    const id = payload.id ?? generateId();
    runtime.doc.transact(() => {
      const map = runtime.messagesMap.get(id) ?? new Y.Map<unknown>();
      map.set("id", id);
      map.set("content", payload.content);
      map.set("role", payload.role ?? "user");
      map.set("author", payload.author ?? "participant");
      map.set("createdAtIso", new Date().toISOString());
      map.set("parentId", null);
      if (!map.get("reactions")) {
        map.set("reactions", new Y.Map<number>());
      }
      runtime.messagesMap.set(id, map);
      if (!runtime.messagesOrder.toArray().includes(id)) {
        runtime.messagesOrder.push([id]);
      }
    });
    return id;
  }, []);

  const updateMessage = useCallback<CollabSessionContextValue["updateMessage"]>((id, updates) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const map = runtime.messagesMap.get(id);
    if (!map) {
      return;
    }
    runtime.doc.transact(() => {
      if (typeof updates.content === "string") {
        map.set("content", updates.content);
        map.set("updatedAtIso", new Date().toISOString());
      }
    });
  }, []);

  const addReply = useCallback<CollabSessionContextValue["addReply"]>((parentId, content, author) => {
    const runtime = runtimeRef.current;
    if (!runtime || !runtime.messagesMap.has(parentId)) {
      return null;
    }
    const id = generateId();
    runtime.doc.transact(() => {
      const map = new Y.Map<unknown>();
      map.set("id", id);
      map.set("content", content);
      map.set("role", "user");
      map.set("author", author ?? "participant");
      map.set("createdAtIso", new Date().toISOString());
      map.set("parentId", parentId);
      map.set("reactions", new Y.Map<number>());
      runtime.messagesMap.set(id, map);
      runtime.messagesOrder.push([id]);
    });
    return id;
  }, []);

  const toggleReaction = useCallback<CollabSessionContextValue["toggleReaction"]>((messageId, reaction) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const map = runtime.messagesMap.get(messageId);
    if (!(map instanceof Y.Map)) {
      return;
    }
    const reactions = map.get("reactions");
    if (!(reactions instanceof Y.Map)) {
      return;
    }
    runtime.doc.transact(() => {
      const current = reactions.get(reaction);
      const next = typeof current === "number" && current > 0 ? 0 : 1;
      if (next > 0) {
        reactions.set(reaction, next);
      } else {
        reactions.delete(reaction);
      }
    });
  }, []);

  const addNote = useCallback<CollabSessionContextValue["addNote"]>((payload) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return null;
    }
    const id = payload.id ?? generateId();
    runtime.doc.transact(() => {
      const map = runtime.notesMap.get(id) ?? new Y.Map<unknown>();
      map.set("id", id);
      map.set("title", payload.title);
      map.set("content", payload.content);
      map.set("updatedAtIso", new Date().toISOString());
      runtime.notesMap.set(id, map);
    });
    return id;
  }, []);

  const updateNote = useCallback<CollabSessionContextValue["updateNote"]>((id, updates) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const map = runtime.notesMap.get(id);
    if (!map) {
      return;
    }
    runtime.doc.transact(() => {
      if (typeof updates.title === "string") {
        map.set("title", updates.title);
      }
      if (typeof updates.content === "string") {
        map.set("content", updates.content);
      }
      map.set("updatedAtIso", new Date().toISOString());
    });
  }, []);

  const removeNote = useCallback<CollabSessionContextValue["removeNote"]>((id) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.doc.transact(() => {
      runtime.notesMap.delete(id);
    });
  }, []);

  const createNode = useCallback<CollabSessionContextValue["createNode"]>((payload) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return null;
    }
    const id = payload?.id ?? generateId();
    runtime.doc.transact(() => {
      const map = runtime.nodesMap.get(id) ?? new Y.Map<unknown>();
      map.set("id", id);
      map.set("label", payload?.label ?? "Новая идея");
      map.set("x", payload?.x ?? 120);
      map.set("y", payload?.y ?? 120);
      map.set("width", payload?.width ?? 220);
      map.set("height", payload?.height ?? 120);
      map.set("color", payload?.color ?? randomColor());
      runtime.nodesMap.set(id, map);
    });
    return id;
  }, []);

  const updateNode = useCallback<CollabSessionContextValue["updateNode"]>((id, updates) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const map = runtime.nodesMap.get(id);
    if (!map) {
      return;
    }
    runtime.doc.transact(() => {
      if (typeof updates.label === "string") {
        map.set("label", updates.label);
      }
      if (typeof updates.x === "number") {
        map.set("x", updates.x);
      }
      if (typeof updates.y === "number") {
        map.set("y", updates.y);
      }
      if (typeof updates.width === "number") {
        map.set("width", updates.width);
      }
      if (typeof updates.height === "number") {
        map.set("height", updates.height);
      }
      if (typeof updates.color === "string") {
        map.set("color", updates.color);
      }
    });
  }, []);

  const removeNode = useCallback<CollabSessionContextValue["removeNode"]>((id) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.doc.transact(() => {
      runtime.nodesMap.delete(id);
      runtime.edgesMap.forEach((edge, edgeId) => {
        const from = edge.get("from");
        const to = edge.get("to");
        if (from === id || to === id) {
          runtime.edgesMap.delete(edgeId);
        }
      });
    });
  }, []);

  const connectNodes = useCallback<CollabSessionContextValue["connectNodes"]>((from, to, label) => {
    const runtime = runtimeRef.current;
    if (!runtime || !runtime.nodesMap.has(from) || !runtime.nodesMap.has(to)) {
      return null;
    }
    const id = generateId();
    runtime.doc.transact(() => {
      const map = new Y.Map<unknown>();
      map.set("id", id);
      map.set("from", from);
      map.set("to", to);
      if (label) {
        map.set("label", label);
      }
      runtime.edgesMap.set(id, map);
    });
    return id;
  }, []);

  const removeEdge = useCallback<CollabSessionContextValue["removeEdge"]>((id) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.doc.transact(() => {
      runtime.edgesMap.delete(id);
    });
  }, []);

  const addReaction = useCallback<CollabSessionContextValue["addReaction"]>((payload) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return null;
    }
    const id = generateId();
    runtime.doc.transact(() => {
      const map = new Y.Map<unknown>();
      map.set("id", id);
      map.set("emoji", payload.emoji);
      map.set("x", payload.x);
      map.set("y", payload.y);
      map.set("author", payload.author);
      map.set("createdAtIso", new Date().toISOString());
      runtime.reactionsArray.push([map]);
    });
    return id;
  }, []);

  const undo = useCallback(() => {
    const runtime = runtimeRef.current;
    runtime?.undoManager.undo();
  }, []);

  const redo = useCallback(() => {
    const runtime = runtimeRef.current;
    runtime?.undoManager.redo();
  }, []);

  const updatePresence = useCallback<CollabSessionContextValue["updatePresence"]>((updates) => {
    const runtime = runtimeRef.current;
    const awareness = runtime?.provider?.awareness;
    if (!awareness) {
      return;
    }
    const state = {
      ...(awareness.getLocalState() as AwarenessState),
      ...updates,
      lastActiveIso: new Date().toISOString(),
    };
    awareness.setLocalState(state);
  }, []);

  const value = useMemo<CollabSessionContextValue>(
    () => ({
      roomId,
      shareLink,
      participants,
      messages,
      notes,
      whiteboard,
      syncMessagesSnapshot,
      addMessage,
      updateMessage,
      addReply,
      toggleReaction,
      addNote,
      updateNote,
      removeNote,
      createNode,
      updateNode,
      removeNode,
      connectNodes,
      removeEdge,
      addReaction,
      undo,
      redo,
      canUndo,
      canRedo,
      updatePresence,
    }),
    [
      roomId,
      shareLink,
      participants,
      messages,
      notes,
      whiteboard,
      syncMessagesSnapshot,
      addMessage,
      updateMessage,
      addReply,
      toggleReaction,
      addNote,
      updateNote,
      removeNote,
      createNode,
      updateNode,
      removeNode,
      connectNodes,
      removeEdge,
      addReaction,
      undo,
      redo,
      canUndo,
      canRedo,
      updatePresence,
    ],
  );

  return <CollabSessionContext.Provider value={value}>{children}</CollabSessionContext.Provider>;
};

export const useCollabSession = () => {
  const value = useContext(CollabSessionContext);
  if (!value) {
    throw new Error("useCollabSession must be used within CollabSessionProvider");
  }
  return value;
};

export default CollabSessionProvider;
