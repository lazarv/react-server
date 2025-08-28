/**
 * Serialize a React component into a buffer.
 * @param model The React component to serialize.
 * @param options Options for the serialization.
 * @return A promise that resolves to a buffer containing the serialized component.
 */
export function toBuffer<T, O>(model: T, options?: O): Promise<Uint8Array>;
/**
 * Deserialize a buffer as a React component.
 * @param value The buffer to deserialize.
 * @param options Options for the deserialization.
 * @return A promise that resolves to the deserialized React component.
 */
export function fromBuffer<T = unknown, O = unknown>(
  value: Uint8Array,
  options?: O
): Promise<T>;
/**
 * Serialize a React component to a ReadableStream.
 * @param model The React component to serialize.
 * @param options Options for the serialization.
 * @return A promise that resolves to a ReadableStream containing the serialized component.
 */
export function toStream<T, O>(
  model: T,
  options?: O
): Promise<ReadableStream<Uint8Array>>;
/**
 * Deserialize a ReadableStream as a React component.
 * @param stream The ReadableStream to deserialize.
 * @param options Options for the deserialization.
 * @return A promise that resolves to the deserialized React component.
 */
export function fromStream<T = unknown, O = unknown>(
  stream: ReadableStream<Uint8Array>,
  options?: O
): Promise<T>;
