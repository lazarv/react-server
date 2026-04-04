"use live";

import os from "node:os";

import StatusDisplay from "../../client/panels/StatusDisplay.jsx";

export default async function* StatusPanel() {
  let prevCpu = process.cpuUsage();
  let prevTime = process.hrtime.bigint();

  while (true) {
    const now = process.hrtime.bigint();
    const elapsed = Number(now - prevTime) / 1e6; // ms
    const currentCpu = process.cpuUsage(prevCpu);
    prevCpu = process.cpuUsage();
    prevTime = now;

    const mem = process.memoryUsage();

    // CPU percentage: (user + system microseconds) / (elapsed ms * 1000) * 100
    const cpuPercent =
      elapsed > 0
        ? ((currentCpu.user + currentCpu.system) / (elapsed * 1000)) * 100
        : 0;

    yield (
      <StatusDisplay
        data={{
          process: {
            nodeVersion: process.version,
            pid: process.pid,
            uptime: process.uptime(),
            platform: process.platform,
            arch: process.arch,
          },
          cpu: {
            percent: Math.min(cpuPercent, 100),
            cores: os.cpus().length,
            loadAvg: os.loadavg(),
          },
          memory: {
            rss: mem.rss,
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external,
            arrayBuffers: mem.arrayBuffers,
            osFree: os.freemem(),
            osTotal: os.totalmem(),
          },
        }}
      />
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
