import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, where } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

const STATUS_COLORS = {
  pending:     { color: "#D97706", bg: "#FEF3C7" },
  accepted:    { color: "#2563EB", bg: "#EFF6FF" },
  en_route:    { color: "#7C3AED", bg: "#F5F3FF" },
  arrived:     { color: "#0EA5E9", bg: "#F0F9FF" },
  in_progress: { color: "#F97316", bg: "#FFF7ED" },
  completed:   { color: "#059669", bg: "#ECFDF5" },
  escalated:   { color: "#DC2626", bg: "#FEF2F2" },
};

const timeAgo = (ts) => {
  if (!ts) return "Just now";
  const s = Math.floor((new Date() - ts.toDate()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [assigningId, setAssigningId] = useState(null);
  const [selectedPro, setSelectedPro] = useState("");

  useEffect(() => {
    const q = query(collection(db, "issues"));
    const unsub = onSnapshot(q, (snap) => {
      setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "professional"));
    const unsub = onSnapshot(q, (snap) => {
      setProfessionals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const handleAssign = async (issueId) => {
    if (!selectedPro) return;
    const pro = professionals.find((p) => p.id === selectedPro);
    if (!pro) return;
    await updateDoc(doc(db, "issues", issueId), {
      status: "accepted",
      professionalId: pro.id,
      professionalName: pro.name || pro.email,
      eta: "To be confirmed",
    });
    setAssigningId(null);
    setSelectedPro("");
  };

  const markEscalated = async (issueId) => {
    await updateDoc(doc(db, "issues", issueId), { status: "escalated" });
  };

  const filtered = issues.filter((i) => {
    if (activeTab === "open") return !["completed", "escalated"].includes(i.status);
    if (activeTab === "escalated") return i.status === "escalated";
    if (activeTab === "completed") return i.status === "completed";
    return true;
  });

  const stats = {
    total: issues.length,
    open: issues.filter((i) => !["completed", "escalated"].includes(i.status)).length,
    escalated: issues.filter((i) => i.status === "escalated").length,
    completed: issues.filter((i) => i.status === "completed").length,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: "230px", background: "#0A0F1C", color: "white", display: "flex", flexDirection: "column", padding: "1.5rem 1rem", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "#60A5FA" }}>SnapFix</h1>
          <p style={{ fontSize: "0.7rem", color: "#475569", margin: "4px 0 0" }}>Admin Console</p>
        </div>
        <div style={{ flex: 1 }}>
          {[
            { label: "All Issues",  tab: "all"       },
            { label: "Open",        tab: "open"       },
            { label: "Escalated",   tab: "escalated"  },
            { label: "Completed",   tab: "completed"  },
            { label: "Workers",     tab: "workers"    },
          ].map((item) => (
            <div key={item.tab} onClick={() => setActiveTab(item.tab)} style={{
              padding: "10px 12px", borderRadius: "8px", cursor: "pointer",
              marginBottom: "4px", fontSize: "0.85rem",
              background: activeTab === item.tab ? "#1E3A5F" : "transparent",
              color: activeTab === item.tab ? "#60A5FA" : "#94A3B8",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>{item.label}</span>
              {item.tab === "escalated" && stats.escalated > 0 && (
                <span style={{ background: "#DC2626", color: "white", borderRadius: "20px", padding: "1px 7px", fontSize: "0.68rem", fontWeight: 700 }}>{stats.escalated}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #1E293B", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "4px" }}>Signed in as</div>
          <div style={{ fontSize: "0.82rem", color: "#CBD5E1", marginBottom: "12px", wordBreak: "break-all" }}>{currentUser?.email}</div>
          <button onClick={handleLogout} style={{ width: "100%", padding: "8px 12px", background: "#0F172A", color: "#64748B", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "0.82rem", textAlign: "left" }}>Sign Out</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft: "230px", flex: 1, background: "#F8FAFF", minHeight: "100vh" }}>
        <div style={{ background: "white", padding: "1rem 2rem", borderBottom: "1px solid #E2E8F0", position: "sticky", top: 0, zIndex: 50 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600, color: "#0F172A" }}>Admin Overview</h2>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#94A3B8" }}>Manage all issues and workers</p>
        </div>

        <div style={{ padding: "1.5rem 2rem" }}>
          {/* Stats */}
          {activeTab !== "workers" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "1.5rem" }}>
              {[
                { label: "Total",     value: stats.total,     color: "#2563EB", bg: "#EFF6FF" },
                { label: "Open",      value: stats.open,      color: "#D97706", bg: "#FFFBEB" },
                { label: "Escalated", value: stats.escalated, color: "#DC2626", bg: "#FEF2F2" },
                { label: "Resolved",  value: stats.completed, color: "#059669", bg: "#ECFDF5" },
              ].map((s) => (
                <div key={s.label} style={{ background: "white", borderRadius: "12px", padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: "1.7rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748B" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Workers Tab */}
          {activeTab === "workers" ? (
            <div>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: "0 0 12px" }}>Worker Roster ({professionals.length})</h3>
              {professionals.length === 0 ? (
                <div style={{ background: "white", borderRadius: "16px", padding: "3rem", textAlign: "center", border: "1px solid #E2E8F0" }}>
                  <p style={{ color: "#64748B" }}>No professionals registered yet.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {professionals.map((pro) => (
                    <div key={pro.id} style={{ background: "white", borderRadius: "12px", padding: "1rem 1.25rem", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#0F172A", fontSize: "0.9rem" }}>{pro.name || "No name"}</div>
                        <div style={{ fontSize: "0.78rem", color: "#64748B" }}>{pro.email} · {pro.specialty || "No specialty set"}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{
                          fontSize: "0.72rem", padding: "3px 10px", borderRadius: "20px", fontWeight: 500,
                          background: pro.available ? "#ECFDF5" : "#F1F5F9",
                          color: pro.available ? "#059669" : "#64748B",
                        }}>{pro.available ? "On Duty" : "Off Duty"}</span>
                        {pro.jobsCompleted > 0 && (
                          <span style={{ fontSize: "0.72rem", color: "#94A3B8" }}>{pro.jobsCompleted} jobs</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Issues List */
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filtered.length === 0 ? (
                <div style={{ background: "white", borderRadius: "16px", padding: "3rem", textAlign: "center", border: "1px solid #E2E8F0" }}>
                  <p style={{ color: "#64748B" }}>No issues in this category.</p>
                </div>
              ) : filtered.map((issue) => {
                const s = STATUS_COLORS[issue.status] || STATUS_COLORS.pending;
                return (
  <div key={issue.id} style={{ background: "white", borderRadius: "14px", padding: "1.1rem 1.25rem", border: "1px solid #E2E8F0", borderLeft: `4px solid ${s.color}` }}>
    {/* Image if exists */}
    {issue.imageUrl && (
      <img
        src={issue.imageUrl}
        alt="Issue"
        style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "10px", marginBottom: "12px" }}
      />
    )}
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "#0F172A", fontSize: "0.92rem" }}>{issue.title}</span>
          <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "20px", background: s.bg, color: s.color, fontWeight: 600, textTransform: "capitalize" }}>{issue.status.replace("_", " ")}</span>
          {issue.severity === "high" && (
            <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "20px", background: "#FEF2F2", color: "#DC2626", fontWeight: 600 }}>Urgent</span>
          )}
        </div>
        <div style={{ fontSize: "0.8rem", color: "#64748B", marginBottom: "6px" }}>{issue.description}</div>
        <div style={{ display: "flex", gap: "12px", fontSize: "0.75rem", color: "#94A3B8", flexWrap: "wrap" }}>
          <span>{timeAgo(issue.createdAt)}</span>
          <span>By: {issue.userEmail}</span>
          {issue.professionalName && <span>Worker: {issue.professionalName}</span>}
          {issue.eta && <span>ETA: {issue.eta}</span>}
        </div>
      </div>
      {issue.status !== "completed" && (
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {issue.status !== "escalated" && (
            <button onClick={() => markEscalated(issue.id)} style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 500 }}>
              Escalate
            </button>
          )}
          <button onClick={() => setAssigningId(assigningId === issue.id ? null : issue.id)} style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 500 }}>
            Assign
          </button>
        </div>
      )}
    </div>
    {assigningId === issue.id && (
      <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #E2E8F0", display: "flex", gap: "8px" }}>
        <select style={{ ...inp, flex: 1 }} value={selectedPro} onChange={(e) => setSelectedPro(e.target.value)}>
          <option value="">Select a worker...</option>
          {professionals.filter(p => !p.specialty || p.specialty === issue.category).map((p) => (
            <option key={p.id} value={p.id}>{p.name || p.email} ({p.specialty || "any"})</option>
          ))}
        </select>
        <button onClick={() => handleAssign(issue.id)} style={{ background: "#2563EB", color: "white", border: "none", borderRadius: "8px", padding: "0 16px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}>
          Confirm
        </button>
      </div>
    )}
  </div>
);
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const inp = { width: "100%", padding: "0.65rem 0.875rem", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "0.875rem", boxSizing: "border-box", background: "#F8FAFC", color: "#0F172A" };

export default AdminDashboard;