export default function SidebarNav() {
  return (
    <nav>
      <ul style={{ listStyle: "none", padding: 0 }}>
        <li>
          <a href="/dashboard">Overview</a>
        </li>
        <li>
          <a href="/dashboard/settings">Settings</a>
        </li>
        <li>
          <a href="/dashboard/analytics">Analytics</a>
        </li>
      </ul>
    </nav>
  );
}
