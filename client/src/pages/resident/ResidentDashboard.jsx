
import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp } from "firebase/firestore";
import { ref, set } from "firebase/database";
import { auth, db, rtdb } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

const CLOUDINARY_CLOUD = "dco6umicr";
const CLOUDINARY_PRESET = "snapfix";



const CATEGORIES = [
  { value: "plumbing", label: "🔧 Plumbing", color: "#3B82F6", bg: "#EFF6FF" },
  { value: "electrical", label: "⚡ Electrical", color: "#F59E0B", bg: "#FFFBEB" },
  { value: "mechanical", label: "🔩 Mechanical", color: "#8B5CF6", bg: "#F5F3FF" },
  { value: "cleaning", label: "🧹 Cleaning", color: "#10B981", bg: "#ECFDF5" },
  { value: "other", label: "📋 Other", color: "#64748B", bg: "#F8FAFC" },
];

const STATUS = {
  pending:     { label: " Pending",     color: "#D97706", bg: "#FEF3C7" },
  accepted:    { label: " Accepted",     color: "#2563EB", bg: "#EFF6FF" },
  en_route:    { label: " En Route",    color: "#7C3AED", bg: "#F5F3FF" },
  arrived:     { label: "📍 Arrived",     color: "#0EA5E9", bg: "#F0F9FF" },
  in_progress: { label: " In Progress", color: "#F97316", bg: "#FFF7ED" },
  completed:   { label: "✅ Resolved",    color: "#059669", bg: "#ECFDF5" },
  escalated:   { label: "⚠️ Escalated",  color: "#DC2626", bg: "#FEF2F2" },
};

