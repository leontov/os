const WASI_PAGE_SIZE = 65536;

export const WASI_ERRNO_SUCCESS = 0;
export const WASI_ERRNO_INVAL = 28;
export const WASI_ERRNO_BADF = 8;
export const WASI_ERRNO_IO = 29;

const WASI_FILETYPE_CHARACTER_DEVICE = 2;
const textDecoder = new TextDecoder("utf-8");

let memory: WebAssembly.Memory | null = null;
let cachedView: DataView | null = null;

function getDataView(): DataView {
  if (!memory) {
    throw new Error("WASI memory is not initialised");
  }

  if (!cachedView || cachedView.buffer !== memory.buffer) {
    cachedView = new DataView(memory.buffer);
  }

  return cachedView;
}

function writeUint64(view: DataView, ptr: number, value: number) {
  view.setUint32(ptr, value >>> 0, true);
  view.setUint32(ptr + 4, Math.floor(value / 2 ** 32) >>> 0, true);
}

export const wasiSnapshotPreview1 = {
  args_get(): number {
    return WASI_ERRNO_SUCCESS;
  },
  args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
    if (!memory) {
      return WASI_ERRNO_INVAL;
    }
    const view = getDataView();
    view.setUint32(argcPtr, 0, true);
    view.setUint32(argvBufSizePtr, 0, true);
    return WASI_ERRNO_SUCCESS;
  },
  environ_get(): number {
    return WASI_ERRNO_SUCCESS;
  },
  environ_sizes_get(environCountPtr: number, environBufSizePtr: number): number {
    if (!memory) {
      return WASI_ERRNO_INVAL;
    }
    const view = getDataView();
    view.setUint32(environCountPtr, 0, true);
    view.setUint32(environBufSizePtr, 0, true);
    return WASI_ERRNO_SUCCESS;
  },
  fd_close(): number {
    return WASI_ERRNO_SUCCESS;
  },
  fd_fdstat_get(_fd: number, statPtr: number): number {
    if (!memory) {
      return WASI_ERRNO_INVAL;
    }

    const view = getDataView();
    for (let offset = 0; offset < 24; offset += 1) {
      view.setUint8(statPtr + offset, 0);
    }

    view.setUint8(statPtr, WASI_FILETYPE_CHARACTER_DEVICE);

    return WASI_ERRNO_SUCCESS;
  },
  fd_seek(): number {
    return WASI_ERRNO_IO;
  },
  fd_write(fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
    if (!memory) {
      return WASI_ERRNO_INVAL;
    }

    const view = getDataView();
    let bytesWritten = 0;

    for (let i = 0; i < iovsLen; i += 1) {
      const ptr = view.getUint32(iovsPtr + i * 8, true);
      const len = view.getUint32(iovsPtr + i * 8 + 4, true);
      bytesWritten += len;

      if (fd === 1 || fd === 2) {
        const bytes = new Uint8Array(memory.buffer, ptr, len);
        const text = textDecoder.decode(bytes);
        if (fd === 1) {
          console.log(text);
        } else {
          console.error(text);
        }
      }
    }

    writeUint64(view, nwrittenPtr, bytesWritten);
    return WASI_ERRNO_SUCCESS;
  },
  proc_exit(status: number): never {
    throw new Error(`WASI program exited with code ${status}`);
  },
  random_get(ptr: number, len: number): number {
    if (!memory) {
      return WASI_ERRNO_INVAL;
    }
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    crypto.getRandomValues(bytes);
    return WASI_ERRNO_SUCCESS;
  },
};

export function setMemory(wasmMemory: WebAssembly.Memory): void {
  memory = wasmMemory;
  cachedView = new DataView(wasmMemory.buffer);
}

export function getWasiImports(): Record<string, Record<string, WebAssembly.ImportValue>> {
  return {
    wasi_snapshot_preview1: wasiSnapshotPreview1,
  };
}

export function resetWasi(): void {
  memory = null;
  cachedView = null;
}

export function memorySize(): number {
  return memory ? memory.buffer.byteLength / WASI_PAGE_SIZE : 0;
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
const WASI_ERRNO_SUCCESS = 0;
const WASI_ERRNO_BADF = 8;
const WASI_ERRNO_INVAL = 28;
const WASI_FILETYPE_CHARACTER_DEVICE = 2;

const FDSTAT_SIZE = 24;


interface WasiContext {
  imports: Record<string, WebAssembly.ImportValue>;
  setMemory(memory: WebAssembly.Memory): void;
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
function getRandomBytes(buffer: Uint8Array): void {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(buffer);
    return;
  }
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = Math.floor(Math.random() * 256);
  }
}

