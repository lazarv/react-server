/**
 * Large page — a data table with 500 rows × 8 columns.
 * ~4000+ elements, ~80KB+ HTML. Typical admin dashboard / report.
 */

const COLUMNS = [
  "ID",
  "Name",
  "Email",
  "Department",
  "Role",
  "Status",
  "Joined",
  "Score",
];

const DEPARTMENTS = [
  "Engineering",
  "Marketing",
  "Sales",
  "Support",
  "Design",
  "Product",
  "Finance",
  "Legal",
];
const ROLES = [
  "Manager",
  "Senior",
  "Junior",
  "Lead",
  "Director",
  "Intern",
  "Principal",
  "Staff",
];
const STATUSES = ["Active", "Inactive", "On Leave", "Probation"];

function TableRow({ i }) {
  const dept = DEPARTMENTS[i % DEPARTMENTS.length];
  const role = ROLES[i % ROLES.length];
  const status = STATUSES[i % STATUSES.length];
  const score = ((i * 7 + 13) % 100) + 1;
  return (
    <tr>
      <td>{i}</td>
      <td>
        User {i} {dept[0]}
      </td>
      <td>user{i}@example.com</td>
      <td>{dept}</td>
      <td>{role}</td>
      <td>{status}</td>
      <td>
        2024-{String((i % 12) + 1).padStart(2, "0")}-
        {String((i % 28) + 1).padStart(2, "0")}
      </td>
      <td>{score}</td>
    </tr>
  );
}

export default function Large() {
  const rows = Array.from({ length: 500 }, (_, i) => i + 1);
  return (
    <main>
      <header>
        <h1>Employee Directory</h1>
        <p>{rows.length} records</p>
      </header>
      <table>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <TableRow key={i} i={i} />
          ))}
        </tbody>
      </table>
    </main>
  );
}
