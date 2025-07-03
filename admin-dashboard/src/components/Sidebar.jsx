import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Users, BarChart3, Settings } from "lucide-react";

const Sidebar = () => {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Dashboard", icon: Home },
    { path: "/users", label: "Users", icon: Users },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="sidebar">
      <div style={{ marginBottom: "2rem" }}>
        <h2
          style={{
            color: "white",
            margin: 0,
            fontSize: "1.5rem",
            fontWeight: "700",
          }}
        >
          AI Interview
        </h2>
        <p
          style={{
            color: "#94a3b8",
            margin: "0.25rem 0 0 0",
            fontSize: "0.875rem",
          }}
        >
          Admin Dashboard
        </p>
      </div>

      <nav>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${isActive ? "active" : ""}`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto",
          paddingTop: "2rem",
          borderTop: "1px solid #334155",
        }}
      >
        <div
          style={{
            padding: "1rem",
            background: "#334155",
            borderRadius: "6px",
            fontSize: "0.875rem",
            color: "#cbd5e1",
          }}
        >
          <div style={{ fontWeight: "500", marginBottom: "0.25rem" }}>
            Token Tracking
          </div>
          <div>Monitor AI usage & costs</div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