export function createWasiContext(onStdout?: (text: string) => void): WasiContext {
  let memory: WebAssembly.Memory | null = null;

  let memoryView: DataView | null = null;

  const ensureView = (): DataView => {
    if (!memoryView) {
      throw new Error("WASI memory не инициализирована");
    }
    return memoryView;

  };

  const readBytes = (ptr: number, length: number): Uint8Array => {
    if (!memory) {
      throw new Error("WASI memory не инициализирована");
    }
    return new Uint8Array(memory.buffer, ptr, length);
  };

  const writeU32 = (ptr: number, value: number): void => {

    if (!memoryView) {
      return;
    }
    memoryView.setUint32(ptr, value >>> 0, true);
  };

  const writeU64 = (ptr: number, value: bigint): void => {
    if (!memoryView) {
      return;
    }
    memoryView.setBigUint64(ptr, value, true);

  };

  const imports: Record<string, WebAssembly.ImportValue> = {
    fd_close: (fd: number): number => {
      void fd;
      return WASI_ERRNO_SUCCESS;
    },
    fd_fdstat_get: (fd: number, statPtr: number): number => {
      if (fd < 0) {
        return WASI_ERRNO_BADF;
      }

      if (!memory || !memoryView) {
        return WASI_ERRNO_INVAL;
      }
      const view = memoryView;
      const buffer = new Uint8Array(memory.buffer, statPtr, FDSTAT_SIZE);
      buffer.fill(0);

      view.setUint8(statPtr, WASI_FILETYPE_CHARACTER_DEVICE);
      view.setUint16(statPtr + 2, 0, true);
      view.setBigUint64(statPtr + 8, 0n, true);
      view.setBigUint64(statPtr + 16, 0n, true);
      return WASI_ERRNO_SUCCESS;
    },
    fd_seek: (
      fd: number,
      offset: number | bigint,
      whence: number,
      resultPtr: number,
    ): number => {
      void fd;
      void offset;
      void whence;
      writeU64(resultPtr, 0n);
      return WASI_ERRNO_SUCCESS;
    },
    fd_write: (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number => {

      if (!memory || !memoryView) {
        return WASI_ERRNO_INVAL;
      }
      const view = ensureView();

      let bytesWritten = 0;
      let aggregated = "";
      for (let index = 0; index < iovsLen; index += 1) {
        const ptr = view.getUint32(iovsPtr + index * 8, true);
        const len = view.getUint32(iovsPtr + index * 8 + 4, true);
        if (len === 0) {
          continue;
        }
        bytesWritten += len;
        if (fd === 1 || fd === 2) {
          const chunk = readBytes(ptr, len);
          aggregated += textDecoder.decode(chunk);
        }
      }
      writeU32(nwrittenPtr, bytesWritten);
      if (aggregated && onStdout) {
        onStdout(aggregated);
      }
      return WASI_ERRNO_SUCCESS;
    },
    environ_sizes_get: (countPtr: number, sizePtr: number): number => {
      writeU32(countPtr, 0);
      writeU32(sizePtr, 0);
      return WASI_ERRNO_SUCCESS;
    },
    environ_get: (): number => WASI_ERRNO_SUCCESS,
    args_sizes_get: (countPtr: number, sizePtr: number): number => {
      writeU32(countPtr, 0);
      writeU32(sizePtr, 0);
      return WASI_ERRNO_SUCCESS;
    },
    args_get: (): number => WASI_ERRNO_SUCCESS,
    clock_time_get: (
      clockId: number,
      precision: number | bigint,
      timePtr: number,
    ): number => {
      void clockId;
      void precision;
      const now = BigInt(Date.now()) * 1_000_000n;
      writeU64(timePtr, now);
      return WASI_ERRNO_SUCCESS;
    },
    random_get: (ptr: number, len: number): number => {
      if (!memory) {
        return WASI_ERRNO_INVAL;
      }

      const buffer = new Uint8Array(memory.buffer, ptr, len);

      getRandomBytes(buffer);
      return WASI_ERRNO_SUCCESS;
    },
    proc_exit: (code: number): number => {
      throw new Error(`WASM завершил выполнение с кодом ${code}`);
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
    setMemory(newMemory: WebAssembly.Memory): void {
      memory = newMemory;
      memoryView = new DataView(newMemory.buffer);

    },
  };
}
