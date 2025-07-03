import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Eye, Ban, CheckCircle, AlertCircle } from "lucide-react";

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await axios.get("/api/admin/users");
      if (response.data.success) {
        setUsers(response.data.users);
      } else {
        setError("Failed to load users");
      }
    } catch (err) {
      setError("Error loading users");
      console.error("Users loading error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUser = async (userId) => {
    if (!window.confirm("Are you sure you want to block this user?")) {
      return;
    }

    setActionLoading((prev) => ({ ...prev, [userId]: "blocking" }));

    try {
      const response = await axios.post(`/api/admin/user/${userId}/block`);
      if (response.data.success) {
        setUsers((prev) =>
          prev.map((user) =>
            user.user_id === userId ? { ...user, is_blocked: true } : user
          )
        );
      } else {
        alert("Failed to block user");
      }
    } catch (err) {
      alert("Error blocking user");
      console.error("Block user error:", err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: null }));
    }
  };

  const handleUnblockUser = async (userId) => {
    if (!window.confirm("Are you sure you want to unblock this user?")) {
      return;
    }

    setActionLoading((prev) => ({ ...prev, [userId]: "unblocking" }));

    try {
      const response = await axios.post(`/api/admin/user/${userId}/unblock`);
      if (response.data.success) {
        setUsers((prev) =>
          prev.map((user) =>
            user.user_id === userId ? { ...user, is_blocked: false } : user
          )
        );
      } else {
        alert("Failed to unblock user");
      }
    } catch (err) {
      alert("Error unblocking user");
      console.error("Unblock user error:", err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: null }));
    }
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ margin: 0 }}>User Management</h1>
        <button onClick={loadUsers} className="btn btn-primary">
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3 className="stat-value">{users.length}</h3>
          <p className="stat-label">Total Users</p>
        </div>
        <div className="stat-card">
          <h3 className="stat-value">
            {users.filter((u) => !u.is_blocked).length}
          </h3>
          <p className="stat-label">Active Users</p>
        </div>
        <div className="stat-card">
          <h3 className="stat-value">
            {users.filter((u) => u.is_blocked).length}
          </h3>
          <p className="stat-label">Blocked Users</p>
        </div>
        <div className="stat-card">
          <h3 className="stat-value">
            ${users.reduce((sum, u) => sum + (u.total_cost || 0), 0).toFixed(2)}
          </h3>
          <p className="stat-label">Total Cost (30d)</p>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Status</th>
              <th>Tokens (30d)</th>
              <th>Requests (30d)</th>
              <th>Cost (30d)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id}>
                <td>{user.user_id}</td>
                <td style={{ fontWeight: "500" }}>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  {user.is_blocked ? (
                    <span className="badge badge-danger">
                      <Ban size={12} style={{ marginRight: "0.25rem" }} />
                      Blocked
                    </span>
                  ) : (
                    <span className="badge badge-success">
                      <CheckCircle
                        size={12}
                        style={{ marginRight: "0.25rem" }}
                      />
                      Active
                    </span>
                  )}
                </td>
                <td>{user.total_tokens?.toLocaleString() || "0"}</td>
                <td>{user.request_count?.toLocaleString() || "0"}</td>
                <td>${(user.total_cost || 0).toFixed(4)}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Link
                      to={`/users/${user.user_id}`}
                      className="btn btn-primary btn-sm"
                    >
                      <Eye size={14} />
                    </Link>

                    {user.is_blocked ? (
                      <button
                        onClick={() => handleUnblockUser(user.user_id)}
                        disabled={actionLoading[user.user_id]}
                        className="btn btn-success btn-sm"
                      >
                        {actionLoading[user.user_id] === "unblocking" ? (
                          "..."
                        ) : (
                          <CheckCircle size={14} />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBlockUser(user.user_id)}
                        disabled={actionLoading[user.user_id]}
                        className="btn btn-danger btn-sm"
                      >
                        {actionLoading[user.user_id] === "blocking" ? (
                          "..."
                        ) : (
                          <Ban size={14} />
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "#64748b",
          }}
        >
          <AlertCircle size={48} style={{ marginBottom: "1rem" }} />
          <p>No users found</p>
        </div>
      )}
    </div>
  );
};

export default Users;
