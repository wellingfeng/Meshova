import { makeTexture, type TextureBuffer } from "./buffer.js";

export type TextureComputeExpression =
  | { readonly op: "input"; readonly index: number }
  | { readonly op: "constant"; readonly value: number }
  | { readonly op: "add" | "subtract" | "multiply" | "divide" | "min" | "max"; readonly left: TextureComputeExpression; readonly right: TextureComputeExpression }
  | { readonly op: "clamp"; readonly value: TextureComputeExpression; readonly min: number; readonly max: number }
  | { readonly op: "mix"; readonly left: TextureComputeExpression; readonly right: TextureComputeExpression; readonly amount: TextureComputeExpression };

export interface CompiledTextureCompute {
  readonly inputCount: number;
  readonly wgsl: string;
  runCpu(inputs: readonly TextureBuffer[]): TextureBuffer;
}

export type TextureComputeBackend = "auto" | "cpu" | "webgpu";

export interface TextureComputeOptions {
  backend?: TextureComputeBackend;
  device?: WebGpuDeviceLike;
}

export interface TextureComputeResult {
  readonly texture: TextureBuffer;
  readonly backend: "cpu" | "webgpu";
  readonly wgsl: string;
}

export interface WebGpuBufferLike {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy?(): void;
}

export interface WebGpuComputePipelineLike {
  getBindGroupLayout(index: number): unknown;
}

export interface WebGpuComputePassLike {
  setPipeline(pipeline: WebGpuComputePipelineLike): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(count: number): void;
  end(): void;
}

export interface WebGpuCommandEncoderLike {
  beginComputePass(): WebGpuComputePassLike;
  copyBufferToBuffer(source: WebGpuBufferLike, sourceOffset: number, destination: WebGpuBufferLike, destinationOffset: number, size: number): void;
  finish(): unknown;
}

export interface WebGpuDeviceLike {
  readonly queue: {
    writeBuffer(buffer: WebGpuBufferLike, offset: number, data: ArrayBufferView): void;
    submit(commands: readonly unknown[]): void;
  };
  createBuffer(descriptor: Readonly<Record<string, unknown>>): WebGpuBufferLike;
  createShaderModule(descriptor: Readonly<Record<string, unknown>>): unknown;
  createComputePipeline(descriptor: Readonly<Record<string, unknown>>): WebGpuComputePipelineLike;
  createBindGroup(descriptor: Readonly<Record<string, unknown>>): unknown;
  createCommandEncoder(): WebGpuCommandEncoderLike;
}

export function compileTextureCompute(
  expression: TextureComputeExpression,
  inputCount: number,
): CompiledTextureCompute {
  const count = Math.max(0, Math.floor(inputCount));
  validateExpression(expression, count);
  const bindings = Array.from({ length: count }, (_, index) => (
    `@group(0) @binding(${index}) var<storage, read> input${index}: array<f32>;`
  ));
  const outputBinding = count;
  const wgsl = `${bindings.join("\n")}
@group(0) @binding(${outputBinding}) var<storage, read_write> outputData: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= arrayLength(&outputData)) { return; }
  outputData[index] = ${expressionToWgsl(expression)};
}`;
  return {
    inputCount: count,
    wgsl,
    runCpu(inputs) {
      const shape = validateInputs(inputs, count);
      const output = makeTexture(shape.width, shape.height, 1);
      for (let index = 0; index < output.data.length; index++) {
        output.data[index] = evaluateExpression(expression, inputs, index);
      }
      return output;
    },
  };
}

export async function executeTextureCompute(
  expression: TextureComputeExpression,
  inputs: readonly TextureBuffer[],
  options: TextureComputeOptions = {},
): Promise<TextureComputeResult> {
  const compiled = compileTextureCompute(expression, inputs.length);
  const backend = options.backend ?? "auto";
  if (backend === "webgpu" && !options.device) {
    throw new Error("WebGPU backend requires a device");
  }
  if (options.device && backend !== "cpu") {
    const texture = await runWebGpu(compiled, inputs, options.device);
    return { texture, backend: "webgpu", wgsl: compiled.wgsl };
  }
  return { texture: compiled.runCpu(inputs), backend: "cpu", wgsl: compiled.wgsl };
}

