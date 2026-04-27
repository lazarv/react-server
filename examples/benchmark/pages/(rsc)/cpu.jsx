// Test fixture: a CPU-bound route that saturates the event loop.
// Used to verify adaptive limiter shrinks the limit when ELU is high.
function burn(ms) {
  const end = Date.now() + ms;
  // eslint-disable-next-line no-empty
  while (Date.now() < end) {}
}

export default function Cpu() {
  burn(20); // ~20ms of synchronous CPU per request
  return <div>cpu ok</div>;
}
