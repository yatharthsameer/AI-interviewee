import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  Calendar,
  DollarSign,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const UserDetail = () => {
  const { userId } = useParams();
  const [userUsage, setUserUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);

  useEffect(() => {
    loadUserUsage();
  }, [userId, days]);

  const loadUserUsage = async () => {
    try {
      const response = await axios.get(
        `/api/admin/user/${userId}/usage?days=${days}`
      );
      if (response.data.success) {
        setUserUsage(response.data);
      } else {
        setError("Failed to load user usage");
      }
    } catch (err) {
      setError("Error loading user usage");
      console.error("User usage loading error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading user details...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  const totalTokens =
    userUsage?.usage?.reduce((sum, item) => sum + item.total_tokens, 0) || 0;
  const totalCost =
    userUsage?.usage?.reduce((sum, item) => sum + item.total_cost, 0) || 0;
  const totalRequests =
    userUsage?.usage?.reduce((sum, item) => sum + item.request_count, 0) || 0;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "2rem",
          gap: "1rem",
        }}
      >
        <Link to="/users" className="btn btn-secondary">
          <ArrowLeft size={16} />
          Back to Users
        </Link>
        <div>
          <h1 style={{ margin: 0 }}>User Details</h1>
          <p style={{ margin: "0.25rem 0 0 0", color: "#64748b" }}>
            User ID: {userId}
          </p>
        </div>
      </div>

      {/* Time Period Selector */}
      <div style={{ marginBottom: "2rem" }}>
        <label style={{ marginRight: "1rem", fontWeight: "500" }}>
          Time Period:
        </label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{
            padding: "0.5rem",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            marginRight: "1rem",
          }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button onClick={loadUserUsage} className="btn btn-primary btn-sm">
          Refresh
        </button>
      </div>

      {/* Usage Summary */}
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
              <h3 className="stat-value">{totalTokens.toLocaleString()}</h3>
              <p className="stat-label">Total Tokens</p>
            </div>
            <Activity size={32} style={{ color: "#3b82f6" }} />
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
              <h3 className="stat-value">{totalRequests.toLocaleString()}</h3>
              <p className="stat-label">Total Requests</p>
            </div>
            <Calendar size={32} style={{ color: "#10b981" }} />
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
              <h3 className="stat-value">${totalCost.toFixed(4)}</h3>
              <p className="stat-label">Total Cost</p>
            </div>
            <DollarSign size={32} style={{ color: "#f59e0b" }} />
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
                {totalRequests > 0
                  ? Math.round(totalTokens / totalRequests)
                  : 0}
              </h3>
              <p className="stat-label">Avg Tokens/Request</p>
            </div>
            <Activity size={32} style={{ color: "#8b5cf6" }} />
          </div>
        </div>
      </div>

      {/* Current Limits */}
      {userUsage?.limits && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Usage Limits</h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1rem",
            }}
          >
            <div
              style={{
                padding: "1rem",
                background:
                  userUsage.limits.daily_usage >
                  userUsage.limits.daily_limit * 0.8
                    ? "#fef2f2"
                    : "#f0f9ff",
                borderRadius: "6px",
                border: `1px solid ${
                  userUsage.limits.daily_usage >
                  userUsage.limits.daily_limit * 0.8
                    ? "#fecaca"
                    : "#bfdbfe"
                }`,
              }}
            >
              <div style={{ fontWeight: "500", marginBottom: "0.5rem" }}>
                Daily Usage
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>
                {userUsage.limits.daily_usage.toLocaleString()} /{" "}
                {userUsage.limits.daily_limit.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                {userUsage.limits.daily_remaining.toLocaleString()} remaining
              </div>
            </div>

            <div
              style={{
                padding: "1rem",
                background:
                  userUsage.limits.monthly_usage >
                  userUsage.limits.monthly_limit * 0.8
                    ? "#fef2f2"
                    : "#f0f9ff",
                borderRadius: "6px",
                border: `1px solid ${
                  userUsage.limits.monthly_usage >
                  userUsage.limits.monthly_limit * 0.8
                    ? "#fecaca"
                    : "#bfdbfe"
                }`,
              }}
            >
              <div style={{ fontWeight: "500", marginBottom: "0.5rem" }}>
                Monthly Usage
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>
                {userUsage.limits.monthly_usage.toLocaleString()} /{" "}
                {userUsage.limits.monthly_limit.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                {userUsage.limits.monthly_remaining.toLocaleString()} remaining
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage by Model/Endpoint */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Usage by Model & Endpoint</h2>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={userUsage?.usage || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="model_name" />
            <YAxis />
            <Tooltip
              formatter={(value, name) => [
                name === "total_tokens"
                  ? `${value.toLocaleString()} tokens`
                  : name === "total_cost"
                  ? `$${value.toFixed(4)}`
                  : value,
                name === "total_tokens"
                  ? "Tokens"
                  : name === "total_cost"
                  ? "Cost"
                  : "Requests",
              ]}
            />
            <Bar dataKey="total_tokens" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Usage Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Detailed Usage Breakdown</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Endpoint</th>
                <th>Requests</th>
                <th>Total Tokens</th>
                <th>Cost</th>
                <th>First Request</th>
                <th>Last Request</th>
              </tr>
            </thead>
            <tbody>
              {userUsage?.usage?.map((item, index) => (
                <tr key={index}>
                  <td style={{ fontWeight: "500" }}>{item.model_name}</td>
                  <td>
                    <code
                      style={{
                        background: "#f1f5f9",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                      }}
                    >
                      {item.endpoint}
                    </code>
                  </td>
                  <td>{item.request_count.toLocaleString()}</td>
                  <td>{item.total_tokens.toLocaleString()}</td>
                  <td>${item.total_cost.toFixed(4)}</td>
                  <td>{new Date(item.first_request).toLocaleDateString()}</td>
                  <td>{new Date(item.last_request).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!userUsage?.usage || userUsage.usage.length === 0) && (
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              color: "#64748b",
            }}
          >
            No usage data found for the selected time period.
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDetail;
