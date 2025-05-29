"use live";

import os from "node:os";
import { execSync } from "node:child_process";

function average(nums) {
  const validNums = nums.filter((n) => n > 0);
  return validNums.reduce((a, b) => a + b, 0) / validNums.length || 0;
}

function getCpuUsage() {
  try {
    const output = execSync(
      "ps -A -o %cpu | awk '{s+=$1} END {print s}'"
    ).toString();
    return parseFloat(output);
  } catch {
    return 0;
  }
}

const FRAMES = 1000;
const cpu = new Array(FRAMES).fill(0);
const memory = new Array(FRAMES).fill(0);
let monitoring = false;

export default async function* ResourceMonitor() {
  const width = 800;
  const height = 200;
  const padding = 40;

  const graphWidth = width - padding;
  const graphHeight = height - padding;

  const freq = (1 / FRAMES) * 16 * 1000;
  const cores = os.cpus().length;
  while (true) {
    yield (
      <svg
        width={width}
        height={height + 20}
        viewBox={`0 0 ${width} ${height + 20}`}
        style={{
          background: "#111",
          width: `${width * 2}px`,
          height: `${height * 2}px`,
        }}
      >
        {[0, 25, 50, 75, 100].map((yVal) => {
          const y = padding + ((100 - yVal) / 100) * graphHeight;
          return (
            <g key={yVal}>
              <line
                x1={padding}
                x2={width}
                y1={y}
                y2={y}
                stroke="#444"
                strokeDasharray="4 2"
              />
              <text
                x={5}
                y={y + 4}
                fontSize="10"
                fill="#aaa"
                textAnchor="start"
              >
                {yVal}%
              </text>
            </g>
          );
        })}

        {Array.from({ length: 6 }, (_, i) => {
          const x = padding + (i / 5) * graphWidth;
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={padding}
                y2={height}
                stroke="#333"
                strokeDasharray="2 2"
              />
              <text
                x={x}
                y={height + 10}
                fontSize="10"
                fill="#aaa"
                textAnchor="middle"
              >
                {i * 5}s
              </text>
            </g>
          );
        })}

        <polyline
          fill="none"
          stroke="red"
          strokeWidth="1.5"
          points={memory
            .map((v, i) => {
              const x = padding + (i / (memory.length - 1)) * graphWidth;
              const y = padding + ((100 - v) / 100) * graphHeight;
              return `${x},${y}`;
            })
            .join(" ")}
        />

        <polyline
          fill="none"
          stroke="green"
          strokeWidth="1.5"
          points={cpu
            .map((v, i) => {
              const x = padding + (i / (cpu.length - 1)) * graphWidth;
              const y = padding + ((100 - v) / 100) * graphHeight;
              return `${x},${y}`;
            })
            .join(" ")}
        />

        <text x={padding} y={15} fill="green" fontSize="12">
          CPU avg: {average(cpu).toFixed(2)}%
        </text>
        <text x={padding + 120} y={15} fill="green" fontSize="12">
          CPU peak: {Math.max(...cpu).toFixed(2)}%
        </text>
        <text x={padding + 240} y={15} fill="red" fontSize="12">
          Mem. avg: {average(memory).toFixed(2)}%
        </text>
        <text x={padding + 360} y={15} fill="red" fontSize="12">
          Mem. peak: {Math.max(...memory).toFixed(2)}%
        </text>
      </svg>
    );

    if (!monitoring) {
      monitoring = true;

      await new Promise((resolve) => setTimeout(resolve, freq));

      cpu.push(getCpuUsage() / cores);
      if (cpu.length > FRAMES) {
        cpu.shift();
      }

      memory.push(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
      if (memory.length > FRAMES) {
        memory.shift();
      }

      monitoring = false;
    } else {
      await new Promise((resolve) => setTimeout(resolve, freq));
    }
  }
}
