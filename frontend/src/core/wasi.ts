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
}
