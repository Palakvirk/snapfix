import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, updateDoc, doc, getDoc } from "firebase/firestore";
import { ref, set } from "firebase/database";
import { auth, db, rtdb } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

const CLOUDINARY_CLOUD = "dco6umicr";
const CLOUDINARY_PRESET = "snapfix";

const CATEGORIES = [
  { value: "plumbing",   label: "Plumbing",   color: "#3B82F6", bg: "#EFF6FF" },
  { value: "electrical", label: "Electrical", color: "#F59E0B", bg: "#FFFBEB" },
  { value: "mechanical", label: "Mechanical", color: "#8B5CF6", bg: "#F5F3FF" },
  { value: "cleaning",   label: "Cleaning",   color: "#10B981", bg: "#ECFDF5" },
  { value: "other",      label: "Other",      color: "#64748B", bg: "#F8FAFC" },
];

const STATUS = {
  pending:     { label: "Pending",     color: "#D97706", bg: "#FEF3C7" },
  accepted:    { label: "Accepted",    color: "#2563EB", bg: "#EFF6FF" },
  en_route:    { label: "En Route",    color: "#7C3AED", bg: "#F5F3FF" },
  arrived:     { label: "Arrived",     color: "#0EA5E9", bg: "#F0F9FF" },
  in_progress: { label: "In Progress", color: "#F97316", bg: "#FFF7ED" },
  completed:   { label: "Resolved",    color: "#059669", bg: "#ECFDF5" },
  escalated:   { label: "Escalated",   color: "#DC2626", bg: "#FEF2F2" },
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
  const [classifying, setClassifying] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [ratingIssueId, setRatingIssueId] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", category: "plumbing",
    imageUrl: "", severity: "medium",
  });

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "issues"), where("userId", "==", currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      setIssues(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
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
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();
      setForm((prev) => ({ ...prev, imageUrl: data.secure_url }));
    } catch (err) { console.error("Image upload failed:", err); }
    setUploadingImage(false);
  };

  const imageToBase64 = async (url) => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
  };

  const classifyWithGemini = async (imageUrl, description) => {
    try {
      const prompt = `You are an AI assistant for a community maintenance app called SnapFix.
Analyze this issue and respond ONLY with a JSON object, no markdown, no explanation.
Issue description: "${description}"
${imageUrl ? "An image has been provided." : "No image provided."}
Respond with exactly this format:
{
  "category": "plumbing" or "electrical" or "mechanical" or "cleaning" or "other",
  "severity": "low" or "medium" or "high",
  "aiSummary": "one sentence summary of the issue"
}`;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: imageUrl
                ? [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: await imageToBase64(imageUrl) } }]
                : [{ text: prompt }],
            }],
          }),
        }
      );
      const data = await response.json();
      if (data.error) { console.error("Gemini API error:", data.error.message); return null; }
      const text = data.candidates[0].content.parts[0].text;
      const cleaned = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (err) { console.error("Gemini error:", err); return null; }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      setClassifying(true);
      const ai = await classifyWithGemini(form.imageUrl, form.description);
      setClassifying(false);
      setAiResult(ai);
      const finalForm = ai
        ? { ...form, category: ai.category || form.category, severity: ai.severity || form.severity, aiSummary: ai.aiSummary || "", aiClassified: true }
        : { ...form, aiClassified: false };
      const issueRef = await addDoc(collection(db, "issues"), {
        ...finalForm, userId: currentUser.uid, userEmail: currentUser.email,
        status: "pending", createdAt: serverTimestamp(),
        professionalId: null, professionalName: null, eta: null, rating: null, feedback: null,
      });
      try {
        await set(ref(rtdb, `pings/${finalForm.category}`), {
          issueId: issueRef.id, category: finalForm.category, title: form.title,
          severity: finalForm.severity, userEmail: currentUser.email,
          imageUrl: form.imageUrl || null, timestamp: Date.now(),
        });
      } catch (rtdbErr) { console.error("RTDB ping failed:", rtdbErr); }
      setTimeout(async () => {
        try {
          const issueSnap = await getDoc(doc(db, "issues", issueRef.id));
          if (issueSnap.exists() && issueSnap.data().status === "pending") {
            await updateDoc(doc(db, "issues", issueRef.id), { status: "escalated" });
          }
        } catch (err) { console.error("Fallback timer error:", err); }
      }, 10 * 60 * 1000);
      setForm({ title: "", description: "", category: "plumbing", imageUrl: "", severity: "medium" });
      setAiResult(null);
      setShowForm(false);
    } catch (err) { console.error(err); alert("Error submitting issue."); }
    setSubmitting(false);
  };

  const handleRate = async (issueId, stars) => {
    await updateDoc(doc(db, "issues", issueId), { rating: stars, feedback: feedback || "" });
    setRatingIssueId(null);
    setRating(0);
    setFeedback("");
  };

  const handleLogout = async () => { await signOut(auth); navigate("/login"); };

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

      {/* Overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 99,
        }} />
      )}

      {/* Sidebar */}
      <div style={{
        width: "230px", background: "#0A0F1C", color: "white",
        display: "flex", flexDirection: "column", padding: "1.5rem 1rem",
        position: "fixed", top: 0, bottom: 0, zIndex: 100,
        left: sidebarOpen ? "0" : "-230px",
        transition: "left 0.3s ease",
      }}>
        <button onClick={() => setSidebarOpen(false)} style={{
          position: "absolute", top: "1rem", right: "1rem",
          background: "none", border: "none", color: "#64748B",
          fontSize: "1.2rem", cursor: "pointer",
        }}>✕</button>

        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "#60A5FA" }}>SnapFix</h1>
          <p style={{ fontSize: "0.7rem", color: "#475569", margin: "4px 0 0" }}>Community Platform</p>
        </div>
        <div style={{ flex: 1 }}>
          {[
            { label: "Dashboard",   tab: "all"      },
            { label: "Open Issues", tab: "open"     },
            { label: "Resolved",    tab: "resolved" },
          ].map((item) => (
            <div key={item.tab} onClick={() => { setActiveTab(item.tab); setSidebarOpen(false); }} style={{
              padding: "10px 12px", borderRadius: "8px", cursor: "pointer",
              marginBottom: "4px", fontSize: "0.85rem",
              background: activeTab === item.tab ? "#1E3A5F" : "transparent",
              color: activeTab === item.tab ? "#60A5FA" : "#94A3B8",
            }}>
              {item.label}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #1E293B", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "4px" }}>Signed in as</div>
          <div style={{ fontSize: "0.82rem", color: "#CBD5E1", marginBottom: "12px", wordBreak: "break-all" }}>{currentUser?.email}</div>
          <button onClick={handleLogout} style={{ width: "100%", padding: "8px 12px", background: "#0F172A", color: "#64748B", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "0.82rem", textAlign: "left" }}>Sign Out</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, background: "#F8FAFF", minHeight: "100vh" }}>
        {/* Topbar */}
        <div style={{
          background: "white", padding: "1rem 1.25rem", borderBottom: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#0F172A", padding: "4px" }}>☰</button>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#0F172A" }}>
                {activeTab === "all" ? "My Issues" : activeTab === "open" ? "Open Issues" : "Resolved"}
              </h2>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#94A3B8" }}>
                {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)} style={{
            background: showForm ? "#EF4444" : "#2563EB", color: "white",
            border: "none", borderRadius: "10px", padding: "9px 16px",
            cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap",
          }}>
            {showForm ? "Cancel" : "Report Issue"}
          </button>
        </div>

        <div style={{ padding: "1.25rem" }}>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "1.25rem" }}>
            {[
              { label: "Total",    value: stats.total,    color: "#2563EB", bg: "#EFF6FF" },
              { label: "Open",     value: stats.open,     color: "#D97706", bg: "#FFFBEB" },
              { label: "Resolved", value: stats.resolved, color: "#059669", bg: "#ECFDF5" },
            ].map((s) => (
              <div key={s.label} style={{ background: "white", borderRadius: "12px", padding: "0.875rem", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #E2E8F0", textAlign: "center" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "0.72rem", color: "#64748B" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Issue Form */}
          {showForm && (
            <div style={{ background: "white", borderRadius: "16px", padding: "1.25rem", marginBottom: "1.25rem", boxShadow: "0 4px 20px rgba(37,99,235,0.1)", border: "1px solid #BFDBFE" }}>
              <h3 style={{ margin: "0 0 1rem", color: "#0F172A", fontSize: "0.95rem", fontWeight: 600 }}>Report a New Issue</h3>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "0.875rem" }}>
                  <label style={lbl}>Issue Title</label>
                  <input style={inp} placeholder="e.g. Water pipe leaking" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div style={{ marginBottom: "0.875rem" }}>
                  <label style={lbl}>Category</label>
                  <select style={inp} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: "0.875rem" }}>
                  <label style={lbl}>Description</label>
                  <textarea style={{ ...inp, height: "70px", resize: "vertical" }} placeholder="Describe the issue..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
                </div>
                <div style={{ marginBottom: "0.875rem" }}>
                  <label style={lbl}>Photo</label>
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ ...inp, padding: "0.4rem" }} />
                  {uploadingImage && <p style={{ fontSize: "0.75rem", color: "#2563EB", marginTop: "4px" }}>Uploading...</p>}
                  {form.imageUrl && <img src={form.imageUrl} alt="preview" style={{ marginTop: "8px", width: "70px", height: "70px", borderRadius: "8px", objectFit: "cover" }} />}
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={lbl}>Severity</label>
                  <select style={inp} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High / Urgent</option>
                  </select>
                </div>
                {classifying && (
                  <div style={{ background: "#EFF6FF", borderRadius: "10px", padding: "10px 14px", marginBottom: "0.875rem", fontSize: "0.85rem", color: "#2563EB", fontWeight: 500 }}>
                    Analyzing with Gemini AI...
                  </div>
                )}
                {aiResult && (
                  <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: "10px", padding: "10px 14px", marginBottom: "0.875rem" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#059669", marginBottom: "4px", letterSpacing: "0.05em" }}>AI CLASSIFICATION</div>
                    <div style={{ fontSize: "0.82rem", color: "#0F172A", marginBottom: "4px" }}>{aiResult.aiSummary}</div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "20px", background: "#D1FAE5", color: "#065F46", fontWeight: 500 }}>Category: {aiResult.category}</span>
                      <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "20px", background: "#D1FAE5", color: "#065F46", fontWeight: 500 }}>Severity: {aiResult.severity}</span>
                    </div>
                  </div>
                )}
                <button type="submit" disabled={submitting || uploadingImage} style={{ background: submitting ? "#93C5FD" : "#2563EB", color: "white", border: "none", borderRadius: "10px", padding: "12px 24px", cursor: submitting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.875rem", width: "100%" }}>
                  {classifying ? "Analyzing..." : submitting ? "Submitting..." : "Submit Issue"}
                </button>
              </form>
            </div>
          )}

          {/* Issue Feed */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", background: "white", borderRadius: "16px", border: "1px solid #E2E8F0" }}>
              <h3 style={{ color: "#0F172A", margin: "0 0 8px" }}>No issues yet</h3>
              <p style={{ color: "#64748B", margin: 0, fontSize: "0.875rem" }}>Tap "Report Issue" to submit your first one!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filtered.map((issue) => {
                const cat = catConfig(issue.category);
                const status = STATUS[issue.status] || STATUS.pending;
                return (
                  <div key={issue.id} style={{ background: "white", borderRadius: "14px", padding: "1rem", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", borderLeft: `4px solid ${cat.color}` }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      {issue.imageUrl ? (
                        <img src={issue.imageUrl} alt="" style={{ width: "52px", height: "52px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: "52px", height: "52px", borderRadius: "8px", background: cat.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>
                          {cat.value === "plumbing" ? "🔧" : cat.value === "electrical" ? "⚡" : cat.value === "mechanical" ? "🔩" : cat.value === "cleaning" ? "🧹" : "📋"}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, color: "#0F172A", fontSize: "0.88rem" }}>{issue.title}</span>
                        </div>
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "4px" }}>
                          <span style={{ fontSize: "0.65rem", padding: "2px 7px", borderRadius: "20px", background: cat.bg, color: cat.color, fontWeight: 500 }}>{cat.label}</span>
                          <span style={{ fontSize: "0.65rem", padding: "2px 7px", borderRadius: "20px", background: status.bg, color: status.color, fontWeight: 600 }}>{status.label}</span>
                          {issue.severity === "high" && <span style={{ fontSize: "0.65rem", padding: "2px 7px", borderRadius: "20px", background: "#FEF2F2", color: "#DC2626", fontWeight: 600 }}>Urgent</span>}
                          {issue.aiClassified && <span style={{ fontSize: "0.65rem", padding: "2px 7px", borderRadius: "20px", background: "#EFF6FF", color: "#2563EB", fontWeight: 500 }}>AI</span>}
                        </div>
                        {issue.aiSummary && <p style={{ margin: "0 0 3px", color: "#7C3AED", fontSize: "0.75rem", fontStyle: "italic" }}>{issue.aiSummary}</p>}
                        <p style={{ margin: "0 0 4px", color: "#64748B", fontSize: "0.78rem", lineHeight: 1.4 }}>{issue.description}</p>
                        <div style={{ display: "flex", gap: "10px", fontSize: "0.72rem", color: "#94A3B8", flexWrap: "wrap" }}>
                          <span>{timeAgo(issue.createdAt)}</span>
                          {issue.professionalName && <span>Worker: {issue.professionalName}</span>}
                          {issue.eta && <span>ETA: {issue.eta}</span>}
                        </div>

                        {issue.status === "completed" && !issue.rating && (
                          <div style={{ marginTop: "8px" }}>
                            {ratingIssueId === issue.id ? (
                              <div>
                                <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "6px" }}>
                                  <span style={{ fontSize: "0.75rem", color: "#64748B", marginRight: "4px" }}>Rate:</span>
                                  {[1,2,3,4,5].map((star) => (
                                    <span key={star} onClick={() => setRating(star)} onMouseEnter={() => setRating(star)} onMouseLeave={() => setRating(rating)} style={{ fontSize: "1.4rem", cursor: "pointer", color: star <= rating ? "#F59E0B" : "#D1D5DB" }}>★</span>
                                  ))}
                                </div>
                                <textarea placeholder="Leave feedback (optional)..." value={feedback} onChange={(e) => setFeedback(e.target.value)} style={{ width: "100%", padding: "8px", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "0.78rem", resize: "none", height: "55px", boxSizing: "border-box", marginBottom: "6px" }} />
                                <button onClick={() => handleRate(issue.id, rating)} disabled={rating === 0} style={{ background: rating === 0 ? "#E2E8F0" : "#2563EB", color: rating === 0 ? "#94A3B8" : "white", border: "none", borderRadius: "8px", padding: "6px 16px", cursor: rating === 0 ? "not-allowed" : "pointer", fontSize: "0.78rem", fontWeight: 600 }}>
                                  Submit Rating
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setRatingIssueId(issue.id)} style={{ background: "none", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "4px 12px", cursor: "pointer", fontSize: "0.75rem", color: "#64748B" }}>
                                Rate this job
                              </button>
                            )}
                          </div>
                        )}
                        {issue.rating && (
                          <div style={{ marginTop: "8px", background: "#FFFBEB", borderRadius: "8px", padding: "8px 10px" }}>
                            <div style={{ fontSize: "0.82rem", color: "#F59E0B" }}>
                              {"★".repeat(issue.rating)}{"☆".repeat(5 - issue.rating)}
                              <span style={{ color: "#64748B", marginLeft: "6px", fontSize: "0.72rem" }}>{issue.rating}/5</span>
                            </div>
                            {issue.feedback && <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "3px", fontStyle: "italic" }}>"{issue.feedback}"</div>}
                          </div>
                        )}
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

const lbl = { display: "block", fontSize: "0.78rem", fontWeight: 500, color: "#374151", marginBottom: "5px" };
const inp = { width: "100%", padding: "0.65rem 0.875rem", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "0.875rem", boxSizing: "border-box", background: "#F8FAFC", color: "#0F172A" };

export default ResidentDashboard;