const timeAgo = (timestamp) => {  
  if (!timestamp) return "Just now";
  const seconds = Math.floor((new Date() - timestamp.toDate()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const ResidentDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [form, setForm] = useState({
    title: "", description: "", category: "plumbing",
    imageUrl: "", severity: "medium",
  });

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
  collection(db, "issues"),
  where("userId", "==", currentUser.uid)
);
    const unsub = onSnapshot(q, (snap) => {
  setIssues(
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      })
  );
});
    return unsub;
  }, [currentUser]);


  const handleImageUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setUploadingImage(true);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setForm((prev) => ({ ...prev, imageUrl: data.secure_url }));
  } catch (err) {
    console.error("Image upload failed:", err);
  }
  setUploadingImage(false);
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const issueRef = await addDoc(collection(db, "issues"), {
        ...form,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        status: "pending",
        createdAt: serverTimestamp(),
        professionalId: null,
        professionalName: null,
        eta: null,
      });
      await set(ref(rtdb, `pings/${form.category}`), {
  issueId: issueRef.id,
  category: form.category,
  title: form.title,
  severity: form.severity,
  userEmail: currentUser.email,
  imageUrl: form.imageUrl || null,
  timestamp: Date.now(),
});
      setForm({ title: "", description: "", category: "plumbing", imageUrl: "", severity: "medium" });
      setShowForm(false);
    } catch (err) {
      console.error(err);
      alert("Error submitting issue. Check console.");
    }
    setSubmitting(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const filtered = issues.filter((i) => {
    if (activeTab === "open") return i.status !== "completed";
    if (activeTab === "resolved") return i.status === "completed";
    return true;
  });

  const stats = {
    total: issues.length,
    open: issues.filter((i) => i.status !== "completed").length,
    resolved: issues.filter((i) => i.status === "completed").length,
  };

  const catConfig = (val) => CATEGORIES.find((c) => c.value === val) || CATEGORIES[4];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Sidebar */}
      <div style={{
        width: "230px", background: "#0A0F1C", color: "white",
        display: "flex", flexDirection: "column", padding: "1.5rem 1rem",
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "#60A5FA" }}>⚡ SnapFix</h1>
          <p style={{ fontSize: "0.7rem", color: "#475569", margin: "4px 0 0" }}>Community Platform</p>
        </div>
        <div style={{ flex: 1 }}>
          {[
            { icon: "🏠", label: "Dashboard", tab: "all" },
            { icon: "📋", label: "Open Issues", tab: "open" },
            { icon: "✅", label: "Resolved", tab: "resolved" },
          ].map((item) => (
            <div key={item.tab} onClick={() => setActiveTab(item.tab)} style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 12px", borderRadius: "8px", cursor: "pointer",
              marginBottom: "4px", fontSize: "0.85rem",
              background: activeTab === item.tab ? "#1E3A5F" : "transparent",
              color: activeTab === item.tab ? "#60A5FA" : "#94A3B8",
            }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #1E293B", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "4px" }}>Signed in as</div>
          <div style={{ fontSize: "0.82rem", color: "#CBD5E1", marginBottom: "12px", wordBreak: "break-all" }}>{currentUser?.email}</div>
          <button onClick={handleLogout} style={{
            width: "100%", padding: "8px 12px", background: "#0F172A",
            color: "#64748B", border: "none", borderRadius: "8px",
            cursor: "pointer", fontSize: "0.82rem", textAlign: "left",
          }}>🚪 Sign Out</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ marginLeft: "230px", flex: 1, background: "#F8FAFF", minHeight: "100vh" }}>
        {/* Topbar */}
        <div style={{
          background: "white", padding: "1rem 2rem", borderBottom: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600, color: "#0F172A" }}>
              {activeTab === "all" ? "My Issues" : activeTab === "open" ? "Open Issues" : "Resolved Issues"}
            </h2>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#94A3B8" }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)} style={{
            background: showForm ? "#EF4444" : "#2563EB", color: "white",
            border: "none", borderRadius: "10px", padding: "10px 20px",
            cursor: "pointer", fontWeight: 600, fontSize: "0.875rem",
          }}>
            {showForm ? "✕ Cancel" : "⚡ Report Issue"}
          </button>
        </div>

        <div style={{ padding: "1.5rem 2rem" }}>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "1.5rem" }}>
            {[
              { label: "Total Issues", value: stats.total, color: "#2563EB", bg: "#EFF6FF", icon: "📊" },
              { label: "Open Issues",  value: stats.open,  color: "#D97706", bg: "#FFFBEB", icon: "🔓" },
              { label: "Resolved",     value: stats.resolved, color: "#059669", bg: "#ECFDF5", icon: "✅" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "white", borderRadius: "12px", padding: "1.1rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #E2E8F0",
                display: "flex", alignItems: "center", gap: "12px",
              }}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "10px",
                  background: s.bg, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: "1.2rem",
                }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "2px" }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Issue Form */}
          {showForm && (
            <div style={{
              background: "white", borderRadius: "16px", padding: "1.5rem",
              marginBottom: "1.5rem", boxShadow: "0 4px 20px rgba(37,99,235,0.1)",
              border: "1px solid #BFDBFE",
            }}>
              <h3 style={{ margin: "0 0 1.25rem", color: "#0F172A", fontSize: "1rem", fontWeight: 600 }}>
                ⚡ Report a New Issue
              </h3>
              <form onSubmit={handleSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <label style={lbl}>Issue Title</label>
                    <input style={inp} placeholder="e.g. Water pipe leaking in corridor"
                      value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                  </div>
                  <div>
                    <label style={lbl}>Category</label>
                    <select style={inp} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={lbl}>Description</label>
                  <textarea style={{ ...inp, height: "80px", resize: "vertical" }}
                    placeholder="Describe the issue in detail..."
                    value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
                  <div>
  <label style={lbl}>Photo</label>
  <input
    type="file"
    accept="image/*"
    onChange={handleImageUpload}
    style={{ ...inp, padding: "0.4rem" }}
  />
  {uploadingImage && (
    <p style={{ fontSize: "0.75rem", color: "#2563EB", marginTop: "4px" }}>Uploading...</p>
  )}
  {form.imageUrl && (
    <img src={form.imageUrl} alt="preview" style={{ marginTop: "8px", width: "80px", height: "80px", borderRadius: "8px", objectFit: "cover" }} />
  )}
</div>
                  <div>
                    <label style={lbl}>Severity</label>
                    <select style={inp} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🔴 High / Urgent</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={submitting} style={{
                  background: submitting ? "#93C5FD" : "#2563EB", color: "white",
                  border: "none", borderRadius: "10px", padding: "12px 28px",
                  cursor: submitting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.9rem",
                }}>
                  {submitting ? "Submitting..." : "🚨 Submit Issue"}
                </button>
              </form>
            </div>
          )}

          {/* Issue Feed */}
          {filtered.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "4rem 2rem", background: "white",
              borderRadius: "16px", border: "1px solid #E2E8F0",
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏘️</div>
              <h3 style={{ color: "#0F172A", margin: "0 0 8px" }}>No issues yet</h3>
              <p style={{ color: "#64748B", margin: 0 }}>Click "Report Issue" to submit your first one!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filtered.map((issue) => {
                const cat = catConfig(issue.category);
                const status = STATUS[issue.status] || STATUS.pending;
                return (
                  <div key={issue.id} style={{
                    background: "white", borderRadius: "14px", padding: "1.1rem",
                    border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    display: "flex", gap: "12px", alignItems: "flex-start",
                    borderLeft: `4px solid ${cat.color}`,
                  }}>
                    {issue.imageUrl ? (
                      <img src={issue.imageUrl} alt="" style={{
                        width: "60px", height: "60px", borderRadius: "10px",
                        objectFit: "cover", flexShrink: 0,
                      }} />
                    ) : (
                      <div style={{
                        width: "60px", height: "60px", borderRadius: "10px",
                        background: cat.bg, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: "1.5rem", flexShrink: 0,
                      }}>
                        {cat.label.split(" ")[0]}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "#0F172A", fontSize: "0.92rem" }}>{issue.title}</span>
                        <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "20px", background: cat.bg, color: cat.color, fontWeight: 500 }}>{cat.label}</span>
                        <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "20px", background: status.bg, color: status.color, fontWeight: 600 }}>{status.label}</span>
                        {issue.severity === "high" && (
                          <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "20px", background: "#FEF2F2", color: "#DC2626", fontWeight: 600 }}>🔴 Urgent</span>
                        )}
                      </div>
                      <p style={{ margin: "0 0 6px", color: "#64748B", fontSize: "0.82rem", lineHeight: 1.4 }}>{issue.description}</p>
                      <div style={{ display: "flex", gap: "12px", fontSize: "0.75rem", color: "#94A3B8", flexWrap: "wrap" }}>
                        <span>🕐 {timeAgo(issue.createdAt)}</span>
                        {issue.professionalName && <span> {issue.professionalName}</span>}
                        {issue.eta && <span>⏱️ ETA: {issue.eta}</span>}
                      </div>
                    </div>
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

const lbl = { display: "block", fontSize: "0.78rem", fontWeight: 500, color: "#374151", marginBottom: "6px" };
const inp = { width: "100%", padding: "0.65rem 0.875rem", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "0.875rem", boxSizing: "border-box", background: "#F8FAFC", color: "#0F172A" };

export default ResidentDashboard;