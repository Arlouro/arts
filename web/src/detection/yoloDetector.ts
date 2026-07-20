import * as ort from 'onnxruntime-web/wasm';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import ortMjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';

export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conf: number;
}

export interface LetterboxMeta {
  gain: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
}

export const INPUT_SIZE = 640;

export const CONF_THRESHOLD = 0.7;
export const IOU_THRESHOLD = 0.5;

export function intersectionOverUnion(a: Detection, b: Detection): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  if (inter <= 0) return 0;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}

export function nonMaxSuppression(dets: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.conf - a.conf);
  const kept: Detection[] = [];
  for (const det of sorted) {
    if (kept.every(k => intersectionOverUnion(k, det) < iouThreshold)) {
      kept.push(det);
    }
  }
  return kept;
}

export function decodeDetections(
  data: Float32Array,
  dims: readonly number[],
  meta: LetterboxMeta,
  confThreshold: number,
): Detection[] {
  const attrsFirst = dims[1] < dims[2];
  const numAttrs = attrsFirst ? dims[1] : dims[2];
  const numAnchors = attrsFirst ? dims[2] : dims[1];
  const numClasses = numAttrs - 4;

  const at = attrsFirst
    ? (attr: number, anchor: number) => data[attr * numAnchors + anchor]
    : (attr: number, anchor: number) => data[anchor * numAttrs + attr];

  const dets: Detection[] = [];
  for (let i = 0; i < numAnchors; i++) {
    let conf = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = at(4 + c, i);
      if (s > conf) conf = s;
    }
    if (conf < confThreshold) continue;

    const cx = at(0, i);
    const cy = at(1, i);
    const w = at(2, i);
    const h = at(3, i);

    const x1 = Math.min(Math.max((cx - w / 2 - meta.padX) / meta.gain, 0), meta.srcW);
    const y1 = Math.min(Math.max((cy - h / 2 - meta.padY) / meta.gain, 0), meta.srcH);
    const x2 = Math.min(Math.max((cx + w / 2 - meta.padX) / meta.gain, 0), meta.srcW);
    const y2 = Math.min(Math.max((cy + h / 2 - meta.padY) / meta.gain, 0), meta.srcH);
    if (x2 - x1 < 1 || y2 - y1 < 1) continue;

    dets.push({ x1, y1, x2, y2, conf });
  }
  return dets;
}

export function imageDataToTensor(image: ImageData): Float32Array {
  const { data, width, height } = image;
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = data[i * 4] / 255;
    out[plane + i] = data[i * 4 + 1] / 255;
    out[2 * plane + i] = data[i * 4 + 2] / 255;
  }
  return out;
}

export function letterboxMeta(srcW: number, srcH: number, inputSize = INPUT_SIZE): LetterboxMeta {
  const gain = Math.min(inputSize / srcW, inputSize / srcH);
  const padX = (inputSize - srcW * gain) / 2;
  const padY = (inputSize - srcH * gain) / 2;
  return { gain, padX, padY, srcW, srcH };
}

export class YoloDetector {
  private session: ort.InferenceSession | null = null;
  private loading: Promise<void> | null = null;
  private inputCanvas: HTMLCanvasElement | null = null;

  async load(modelUrl = '/models/best.onnx'): Promise<void> {
    if (this.session) return;
    if (!this.loading) {
      ort.env.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl };
      this.loading = ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
      }).then(session => {
        this.session = session;
      });
    }
    await this.loading;
  }

  get isReady(): boolean {
    return this.session !== null;
  }

  async detect(
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    confThreshold = CONF_THRESHOLD,
    iouThreshold = IOU_THRESHOLD,
  ): Promise<Detection[]> {
    await this.load();
    const session = this.session!;

    if (!this.inputCanvas) {
      this.inputCanvas = document.createElement('canvas');
      this.inputCanvas.width = INPUT_SIZE;
      this.inputCanvas.height = INPUT_SIZE;
    }
    const ctx = this.inputCanvas.getContext('2d', { willReadFrequently: true })!;
    const meta = letterboxMeta(srcW, srcH);

    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(source, meta.padX, meta.padY, srcW * meta.gain, srcH * meta.gain);

    const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const tensor = new ort.Tensor('float32', imageDataToTensor(imageData), [1, 3, INPUT_SIZE, INPUT_SIZE]);

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const results = await session.run({ [inputName]: tensor });
    const output = results[outputName];

    const raw = decodeDetections(output.data as Float32Array, output.dims, meta, confThreshold);
    return nonMaxSuppression(raw, iouThreshold);
  }
}
