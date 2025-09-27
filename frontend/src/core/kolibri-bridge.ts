/**
 * kolibri-bridge.ts
 *
 * Lightweight placeholder that simulates asynchronous interaction with the
 * Kolibri C11/WASM core. The module exposes a consistent API so the UI can be
 * wired to the real bridge once the WebAssembly artefact is ready.
 */

export interface KolibriBridge {
  readonly ready: Promise<void>;
  ask(prompt: string, mode?: string): Promise<string>;
}

class MockKolibriBridge implements KolibriBridge {
  readonly ready: Promise<void>;

  constructor() {
    this.ready = Promise.resolve();
  }

  async ask(prompt: string, mode = "Быстрый ответ"): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return `Режим «${mode}»: я услышал — «${prompt}». Совсем скоро Kolibri C11/WASM вернёт здесь эволюционировавшую формулу ответа.`;
  }
}

const kolibriBridge: KolibriBridge = new MockKolibriBridge();

export default kolibriBridge;
