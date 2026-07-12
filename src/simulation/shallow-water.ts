export interface ShallowWaterOptions {
  width: number;
  height: number;
  cellSize?: number;
  gravity?: number;
  friction?: number;
  minDepth?: number;
  cfl?: number;
}

export interface ShallowWaterSource {
  x: number;
  y: number;
  radius: number;
  rate: number;
}

const EPSILON = 1e-8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class ShallowWaterGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  gravity: number;
  friction: number;
  minDepth: number;
  cfl: number;

  readonly bed: Float32Array;
  readonly depth: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly foam: Float32Array;

  private readonly nextDepth: Float32Array;
  private readonly nextVelocityX: Float32Array;
  private readonly nextVelocityY: Float32Array;
  private readonly nextFoam: Float32Array;
  private readonly fluxX: Float32Array;
  private readonly fluxY: Float32Array;
  private readonly faceVelocityX: Float32Array;
  private readonly faceVelocityY: Float32Array;
  private readonly outflowScale: Float32Array;

  constructor(options: ShallowWaterOptions) {
    if (!Number.isInteger(options.width) || options.width < 3) {
      throw new Error("ShallowWaterGrid width must be an integer >= 3");
    }
    if (!Number.isInteger(options.height) || options.height < 3) {
      throw new Error("ShallowWaterGrid height must be an integer >= 3");
    }
    this.width = options.width;
    this.height = options.height;
    this.cellSize = options.cellSize ?? 1;
    this.gravity = options.gravity ?? 9.81;
    this.friction = options.friction ?? 0.18;
    this.minDepth = options.minDepth ?? 0.001;
    this.cfl = options.cfl ?? 0.45;
    if (!(this.cellSize > 0)) throw new Error("ShallowWaterGrid cellSize must be > 0");

    const count = this.width * this.height;
    this.bed = new Float32Array(count);
    this.depth = new Float32Array(count);
    this.velocityX = new Float32Array(count);
    this.velocityY = new Float32Array(count);
    this.foam = new Float32Array(count);
    this.nextDepth = new Float32Array(count);
    this.nextVelocityX = new Float32Array(count);
    this.nextVelocityY = new Float32Array(count);
    this.nextFoam = new Float32Array(count);
    this.fluxX = new Float32Array((this.width + 1) * this.height);
    this.fluxY = new Float32Array(this.width * (this.height + 1));
    this.faceVelocityX = new Float32Array((this.width + 1) * this.height);
    this.faceVelocityY = new Float32Array(this.width * (this.height + 1));
    this.outflowScale = new Float32Array(count);
  }

  setBed(values: ArrayLike<number> | ((x: number, y: number) => number)): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = this.index(x, y);
        const value = typeof values === "function" ? values(x, y) : values[index];
        if (value === undefined || !Number.isFinite(value)) {
          throw new Error(`Invalid bed height at (${x}, ${y})`);
        }
        this.bed[index] = value;
      }
    }
  }

  clearWater(): void {
    this.depth.fill(0);
    this.velocityX.fill(0);
    this.velocityY.fill(0);
    this.foam.fill(0);
  }

  fillToSurface(level: number, predicate?: (x: number, y: number) => boolean): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = this.index(x, y);
        this.depth[index] = !predicate || predicate(x, y)
          ? Math.max(0, level - this.bed[index]!)
          : 0;
      }
    }
  }

  inject(source: ShallowWaterSource, deltaTime: number): void {
    if (!(source.radius > 0) || !(source.rate > 0) || !(deltaTime > 0)) return;
    const minX = Math.max(1, Math.floor(source.x - source.radius));
    const maxX = Math.min(this.width - 2, Math.ceil(source.x + source.radius));
    const minY = Math.max(1, Math.floor(source.y - source.radius));
    const maxY = Math.min(this.height - 2, Math.ceil(source.y + source.radius));
    const radiusSquared = source.radius * source.radius;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - source.x;
        const dy = y - source.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= radiusSquared) continue;
        const falloff = 1 - Math.sqrt(distanceSquared) / source.radius;
        this.depth[this.index(x, y)]! += source.rate * deltaTime * falloff;
      }
    }
  }

  step(deltaTime: number, sources: readonly ShallowWaterSource[] = []): void {
    if (!(deltaTime > 0) || !Number.isFinite(deltaTime)) return;
    const stableDelta = this.stableDeltaTime();
    const substeps = clamp(Math.ceil(deltaTime / stableDelta), 1, 16);
    const stepDelta = deltaTime / substeps;
    for (let step = 0; step < substeps; step++) {
      this.advectAndAccelerate(stepDelta);
      this.updateConservativeDepth(stepDelta);
      for (const source of sources) this.inject(source, stepDelta);
      this.applyBoundary();
    }
  }

  totalVolume(): number {
    let depthSum = 0;
    for (const value of this.depth) depthSum += value;
    return depthSum * this.cellSize * this.cellSize;
  }

  maxWaterDepth(): number {
    let maximum = 0;
    for (const value of this.depth) maximum = Math.max(maximum, value);
    return maximum;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  private stableDeltaTime(): number {
    let maximumSpeed = 0;
    let maximumDepth = 0;
    for (let index = 0; index < this.depth.length; index++) {
      maximumDepth = Math.max(maximumDepth, this.depth[index]!);
      maximumSpeed = Math.max(
        maximumSpeed,
        Math.hypot(this.velocityX[index]!, this.velocityY[index]!),
      );
    }
    const waveSpeed = Math.sqrt(this.gravity * maximumDepth);
    return this.cfl * this.cellSize / Math.max(maximumSpeed + waveSpeed, EPSILON);
  }

  private sample(field: Float32Array, x: number, y: number): number {
    const clampedX = clamp(x, 0, this.width - 1);
    const clampedY = clamp(y, 0, this.height - 1);
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(x0 + 1, this.width - 1);
    const y1 = Math.min(y0 + 1, this.height - 1);
    const tx = clampedX - x0;
    const ty = clampedY - y0;
    const top = field[this.index(x0, y0)]! * (1 - tx) + field[this.index(x1, y0)]! * tx;
    const bottom = field[this.index(x0, y1)]! * (1 - tx) + field[this.index(x1, y1)]! * tx;
    return top * (1 - ty) + bottom * ty;
  }

  private advectAndAccelerate(deltaTime: number): void {
    const inverseCellSize = 1 / this.cellSize;
    const damping = Math.exp(-this.friction * deltaTime);
    const maxSpeed = this.cfl * this.cellSize / deltaTime;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = this.index(x, y);
        const depth = this.depth[index]!;
        if (depth <= this.minDepth || x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1) {
          this.nextVelocityX[index] = 0;
          this.nextVelocityY[index] = 0;
          continue;
        }

        const departureX = x - this.velocityX[index]! * deltaTime * inverseCellSize;
        const departureY = y - this.velocityY[index]! * deltaTime * inverseCellSize;
        let velocityX = this.sample(this.velocityX, departureX, departureY) * damping;
        let velocityY = this.sample(this.velocityY, departureX, departureY) * damping;
        const speed = Math.hypot(velocityX, velocityY);
        const speedScale = speed > maxSpeed ? maxSpeed / speed : 1;
        this.nextVelocityX[index] = velocityX * speedScale;
        this.nextVelocityY[index] = velocityY * speedScale;
      }
    }

    this.velocityX.set(this.nextVelocityX);
    this.velocityY.set(this.nextVelocityY);
  }

  private updateConservativeDepth(deltaTime: number): void {
    this.fluxX.fill(0);
    this.fluxY.fill(0);
    this.faceVelocityX.fill(0);
    this.faceVelocityY.fill(0);
    this.nextDepth.set(this.depth);
    this.nextFoam.set(this.foam);
    const width = this.width;
    const height = this.height;
    const inverseCellSize = 1 / this.cellSize;
    const maxFaceSpeed = this.cfl * this.cellSize / deltaTime;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width; x++) {
        const leftIndex = this.index(x - 1, y);
        const rightIndex = this.index(x, y);
        const leftSurface = this.bed[leftIndex]! + this.depth[leftIndex]!;
        const rightSurface = this.bed[rightIndex]! + this.depth[rightIndex]!;
        const advectedVelocity = (this.velocityX[leftIndex]! + this.velocityX[rightIndex]!) * 0.5;
        const velocity = clamp(
          advectedVelocity - this.gravity * (rightSurface - leftSurface) * deltaTime * inverseCellSize,
          -maxFaceSpeed,
          maxFaceSpeed,
        );
        const donorIndex = velocity >= 0 ? leftIndex : rightIndex;
        const receiverIndex = velocity >= 0 ? rightIndex : leftIndex;
        const donorSurface = this.bed[donorIndex]! + this.depth[donorIndex]!;
        if (donorSurface <= this.bed[receiverIndex]! + this.minDepth) continue;
        this.faceVelocityX[y * (width + 1) + x] = velocity;
        this.fluxX[y * (width + 1) + x] = this.depth[donorIndex]! * velocity;
      }
    }

    for (let y = 1; y < height; y++) {
      for (let x = 1; x < width - 1; x++) {
        const bottomIndex = this.index(x, y - 1);
        const topIndex = this.index(x, y);
        const bottomSurface = this.bed[bottomIndex]! + this.depth[bottomIndex]!;
        const topSurface = this.bed[topIndex]! + this.depth[topIndex]!;
        const advectedVelocity = (this.velocityY[bottomIndex]! + this.velocityY[topIndex]!) * 0.5;
        const velocity = clamp(
          advectedVelocity - this.gravity * (topSurface - bottomSurface) * deltaTime * inverseCellSize,
          -maxFaceSpeed,
          maxFaceSpeed,
        );
        const donorIndex = velocity >= 0 ? bottomIndex : topIndex;
        const receiverIndex = velocity >= 0 ? topIndex : bottomIndex;
        const donorSurface = this.bed[donorIndex]! + this.depth[donorIndex]!;
        if (donorSurface <= this.bed[receiverIndex]! + this.minDepth) continue;
        this.faceVelocityY[y * width + x] = velocity;
        this.fluxY[y * width + x] = this.depth[donorIndex]! * velocity;
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = this.index(x, y);
        const left = this.fluxX[y * (width + 1) + x]!;
        const right = this.fluxX[y * (width + 1) + x + 1]!;
        const bottom = this.fluxY[y * width + x]!;
        const top = this.fluxY[(y + 1) * width + x]!;
        const outflow = Math.max(0, right) + Math.max(0, -left) + Math.max(0, top) + Math.max(0, -bottom);
        const availableRate = this.depth[index]! * this.cellSize / deltaTime;
        this.outflowScale[index] = outflow > availableRate ? availableRate / outflow : 1;
      }
    }

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width; x++) {
        const fluxIndex = y * (width + 1) + x;
        const flux = this.fluxX[fluxIndex]!;
        this.fluxX[fluxIndex] = flux * this.outflowScale[this.index(flux >= 0 ? x - 1 : x, y)]!;
      }
    }
    for (let y = 1; y < height; y++) {
      for (let x = 1; x < width - 1; x++) {
        const fluxIndex = y * width + x;
        const flux = this.fluxY[fluxIndex]!;
        this.fluxY[fluxIndex] = flux * this.outflowScale[this.index(x, flux >= 0 ? y - 1 : y)]!;
      }
    }

    const fluxScale = deltaTime / this.cellSize;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = this.index(x, y);
        const left = this.fluxX[y * (width + 1) + x]!;
        const right = this.fluxX[y * (width + 1) + x + 1]!;
        const bottom = this.fluxY[y * width + x]!;
        const top = this.fluxY[(y + 1) * width + x]!;
        const divergence = (right - left + top - bottom) / this.cellSize;
        const nextDepth = Math.max(0, this.depth[index]! - fluxScale * (right - left + top - bottom));
        const speed = Math.hypot(this.velocityX[index]!, this.velocityY[index]!);
        const foamGain = Math.max(0, Math.abs(divergence) * 0.14 + speed * 0.025 - 0.035);
        this.nextDepth[index] = nextDepth;
        this.nextFoam[index] = clamp(this.foam[index]! * Math.exp(-0.85 * deltaTime) + foamGain * deltaTime, 0, 1);
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = this.index(x, y);
        if (this.nextDepth[index]! <= this.minDepth || x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          this.nextVelocityX[index] = 0;
          this.nextVelocityY[index] = 0;
          continue;
        }
        this.nextVelocityX[index] = (
          this.faceVelocityX[y * (width + 1) + x]! +
          this.faceVelocityX[y * (width + 1) + x + 1]!
        ) * 0.5;
        this.nextVelocityY[index] = (
          this.faceVelocityY[y * width + x]! +
          this.faceVelocityY[(y + 1) * width + x]!
        ) * 0.5;
      }
    }

    this.depth.set(this.nextDepth);
    this.foam.set(this.nextFoam);
    this.velocityX.set(this.nextVelocityX);
    this.velocityY.set(this.nextVelocityY);
  }

  private applyBoundary(): void {
    const width = this.width;
    const height = this.height;
    for (let x = 0; x < width; x++) {
      const bottom = this.index(x, 0);
      const top = this.index(x, height - 1);
      this.velocityY[bottom] = 0;
      this.velocityY[top] = 0;
    }
    for (let y = 0; y < height; y++) {
      const left = this.index(0, y);
      const right = this.index(width - 1, y);
      this.velocityX[left] = 0;
      this.velocityX[right] = 0;
    }
    for (let index = 0; index < this.depth.length; index++) {
      if (this.depth[index]! <= this.minDepth) {
        this.velocityX[index] = 0;
        this.velocityY[index] = 0;
        this.foam[index] = 0;
      }
    }
  }
}
