import React from "react";

const Navbar = () => {
  return (
    <div className="navbar">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: "600",
              color: "#1e293b",
            }}
          >
            Token Usage Dashboard
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              color: "#64748b",
              fontSize: "0.875rem",
            }}
          >
            Monitor AI model usage and manage user access
          </p>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
