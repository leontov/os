/*
 * wasi.ts
 *
 * Minimal WASI snapshot preview1 bindings tailored for the Kolibri WebAssembly
 * module. Only the functionality required by the compiled runtime is
 * implemented. The bindings intentionally avoid throwing when the WebAssembly
 * memory export is still unavailable – this situation occurs while the module
 * is being instantiated and WASI functions are invoked during import
 * resolution. Instead, the affected calls return benign error codes, allowing
 * instantiation to proceed once the memory export becomes accessible.
 */

interface WasiOptions {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const WASI_ERRNO_SUCCESS = 0;
const WASI_ERRNO_BADF = 8;
export const WASI_ERRNO_INVAL = 28;
const WASI_ERRNO_NOTSUP = 58;

const WASI_FILETYPE_CHARACTER_DEVICE = 2;

const STDIN_FD = 0;
const STDOUT_FD = 1;
const STDERR_FD = 2;

interface WasiFileDescriptor {
  readonly filetype: number;
  readonly rightsBase: bigint;
  readonly rightsInheriting: bigint;
}

const FILE_DESCRIPTORS: ReadonlyMap<number, WasiFileDescriptor> = new Map([
  [
    STDIN_FD,
    {
      filetype: WASI_FILETYPE_CHARACTER_DEVICE,
      rightsBase: 0n,
      rightsInheriting: 0n,
    },
  ],
  [
    STDOUT_FD,
    {
      filetype: WASI_FILETYPE_CHARACTER_DEVICE,
      rightsBase: 0xffffffffffffffffn,
      rightsInheriting: 0n,
    },
  ],
  [
    STDERR_FD,
    {
      filetype: WASI_FILETYPE_CHARACTER_DEVICE,
      rightsBase: 0xffffffffffffffffn,
      rightsInheriting: 0n,
    },
  ],
]);

interface MemoryContext {
  memory: WebAssembly.Memory | null;
  dataView: DataView | null;
  uint8View: Uint8Array | null;
}

const memoryContext: MemoryContext = {
  memory: null,
  dataView: null,
  uint8View: null,
};

function updateMemory(memory: WebAssembly.Memory | null): void {
  memoryContext.memory = memory;
  memoryContext.dataView = null;
  memoryContext.uint8View = null;
}

function ensureDataView(): DataView {
  const memory = memoryContext.memory;
  if (memory === null) {
    throw new Error("WASI memory is not initialised");
  }

  if (!memoryContext.dataView || memoryContext.dataView.buffer !== memory.buffer) {
    memoryContext.dataView = new DataView(memory.buffer);
  }

  return memoryContext.dataView;
}

function ensureUint8Array(): Uint8Array {
  const memory = memoryContext.memory;
  if (memory === null) {
    throw new Error("WASI memory is not initialised");
  }

  if (!memoryContext.uint8View || memoryContext.uint8View.buffer !== memory.buffer) {
    memoryContext.uint8View = new Uint8Array(memory.buffer);
  }

  return memoryContext.uint8View;
}

const textDecoder = new TextDecoder("utf-8");

function writeToConsole(fd: number, text: string, options: Required<WasiOptions>): number {
  if (fd === STDOUT_FD) {
    options.stdout(text);
    return WASI_ERRNO_SUCCESS;
  }

  if (fd === STDERR_FD) {
    options.stderr(text);
    return WASI_ERRNO_SUCCESS;
  }

  return WASI_ERRNO_BADF;
}

function fdWrite(fd: number, iovs: number, iovsLen: number, nwrittenPtr: number, options: Required<WasiOptions>): number {
  if (memoryContext.memory === null) {
    return WASI_ERRNO_INVAL;
  }

  const view = ensureDataView();
  const bytes = ensureUint8Array();
  let total = 0;
  let collected = "";

  for (let index = 0; index < iovsLen; index += 1) {
    const offset = iovs + index * 8;
    const ptr = view.getUint32(offset, true);
    const length = view.getUint32(offset + 4, true);

    if (length === 0) {
      continue;
    }

    const slice = bytes.subarray(ptr, ptr + length);
    collected += textDecoder.decode(slice);
    total += length;
  }

  const writeResult = writeToConsole(fd, collected, options);
  if (writeResult === WASI_ERRNO_SUCCESS) {
    view.setUint32(nwrittenPtr, total, true);
  }

  return writeResult;
}

function fdFdstatGet(fd: number, fdstatPtr: number): number {
  const descriptor = FILE_DESCRIPTORS.get(fd);
  if (!descriptor) {
    return WASI_ERRNO_BADF;
  }

  if (memoryContext.memory === null) {
    return WASI_ERRNO_INVAL;
  }

  const view = ensureDataView();

  view.setUint8(fdstatPtr, descriptor.filetype);
  view.setUint8(fdstatPtr + 1, 0);
  view.setUint16(fdstatPtr + 2, 0, true);
  view.setUint32(fdstatPtr + 4, 0, true);
  view.setBigUint64(fdstatPtr + 8, descriptor.rightsBase, true);
  view.setBigUint64(fdstatPtr + 16, descriptor.rightsInheriting, true);

  return WASI_ERRNO_SUCCESS;
}

function fdSeek(offsetPtr: number): void {
  const view = ensureDataView();
  view.setBigUint64(offsetPtr, 0n, true);
}

function getMonotonicTime(): bigint {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    const now = performance.now();
    const seconds = Math.floor(now / 1000);
    const nanos = Math.floor((now - seconds * 1000) * 1e6);
    return BigInt(seconds) * 1_000_000_000n + BigInt(nanos);
  }

