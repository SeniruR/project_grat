import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/admin/summary", label: "Share summary" },
  { to: "/admin/people", label: "People" },
  { to: "/admin/settings", label: "Titles" },
  { to: "/admin/audit", label: "Audit log" },
] as const;

/** Quick switcher on admin child pages. */
export function AdminSubNav() {
  return (
    <nav className="admin-subnav" aria-label="Admin sections">
      <NavLink to="/admin" end className="admin-subnav-hub">
        Overview
      </NavLink>
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
