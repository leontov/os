const WASI_ERRNO_SUCCESS = 0;
const WASI_ERRNO_BADF = 8;
const WASI_ERRNO_INVAL = 28;

const WASI_FILETYPE_CHARACTER_DEVICE = 2;

const STDIN_FD = 0;
const STDOUT_FD = 1;
const STDERR_FD = 2;

let memory: WebAssembly.Memory | null = null;
let cachedDataView: DataView | null = null;
let cachedUint8: Uint8Array | null = null;

const textDecoder = new TextDecoder("utf-8");

function getUint8Memory(): Uint8Array {
  if (!memory) {
    throw new Error("WASI memory is not initialised.");
  }

  if (!cachedUint8 || cachedUint8.buffer !== memory.buffer) {
    cachedUint8 = new Uint8Array(memory.buffer);
  }

  return cachedUint8;
}

function ensureDataView(): DataView {
  if (!memory) {
    throw new Error("WASI memory is not initialised.");
  }

  if (!cachedDataView || cachedDataView.buffer !== memory.buffer) {
    cachedDataView = new DataView(memory.buffer);
  }

  return cachedDataView;
}

function isStdio(fd: number): boolean {
  return fd === STDIN_FD || fd === STDOUT_FD || fd === STDERR_FD;
}

export function setWasiMemory(newMemory: WebAssembly.Memory | null): void {
  memory = newMemory;
  cachedDataView = null;
  cachedUint8 = null;
}

export function environ_sizes_get(environCountPtr: number, environSizePtr: number): number {
  const view = ensureDataView();
  view.setUint32(environCountPtr, 0, true);
  view.setUint32(environSizePtr, 0, true);
  return WASI_ERRNO_SUCCESS;
}

export function environ_get(_environPtr: number, _environBufPtr: number): number {
  return WASI_ERRNO_SUCCESS;
}

export function args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
  const view = ensureDataView();
  view.setUint32(argcPtr, 0, true);
  view.setUint32(argvBufSizePtr, 0, true);
  return WASI_ERRNO_SUCCESS;
}

export function args_get(_argvPtr: number, _argvBufPtr: number): number {
  return WASI_ERRNO_SUCCESS;
}

export function fd_write(fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
  if (!memory) {
    return WASI_ERRNO_INVAL;
  }

  if (fd === STDIN_FD) {
    return WASI_ERRNO_BADF;
  }

  if (!isStdio(fd)) {
    return WASI_ERRNO_BADF;
  }

  const view = ensureDataView();
  const memoryBuffer = getUint8Memory();

  let offset = iovsPtr;
  let written = 0;
  let message = "";

  for (let i = 0; i < iovsLen; i += 1) {
    const base = view.getUint32(offset, true);
    const length = view.getUint32(offset + 4, true);
    offset += 8;

    const chunk = memoryBuffer.subarray(base, base + length);
    message += textDecoder.decode(chunk, { stream: true });
    written += length;
  }

  message += textDecoder.decode();

  if (fd === STDOUT_FD) {
    console.log(message);
  } else {
    console.error(message);
  }

  view.setUint32(nwrittenPtr, written, true);
  return WASI_ERRNO_SUCCESS;
}

export function fd_fdstat_get(fd: number, statPtr: number): number {
  if (!memory) {
    return WASI_ERRNO_INVAL;
  }

  if (!isStdio(fd)) {
    return WASI_ERRNO_BADF;
  }

  const view = ensureDataView();

  view.setUint8(statPtr, WASI_FILETYPE_CHARACTER_DEVICE);
  view.setUint8(statPtr + 1, 0);
  view.setUint16(statPtr + 2, 0, true);
  view.setUint32(statPtr + 4, 0, true);
  view.setBigUint64(statPtr + 8, 0n, true);
  view.setBigUint64(statPtr + 16, 0n, true);

  return WASI_ERRNO_SUCCESS;
}

export function fd_close(fd: number): number {
  if (!isStdio(fd)) {
    return WASI_ERRNO_BADF;
  }
  return WASI_ERRNO_SUCCESS;
}

export function proc_exit(code: number): never {
  throw new Error(`WASI exited with code ${code}`);
}

export function clock_time_get(_clockId: number, _precision: number, timePtr: number): number {
  const view = ensureDataView();
  const now = BigInt(Date.now()) * 1_000_000n;
  view.setBigUint64(timePtr, now, true);
  return WASI_ERRNO_SUCCESS;
}

export function random_get(bufferPtr: number, bufferLen: number): number {
  if (!memory) {
    return WASI_ERRNO_INVAL;
  }

  const memoryBuffer = getUint8Memory();
  const target = memoryBuffer.subarray(bufferPtr, bufferPtr + bufferLen);

  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(target);
  } else {
    for (let i = 0; i < target.length; i += 1) {
      target[i] = Math.floor(Math.random() * 256);
    }
  }

  return WASI_ERRNO_SUCCESS;
}

export const wasiImports = {
  wasi_snapshot_preview1: {
    args_get,
    args_sizes_get,
    clock_time_get,
    environ_get,
    environ_sizes_get,
    fd_close,
    fd_fdstat_get,
    fd_write,
    proc_exit,
    random_get,
  },
};
