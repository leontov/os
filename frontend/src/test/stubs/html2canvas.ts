const createMockCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(0,0,0,0)";
    context.fillRect(0, 0, 1, 1);
  }
  return canvas;
};

const html2canvas = async (_element?: HTMLElement | null): Promise<HTMLCanvasElement> => {
  return createMockCanvas();
};

export default html2canvas;
