"use client";

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Gauge({ label, value, max, format = formatBytes, color = "#4f46e5" }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="dt-gauge">
      <div className="dt-gauge-header">
        <span className="dt-kv-label">{label}</span>
        <span className="dt-kv-value">
          {format(value)}
          {max > 0 && (
            <span className="dt-gauge-secondary"> / {format(max)}</span>
          )}
        </span>
      </div>
      <div className="dt-gauge-track">
        <div
          className="dt-gauge-fill"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
    </div>
  );
}

function StatCard({ title, children }) {
  return (
    <div className="dt-stat-card">
      <h3 className="dt-stat-title">{title}</h3>
      {children}
    </div>
  );
}

function KeyValue({ label, value }) {
  return (
    <div className="dt-kv-row">
      <span className="dt-kv-label">{label}</span>
      <span className="dt-kv-value">{value}</span>
    </div>
  );
}

export default function StatusDisplay({ data }) {
  if (!data) return null;

  const { process: proc, cpu, memory } = data;

  return (
    <div className="dt-stat-grid">
      {/* Process Info */}
      <StatCard title="Process">
        <KeyValue label="Node.js" value={proc.nodeVersion} />
        <KeyValue label="PID" value={proc.pid} />
        <KeyValue label="Platform" value={`${proc.platform} / ${proc.arch}`} />
        <KeyValue label="Uptime" value={formatUptime(proc.uptime)} />
      </StatCard>

      {/* CPU */}
      <StatCard title="CPU">
        <Gauge
          label="Usage"
          value={cpu.percent}
          max={100}
          format={(v) => `${v.toFixed(1)}%`}
          color={
            cpu.percent > 80
              ? "#ef4444"
              : cpu.percent > 50
                ? "#f59e0b"
                : "#22c55e"
          }
        />
        <KeyValue label="Cores" value={cpu.cores} />
        <KeyValue
          label="Load Average"
          value={cpu.loadAvg.map((v) => v.toFixed(2)).join(", ")}
        />
      </StatCard>

      {/* Memory */}
      <StatCard title="Memory">
        <Gauge
          label="Heap Used"
          value={memory.heapUsed}
          max={memory.heapTotal}
          color="#6366f1"
        />
        <Gauge
          label="RSS"
          value={memory.rss}
          max={memory.osTotal}
          color="#8b5cf6"
        />
        <KeyValue label="External" value={formatBytes(memory.external)} />
        <KeyValue
          label="Array Buffers"
          value={formatBytes(memory.arrayBuffers)}
        />
        <div className="dt-separator">
          <Gauge
            label="OS Memory"
            value={memory.osTotal - memory.osFree}
            max={memory.osTotal}
            color="#14b8a6"
          />
        </div>
      </StatCard>
    </div>
  );
}
