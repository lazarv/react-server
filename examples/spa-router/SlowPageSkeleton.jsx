"use client";

export default function SlowPageSkeleton() {
  return (
    <div
      style={{
        padding: "1rem",
        border: "1px dashed #ccc",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          width: "60%",
          height: "1.5rem",
          background: "linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          borderRadius: 4,
          marginBottom: "1rem",
        }}
      />
      <div
        style={{
          width: "90%",
          height: "1rem",
          background: "linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          borderRadius: 4,
          marginBottom: "0.5rem",
        }}
      />
      <div
        style={{
          width: "75%",
          height: "1rem",
          background: "linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          borderRadius: 4,
        }}
      />
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
