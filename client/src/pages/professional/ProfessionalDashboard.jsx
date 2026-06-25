import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, onSnapshot, collection, query, where, orderBy, increment } from "firebase/firestore";
import { ref, onValue, off, remove } from "firebase/database";
import { auth, db, rtdb } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

const SPECIALTIES = [
  { value: "plumbing",    label: "Plumbing"    },
  { value: "electrical",  label: "Electrical"  },
  { value: "mechanical",  label: "Mechanical"  },
  { value: "cleaning",    label: "Cleaning"    },
  { value: "other",       label: "Other"       },
];

const STATUS_STEPS = [
  { value: "accepted",    label: "Accepted"    },
  { value: "en_route",    label: "En Route"    },
  { value: "arrived",     label: "Arrived"     },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Mark Complete" },
];

const timeAgo = (ts) => {
  if (!ts) return "Just now";
  const s = Math.floor((new Date() - ts.toDate()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const ProfessionalDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [specialty, setSpecialty] = useState(null);
  const [available, setAvailable] = useState(true);
  const [currentPing, setCurrentPing] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [etaInput, setEtaInput] = useState("");
  const [showEta, setShowEta] = useState(false);
  const [savingSpecialty, setSavingSpecialty] = useState(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState("plumbing");

  // Load user data
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);
        setSpecialty(data.specialty || null);
        setAvailable(data.available ?? true);
      }
    });
    return unsub;
  }, [currentUser]);

  // Listen to RTDB pings for this specialty
  useEffect(() => {
    if (!specialty || !available) return;
    const pingRef = ref(rtdb, `pings/${specialty}`);
    onValue(pingRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.issueId) setCurrentPing(data);
      else setCurrentPing(null);
    });
    return () => off(pingRef);
  }, [specialty, available]);

  // Listen to active job if any
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "issues"),
      where("professionalId", "==", currentUser.uid),
      where("status", "in", ["accepted", "en_route", "arrived", "in_progress"])
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) setActiveJob({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setActiveJob(null);
    });
    return unsub;
  }, [currentUser]);

  // Load job history
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "issues"),
      where("professionalId", "==", currentUser.uid),
      where("status", "==", "completed"),
      
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUser]);

  const saveSpecialty = async () => {
    setSavingSpecialty(true);
    await updateDoc(doc(db, "users", currentUser.uid), { specialty: selectedSpecialty });
    setSavingSpecialty(false);
  };

  const toggleAvailable = async () => {
    const next = !available;
    setAvailable(next);
    await updateDoc(doc(db, "users", currentUser.uid), { available: next });
  };

  const handleAccept = async () => {
    if (!etaInput) { setShowEta(true); return; }
    await updateDoc(doc(db, "issues", currentPing.issueId), {
      status: "accepted",
      professionalId: currentUser.uid,
      professionalName: userData?.name || currentUser.email,
      eta: etaInput,
    });
    await remove(ref(rtdb, `pings/${specialty}`));
    setCurrentPing(null);
    setShowEta(false);
    setEtaInput("");
  };

  const handleDecline = async () => {
    await remove(ref(rtdb, `pings/${specialty}`));
    setCurrentPing(null);
  };

  const updateStatus = async (status) => {
    if (!activeJob) return;
    await updateDoc(doc(db, "issues", activeJob.id), { status });
    if (status === "completed") {
      await updateDoc(doc(db, "users", currentUser.uid), {
        jobsCompleted: increment(1),
      });
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  if (!specialty) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8FAFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "white", borderRadius: "16px", padding: "2rem", width: "100%", maxWidth: "420px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0F172A", marginBottom: "8px" }}>Welcome to SnapFix</h1>
          <p style={{ color: "#64748B", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Select your specialty to start receiving job requests.</p>
          <label style={lbl}>Your Specialty</label>
          <select style={{ ...inp, marginBottom: "1rem" }} value={selectedSpecialty} onChange={(e) => setSelectedSpecialty(e.target.value)}>
            {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={saveSpecialty} disabled={savingSpecialty} style={primaryBtn}>
            {savingSpecialty ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  const currentStatusIndex = activeJob ? STATUS_STEPS.findIndex(s => s.value === activeJob.status) : -1;
  const nextStep = currentStatusIndex < STATUS_STEPS.length - 1 ? STATUS_STEPS[currentStatusIndex + 1] : null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: "230px", background: "#0A0F1C", color: "white", display: "flex", flexDirection: "column", padding: "1.5rem 1rem", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "#60A5FA" }}>SnapFix</h1>
          <p style={{ fontSize: "0.7rem", color: "#475569", margin: "4px 0 0" }}>Professional Portal</p>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ background: "#0F172A", borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
            <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "4px" }}>Specialty</div>
            <div style={{ fontSize: "0.875rem", color: "#E2E8F0", fontWeight: 500, textTransform: "capitalize" }}>{specialty}</div>
          </div>
          <div style={{ background: "#0F172A", borderRadius: "10px", padding: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "2px" }}>Status</div>
              <div style={{ fontSize: "0.875rem", color: available ? "#10B981" : "#EF4444", fontWeight: 600 }}>{available ? "On Duty" : "Off Duty"}</div>
            </div>
            <div onClick={toggleAvailable} style={{
              width: "40px", height: "22px", borderRadius: "11px", cursor: "pointer",
              background: available ? "#10B981" : "#374151", position: "relative", transition: "background 0.2s",
            }}>
              <div style={{
                width: "18px", height: "18px", borderRadius: "50%", background: "white",
                position: "absolute", top: "2px", transition: "left 0.2s",
                left: available ? "20px" : "2px",
              }} />
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1E293B", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#475569", marginBottom: "4px" }}>Signed in as</div>
          <div style={{ fontSize: "0.82rem", color: "#CBD5E1", marginBottom: "12px", wordBreak: "break-all" }}>{currentUser?.email}</div>
          <button onClick={handleLogout} style={{ width: "100%", padding: "8px 12px", background: "#0F172A", color: "#64748B", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "0.82rem", textAlign: "left" }}>Sign Out</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft: "230px", flex: 1, background: "#F8FAFF", minHeight: "100vh" }}>
        <div style={{ background: "white", padding: "1rem 2rem", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600, color: "#0F172A" }}>Job Dashboard</h2>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#94A3B8" }}>{userData?.name} · {jobs.length} jobs completed</p>
          </div>
        </div>

        <div style={{ padding: "1.5rem 2rem" }}>
          {/* Incoming Ping */}
          {currentPing && (
            <div style={{ background: "#0A0F1C", borderRadius: "16px", padding: "1.5rem", marginBottom: "1.5rem", border: "1px solid #1E3A5F" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#F59E0B", letterSpacing: "0.08em", marginBottom: "10px" }}>INCOMING JOB REQUEST</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "white", marginBottom: "6px" }}>{currentPing.title}</div>
              <div style={{ fontSize: "0.82rem", color: "#64748B", marginBottom: "1.25rem", textTransform: "capitalize" }}>
                {currentPing.category} · {currentPing.severity} severity · Requested by {currentPing.userEmail}
              </div>
              {showEta ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    style={{ ...inp, flex: 1, background: "#0F172A", color: "white", border: "1px solid #1E293B" }}
                    placeholder="ETA e.g. 15 minutes"
                    value={etaInput}
                    onChange={(e) => setEtaInput(e.target.value)}
                  />
                  <button onClick={handleAccept} style={{ background: "#059669", color: "white", border: "none", borderRadius: "8px", padding: "0 20px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}>Confirm</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setShowEta(true)} style={{ background: "#2563EB", color: "white", border: "none", borderRadius: "10px", padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}>Accept Job</button>
                  <button onClick={handleDecline} style={{ background: "#1E293B", color: "#94A3B8", border: "none", borderRadius: "10px", padding: "10px 24px", cursor: "pointer", fontSize: "0.875rem" }}>Decline</button>
                </div>
              )}
            </div>
          )}

          {/* Active Job */}
          {activeJob && (
            <div style={{ background: "white", borderRadius: "16px", padding: "1.5rem", marginBottom: "1.5rem", border: "1px solid #BFDBFE", boxShadow: "0 4px 20px rgba(37,99,235,0.08)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#2563EB", letterSpacing: "0.08em", marginBottom: "10px" }}>ACTIVE JOB</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "#0F172A", marginBottom: "4px" }}>{activeJob.title}</div>
              <div style={{ fontSize: "0.82rem", color: "#64748B", marginBottom: "1.25rem" }}>{activeJob.description}</div>
              {/* Status Steps */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "1.25rem", flexWrap: "wrap" }}>
                {STATUS_STEPS.slice(0, -1).map((step, i) => (
                  <div key={step.value} style={{
                    padding: "4px 12px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 500,
                    background: i <= currentStatusIndex ? "#EFF6FF" : "#F8FAFC",
                    color: i <= currentStatusIndex ? "#2563EB" : "#94A3B8",
                    border: `1px solid ${i <= currentStatusIndex ? "#BFDBFE" : "#E2E8F0"}`,
                  }}>{step.label}</div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                {nextStep && (
                  <button onClick={() => updateStatus(nextStep.value)} style={{ ...primaryBtn, padding: "10px 24px" }}>
                    {nextStep.label}
                  </button>
                )}
                <button onClick={() => updateStatus("completed")} style={{ background: "#059669", color: "white", border: "none", borderRadius: "10px", padding: "10px 24px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}>
                  Mark Complete
                </button>
              </div>
            </div>
          )}

          {/* No active job, not pinged */}
          {!currentPing && !activeJob && (
            <div style={{ background: "white", borderRadius: "16px", padding: "3rem 2rem", textAlign: "center", border: "1px solid #E2E8F0", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>{available ? "Waiting for jobs..." : "You are off duty"}</div>
              <p style={{ color: "#64748B", fontSize: "0.875rem" }}>{available ? "You'll be notified when a matching request comes in." : "Toggle your status to start receiving requests."}</p>
            </div>
          )}

          {/* Job History */}
          {jobs.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: "0 0 12px" }}>Completed Jobs</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {jobs.map((job) => (
                  <div key={job.id} style={{ background: "white", borderRadius: "12px", padding: "1rem", border: "1px solid #E2E8F0", borderLeft: "4px solid #059669" }}>
                    <div style={{ fontWeight: 600, color: "#0F172A", fontSize: "0.9rem", marginBottom: "4px" }}>{job.title}</div>
                    <div style={{ fontSize: "0.78rem", color: "#64748B" }}>{timeAgo(job.createdAt)} · {job.category}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const lbl = { display: "block", fontSize: "0.78rem", fontWeight: 500, color: "#374151", marginBottom: "6px" };
const inp = { width: "100%", padding: "0.65rem 0.875rem", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "0.875rem", boxSizing: "border-box", background: "#F8FAFC", color: "#0F172A" };
const primaryBtn = { background: "#2563EB", color: "white", border: "none", borderRadius: "10px", padding: "12px 28px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" };

export default ProfessionalDashboard;