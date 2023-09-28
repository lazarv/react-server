export function cwd() {
  return typeof Deno !== "undefined" ? Deno.cwd() : process.cwd();
}

export function argv() {
  return typeof Deno !== "undefined"
    ? [Deno.execPath(), Deno.mainModule, ...Deno.args]
    : process.argv;
}

export function exit(code) {
  typeof Deno !== "undefined" ? Deno.exit(code) : process.exit(code);
}

export function getEnv(name) {
  return typeof Deno !== "undefined" ? Deno.env.get(name) : process.env[name];
}

export function setEnv(name, value) {
  typeof Deno !== "undefined"
    ? Deno.env.set(name, value)
    : (process.env[name] = value);
}

export function copyBytesFrom(buffer) {
  return typeof Deno !== "undefined"
    ? new Uint8Array(buffer)
    : Buffer.copyBytesFrom(buffer);
}

export function concat(buffers) {
  return typeof Deno !== "undefined"
    ? new Uint8Array(buffers.reduce((acc, buf) => [...acc, ...buf], []))
    : Buffer.concat(buffers);
}

export function immediate(fn) {
  return typeof Deno !== "undefined" ? fn() : setImmediate(fn);
}

if (typeof Deno !== "undefined") {
  globalThis.process = {
    env: Deno.env.toObject(),
    cwd: Deno.cwd,
    argv: [Deno.execPath(), Deno.mainModule, ...Deno.args],
    exit: Deno.exit,
    emit: function () {},
  };
}
