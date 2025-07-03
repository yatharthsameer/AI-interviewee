import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Users, DollarSign, Activity, AlertTriangle } from "lucide-react";

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await axios.get("/api/admin/stats");
      if (response.data.success) {
        setStats(response.data.stats);
      } else {
        setError("Failed to load statistics");
      }
    } catch (err) {
      setError("Error loading statistics");
      console.error("Stats loading error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <div>
      {/* Statistics Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3 className="stat-value">{stats?.total_users || 0}</h3>
              <p className="stat-label">Total Users</p>
            </div>
            <Users size={32} style={{ color: "#3b82f6" }} />
          </div>
        </div>

        <div className="stat-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3 className="stat-value">{stats?.active_users || 0}</h3>
              <p className="stat-label">Active Users</p>
            </div>
            <Activity size={32} style={{ color: "#10b981" }} />
          </div>
        </div>

        <div className="stat-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3 className="stat-value">{stats?.blocked_users || 0}</h3>
              <p className="stat-label">Blocked Users</p>
            </div>
            <AlertTriangle size={32} style={{ color: "#ef4444" }} />
          </div>
        </div>

        <div className="stat-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3 className="stat-value">
                ${(stats?.total_cost_30d || 0).toFixed(2)}
              </h3>
              <p className="stat-label">Cost (30 days)</p>
            </div>
            <DollarSign size={32} style={{ color: "#f59e0b" }} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        {/* Token Usage by Model */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Token Usage by Model (Last 30 Days)</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats?.model_breakdown || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model_name" />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [
                  name === "tokens"
                    ? `${value.toLocaleString()} tokens`
                    : name === "cost"
                    ? `$${value.toFixed(4)}`
                    : value,
                  name === "tokens"
                    ? "Tokens"
                    : name === "cost"
                    ? "Cost"
                    : "Requests",
                ]}
              />
              <Bar dataKey="tokens" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Model Distribution */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Model Usage Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats?.model_breakdown || []}
                dataKey="requests"
                nameKey="model_name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ model_name, percent }) =>
                  `${model_name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {(stats?.model_breakdown || []).map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} requests`, "Requests"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity Summary */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Summary (Last 30 Days)</h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          <div style={{ textAlign: "center", padding: "1rem" }}>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#3b82f6",
              }}
            >
              {(stats?.total_requests_30d || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
              Total Requests
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "1rem" }}>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#10b981",
              }}
            >
              {(stats?.total_tokens_30d || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
              Total Tokens
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "1rem" }}>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#f59e0b",
              }}
            >
              ${(stats?.total_cost_30d || 0).toFixed(2)}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
              Total Cost
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "1rem" }}>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#8b5cf6",
              }}
            >
              {stats?.total_requests_30d > 0
                ? Math.round(stats.total_tokens_30d / stats.total_requests_30d)
                : 0}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
              Avg Tokens/Request
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
