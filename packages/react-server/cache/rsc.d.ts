export function toBuffer<T>(model: T): Promise<Uint8Array>;
export function fromBuffer<T = unknown>(value: Uint8Array): Promise<T>;
export function toStream<T>(model: T): Promise<ReadableStream<Uint8Array>>;
export function fromStream<T = unknown>(
  stream: ReadableStream<Uint8Array>
): Promise<T>;
