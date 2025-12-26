"use client";

import {
  Activity,
  AlertCircle,
  Check,
  Home,
  Settings,
  User,
} from "react-feather";

export default function FeatherIcons() {
  return (
    <div data-testid="react-feather-result">
      <p>react-feather loaded successfully</p>
      <div style={{ display: "flex", gap: "10px" }}>
        <Home size={24} />
        <User size={24} />
        <Settings size={24} />
        <Activity size={24} />
        <AlertCircle size={24} />
        <Check size={24} />
      </div>
    </div>
  );
}