  const nowMs = Date.now();
  return BigInt(nowMs) * 1_000_000n;
}

function clockTimeGet(timePtr: number): number {
  if (memoryContext.memory === null) {
    return WASI_ERRNO_INVAL;
  }

  const view = ensureDataView();
  view.setBigUint64(timePtr, getMonotonicTime(), true);
  return WASI_ERRNO_SUCCESS;
}

function fillRandom(bufferPtr: number, length: number): number {
  if (memoryContext.memory === null) {
    return WASI_ERRNO_INVAL;
  }

  const bytes = ensureUint8Array();
  const slice = bytes.subarray(bufferPtr, bufferPtr + length);

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(slice);
    return WASI_ERRNO_SUCCESS;
  }

  for (let index = 0; index < slice.length; index += 1) {
    slice[index] = Math.floor(Math.random() * 256);
  }

  return WASI_ERRNO_SUCCESS;
}

function writeUint32(ptr: number, value: number): void {
  const view = ensureDataView();
  view.setUint32(ptr, value, true);
}

export interface WasiBindings {
  readonly imports: WebAssembly.Imports;
  onInstance(instance: WebAssembly.Instance): void;
}

const defaultOptions: Required<WasiOptions> = {
  stdout: (text: string) => {
    if (text.length > 0) {
      console.log(text);
    }
  },
  stderr: (text: string) => {
    if (text.length > 0) {
      console.error(text);
    }
  },
};

export function createWasiPreview1(options: WasiOptions = {}): WasiBindings {
  const effectiveOptions: Required<WasiOptions> = {
    stdout: options.stdout ?? defaultOptions.stdout,
    stderr: options.stderr ?? defaultOptions.stderr,
  };

  const imports: WebAssembly.Imports = {
    wasi_snapshot_preview1: {
      args_get: (_argvPtr: number, _argvBufPtr: number): number => {
        void _argvPtr;
        void _argvBufPtr;
        if (memoryContext.memory === null) {
          return WASI_ERRNO_INVAL;
        }
        return WASI_ERRNO_SUCCESS;
      },
      args_sizes_get: (argcPtr: number, argvBufSizePtr: number): number => {
        if (memoryContext.memory === null) {
          return WASI_ERRNO_INVAL;
        }
        writeUint32(argcPtr, 0);
        writeUint32(argvBufSizePtr, 0);
        return WASI_ERRNO_SUCCESS;
      },
      clock_time_get: (_clockId: number, _precision: bigint | number, timePtr: number): number => clockTimeGet(timePtr),
      environ_get: (_environPtr: number, _environBufPtr: number): number => {
        void _environPtr;
        void _environBufPtr;
        if (memoryContext.memory === null) {
          return WASI_ERRNO_INVAL;
        }
        return WASI_ERRNO_SUCCESS;
      },
      environ_sizes_get: (countPtr: number, sizePtr: number): number => {
        if (memoryContext.memory === null) {
          return WASI_ERRNO_INVAL;
        }
        writeUint32(countPtr, 0);
        writeUint32(sizePtr, 0);
        return WASI_ERRNO_SUCCESS;
      },
      fd_close: (fd: number): number => {
        if (fd === STDIN_FD || fd === STDOUT_FD || fd === STDERR_FD) {
          return WASI_ERRNO_SUCCESS;
        }
        return WASI_ERRNO_BADF;
      },
      fd_fdstat_get: (fd: number, fdstatPtr: number): number => fdFdstatGet(fd, fdstatPtr),
      fd_prestat_dir_name: (): number => WASI_ERRNO_NOTSUP,
      fd_prestat_get: (): number => WASI_ERRNO_NOTSUP,
      fd_seek: (_fd: number, _offsetLow: number, _offsetHigh: number, _whence: number, newOffsetPtr: number): number => {
        if (memoryContext.memory === null) {
          return WASI_ERRNO_INVAL;
        }
        fdSeek(newOffsetPtr);
        return WASI_ERRNO_SUCCESS;
      },
      fd_write: (fd: number, iovs: number, iovsLen: number, nwrittenPtr: number): number =>
        fdWrite(fd, iovs, iovsLen, nwrittenPtr, effectiveOptions),
      proc_exit: (code: number): never => {
        throw new Error(`WASI proc_exit called with code ${code}`);
      },
      random_get: (bufferPtr: number, length: number): number => fillRandom(bufferPtr, length),
    },
  };

  return {
    imports,
    onInstance(instance: WebAssembly.Instance) {
      const exportMemory = instance.exports.memory;
      if (exportMemory instanceof WebAssembly.Memory) {
        updateMemory(exportMemory);
      } else {
        updateMemory(null);
      }
    },
  };
}

export type { WasiOptions };