async function runWebGpu(
  compiled: CompiledTextureCompute,
  inputs: readonly TextureBuffer[],
  device: WebGpuDeviceLike,
): Promise<TextureBuffer> {
  const shape = validateInputs(inputs, compiled.inputCount);
  const byteLength = shape.width * shape.height * Float32Array.BYTES_PER_ELEMENT;
  const inputBuffers = inputs.map((input) => {
    const buffer = device.createBuffer({ size: byteLength, usage: 136 });
    device.queue.writeBuffer(buffer, 0, input.data);
    return buffer;
  });
  const outputBuffer = device.createBuffer({ size: byteLength, usage: 132 });
  const readBuffer = device.createBuffer({ size: byteLength, usage: 9 });
  const module = device.createShaderModule({ code: compiled.wgsl });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const entries = [
    ...inputBuffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    { binding: inputs.length, resource: { buffer: outputBuffer } },
  ];
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil((shape.width * shape.height) / 64));
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, byteLength);
  device.queue.submit([encoder.finish()]);
  await readBuffer.mapAsync(1);
  const mapped = readBuffer.getMappedRange();
  const values = new Float32Array(mapped.slice(0));
  readBuffer.unmap();
  const texture = makeTexture(shape.width, shape.height, 1);
  texture.data.set(values);
  for (const buffer of [...inputBuffers, outputBuffer, readBuffer]) buffer.destroy?.();
  return texture;
}

function validateInputs(
  inputs: readonly TextureBuffer[],
  inputCount: number,
): { width: number; height: number } {
  if (inputs.length !== inputCount) throw new Error(`compute expected ${inputCount} inputs, received ${inputs.length}`);
  if (inputs.length === 0) throw new Error("texture compute requires at least one input");
  const first = inputs[0]!;
  if (first.channels !== 1) throw new Error("texture compute inputs must be single-channel");
  for (const input of inputs) {
    if (input.width !== first.width || input.height !== first.height || input.channels !== 1) {
      throw new Error("texture compute inputs must share dimensions and be single-channel");
    }
  }
  return { width: first.width, height: first.height };
}

function validateExpression(expression: TextureComputeExpression, inputCount: number): void {
  if (expression.op === "input") {
    if (!Number.isInteger(expression.index) || expression.index < 0 || expression.index >= inputCount) {
      throw new Error(`compute input index out of range: ${expression.index}`);
    }
    return;
  }
  if (expression.op === "constant") return;
  if (expression.op === "clamp") {
    if (expression.max < expression.min) throw new Error("compute clamp max must be >= min");
    validateExpression(expression.value, inputCount);
    return;
  }
  validateExpression(expression.left, inputCount);
  validateExpression(expression.right, inputCount);
  if (expression.op === "mix") validateExpression(expression.amount, inputCount);
}

function evaluateExpression(
  expression: TextureComputeExpression,
  inputs: readonly TextureBuffer[],
  pixel: number,
): number {
  if (expression.op === "input") return inputs[expression.index]!.data[pixel]!;
  if (expression.op === "constant") return expression.value;
  if (expression.op === "clamp") {
    return Math.max(expression.min, Math.min(expression.max, evaluateExpression(expression.value, inputs, pixel)));
  }
  if (expression.op === "mix") {
    const left = evaluateExpression(expression.left, inputs, pixel);
    const right = evaluateExpression(expression.right, inputs, pixel);
    const amount = evaluateExpression(expression.amount, inputs, pixel);
    return left + (right - left) * amount;
  }
  const left = evaluateExpression(expression.left, inputs, pixel);
  const right = evaluateExpression(expression.right, inputs, pixel);
  if (expression.op === "add") return left + right;
  if (expression.op === "subtract") return left - right;
  if (expression.op === "multiply") return left * right;
  if (expression.op === "divide") return Math.abs(right) < 1e-12 ? 0 : left / right;
  if (expression.op === "min") return Math.min(left, right);
  if (expression.op === "max") return Math.max(left, right);
  return Math.max(left, right);
}

function expressionToWgsl(expression: TextureComputeExpression): string {
  if (expression.op === "input") return `input${expression.index}[index]`;
  if (expression.op === "constant") return floatLiteral(expression.value);
  if (expression.op === "clamp") {
    return `clamp(${expressionToWgsl(expression.value)}, ${floatLiteral(expression.min)}, ${floatLiteral(expression.max)})`;
  }
  if (expression.op === "mix") {
    return `mix(${expressionToWgsl(expression.left)}, ${expressionToWgsl(expression.right)}, ${expressionToWgsl(expression.amount)})`;
  }
  const left = expressionToWgsl(expression.left);
  const right = expressionToWgsl(expression.right);
  if (expression.op === "add") return `(${left} + ${right})`;
  if (expression.op === "subtract") return `(${left} - ${right})`;
  if (expression.op === "multiply") return `(${left} * ${right})`;
  if (expression.op === "divide") return `select(${left} / ${right}, 0.0, abs(${right}) < 0.000000000001)`;
  if (expression.op === "min") return `min(${left}, ${right})`;
  if (expression.op === "max") return `max(${left}, ${right})`;
  return `max(${left}, ${right})`;
}

function floatLiteral(value: number): string {
  if (!Number.isFinite(value)) throw new Error("compute constants must be finite");
  return Number.isInteger(value) ? `${value}.0` : value.toString();
}
