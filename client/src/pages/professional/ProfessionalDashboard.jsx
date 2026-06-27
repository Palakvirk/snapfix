import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { doc, updateDoc, onSnapshot, collection, query, where, increment } from "firebase/firestore";
import { ref, onValue, off, remove } from "firebase/database";
import { auth, db, rtdb } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

const STATUS_STEPS = [
  { value: "accepted",    label: "Accepted"      },
  { value: "en_route",    label: "En Route"      },
  { value: "arrived",     label: "Arrived"       },
  { value: "in_progress", label: "In Progress"   },
  { value: "completed",   label: "Mark Complete" },
];

const SPECIALTIES = [
  { value: "plumbing",   label: "Plumbing"   },
  { value: "electrical", label: "Electrical" },
  { value: "mechanical", label: "Mechanical" },
  { value: "cleaning",   label: "Cleaning"   },
  { value: "other",      label: "Other"      },
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
  const [countdown, setCountdown] = useState(60);
  const [pulse, setPulse] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const countdownRef = useRef(null);
  const pulseRef = useRef(null);
  const beepRef = useRef(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes snapfixPulse { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.7); } 70% { box-shadow: 0 0 0 20px rgba(37,99,235,0); } 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); } }
      @keyframes snapfixRing { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playBeep = (time, freq, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.4, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.start(time);
        osc.stop(time + duration);
      };
      playBeep(ctx.currentTime, 880, 0.25);
      playBeep(ctx.currentTime + 0.3, 880, 0.25);
      playBeep(ctx.currentTime + 0.6, 1100, 0.4);
    } catch (e) { console.log("Sound not supported"); }
  };

  useEffect(() => {
    if (!currentPing) {
      clearInterval(countdownRef.current);
      clearInterval(pulseRef.current);
      clearInterval(beepRef.current);
      setCountdown(60);
      return;
    }
    playAlertSound();
    setCountdown(60);
    pulseRef.current = setInterval(() => setPulse((p) => !p), 800);
    beepRef.current = setInterval(() => playAlertSound(), 5000);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          clearInterval(pulseRef.current);
          clearInterval(beepRef.current);
          handleDeclineAuto();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(countdownRef.current);
      clearInterval(pulseRef.current);
      clearInterval(beepRef.current);
    };
  }, [currentPing?.issueId]);

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

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "issues"), where("professionalId", "==", currentUser.uid), where("status", "in", ["accepted", "en_route", "arrived", "in_progress"]));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) setActiveJob({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setActiveJob(null);
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "issues"), where("professionalId", "==", currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setJobs(all.filter((j) => j.status === "completed").sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      }));
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
    clearInterval(countdownRef.current);
    clearInterval(pulseRef.current);
    clearInterval(beepRef.current);
    await updateDoc(doc(db, "issues", currentPing.issueId), {
      status: "accepted", professionalId: currentUser.uid,
      professionalName: userData?.name || currentUser.email, eta: etaInput,
    });
    await remove(ref(rtdb, `pings/${specialty}`));
    setCurrentPing(null);
    setShowEta(false);
    setEtaInput("");
  };

  const handleDecline = async () => {
    clearInterval(countdownRef.current);
    clearInterval(pulseRef.current);
    clearInterval(beepRef.current);
    await remove(ref(rtdb, `pings/${specialty}`));
    setCurrentPing(null);
  };

  const handleDeclineAuto = async () => {
    try { await remove(ref(rtdb, `pings/${specialty}`)); setCurrentPing(null); } catch (e) {}
  };

  const updateStatus = async (status) => {
    if (!activeJob) return;
    await updateDoc(doc(db, "issues", activeJob.id), { status });
    if (status === "completed") await updateDoc(doc(db, "users", currentUser.uid), { jobsCompleted: increment(1) });
  };

  const handleLogout = async () => { await signOut(auth); navigate("/login"); };

  if (!specialty) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8FAFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "16px", padding: "2rem", width: "100%", maxWidth: "420px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0F172A", marginBottom: "8px" }}>Welcome to SnapFix</h1>
          <p style={{ color: "#64748B", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Select your specialty to start receiving job requests.</p>
          <label style={lbl}>Your Specialty</label>
          <select style={{ ...inp, marginBottom: "1rem" }} value={selectedSpecialty} onChange={(e) => setSelectedSpecialty(e.target.value)}>
            {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={saveSpecialty} disabled={savingSpecialty} style={primaryBtn}>{savingSpecialty ? "Saving..." : "Continue"}</button>
        </div>
      </div>
    );
  }

  const currentStatusIndex = activeJob ? STATUS_STEPS.findIndex(s => s.value === activeJob.status) : -1;
  const nextStep = currentStatusIndex < STATUS_STEPS.length - 2 ? STATUS_STEPS[currentStatusIndex + 1] : null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>

      {/* Uber-style ping overlay */}
      {currentPing && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "#0A0F1C", borderRadius: "24px", padding: "1.75rem", width: "100%", maxWidth: "400px", border: `2px solid ${pulse ? "#2563EB" : "#1E3A5F"}`, boxShadow: pulse ? "0 0 40px rgba(37,99,235,0.5)" : "0 0 20px rgba(37,99,235,0.2)", animation: "snapfixRing 0.8s ease-in-out infinite" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F59E0B", boxShadow: "0 0 8px #F59E0B" }} />
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#F59E0B", letterSpacing: "0.1em" }}>NEW JOB REQUEST</span>
              </div>
              <div style={{ background: countdown <= 10 ? "#DC2626" : "#1E293B", color: countdown <= 10 ? "white" : "#94A3B8", borderRadius: "20px", padding: "4px 12px", fontSize: "0.82rem", fontWeight: 700 }}>{countdown}s</div>
            </div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "white", margin: "0 0 6px" }}>{currentPing.title}</h2>
            <div style={{ fontSize: "0.8rem", color: "#64748B", marginBottom: "8px", textTransform: "capitalize" }}>{currentPing.category} · {currentPing.severity} severity</div>
            <div style={{ fontSize: "0.75rem", color: "#475569", marginBottom: "1rem" }}>Requested by {currentPing.userEmail}</div>
            {currentPing.imageUrl && <img src={currentPing.imageUrl} alt="Issue" style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "12px", marginBottom: "1rem" }} />}
            <div style={{ background: "#1E293B", borderRadius: "4px", height: "4px", marginBottom: "1.25rem", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "4px", background: countdown <= 10 ? "#DC2626" : "#2563EB", width: `${(countdown / 60) * 100}%`, transition: "width 1s linear" }} />
            </div>
            {showEta ? (
              <div>
                <p style={{ fontSize: "0.82rem", color: "#94A3B8", marginBottom: "8px" }}>How long until you arrive?</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input style={{ ...inp, flex: 1, background: "#0F172A", color: "white", border: "1px solid #1E293B" }} placeholder="e.g. 15 minutes" value={etaInput} onChange={(e) => setEtaInput(e.target.value)} autoFocus />
                  <button onClick={handleAccept} style={{ background: "#059669", color: "white", border: "none", borderRadius: "10px", padding: "0 18px", cursor: "pointer", fontWeight: 700 }}>Confirm</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button onClick={handleDecline} style={{ background: "#1E293B", color: "#94A3B8", border: "none", borderRadius: "12px", padding: "14px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>Decline</button>
                <button onClick={() => setShowEta(true)} style={{ background: "#2563EB", color: "white", border: "none", borderRadius: "12px", padding: "14px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 700, boxShadow: "0 4px 14px rgba(37,99,235,0.4)" }}>Accept</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overlay */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }} />}

      {/* Sidebar */}
      <div style={{ width: "230px", background: "#0A0F1C", color: "white", display: "flex", flexDirection: "column", padding: "1.5rem 1rem", position: "fixed", top: 0, bottom: 0, zIndex: 100, left: sidebarOpen ? "0" : "-230px", transition: "left 0.3s ease" }}>
        <button onClick={() => setSidebarOpen(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "#64748B", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
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
            <div onClick={toggleAvailable} style={{ width: "40px", height: "22px", borderRadius: "11px", cursor: "pointer", background: available ? "#10B981" : "#374151", position: "relative" }}>
              <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "white", position: "absolute", top: "2px", transition: "left 0.2s", left: available ? "20px" : "2px" }} />
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
      <div style={{ flex: 1, background: "#F8FAFF", minHeight: "100vh" }}>
        <div style={{ background: "white", padding: "1rem 1.25rem", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: "12px", position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#0F172A", padding: "4px" }}>☰</button>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#0F172A" }}>Job Dashboard</h2>
            <p style={{ margin: 0, fontSize: "0.72rem", color: "#94A3B8" }}>{userData?.name} · {jobs.length} jobs completed</p>
          </div>
        </div>

        <div style={{ padding: "1.25rem" }}>
          {activeJob && (
            <div style={{ background: "white", borderRadius: "16px", padding: "1.25rem", marginBottom: "1.25rem", border: "1px solid #BFDBFE", boxShadow: "0 4px 20px rgba(37,99,235,0.08)" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#2563EB", letterSpacing: "0.08em", marginBottom: "8px" }}>ACTIVE JOB</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0F172A", marginBottom: "4px" }}>{activeJob.title}</div>
              <div style={{ fontSize: "0.8rem", color: "#64748B", marginBottom: "1rem" }}>{activeJob.description}</div>
              <div style={{ display: "flex", gap: "5px", marginBottom: "1rem", flexWrap: "wrap" }}>
                {STATUS_STEPS.slice(0, -1).map((step, i) => (
                  <div key={step.value} style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 500, background: i <= currentStatusIndex ? "#EFF6FF" : "#F8FAFC", color: i <= currentStatusIndex ? "#2563EB" : "#94A3B8", border: `1px solid ${i <= currentStatusIndex ? "#BFDBFE" : "#E2E8F0"}` }}>{step.label}</div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {nextStep && <button onClick={() => updateStatus(nextStep.value)} style={primaryBtn}>{nextStep.label}</button>}
                <button onClick={() => updateStatus("completed")} style={{ background: "#059669", color: "white", border: "none", borderRadius: "10px", padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}>Mark Complete</button>
              </div>
            </div>
          )}

          {!currentPing && !activeJob && (
            <div style={{ background: "white", borderRadius: "16px", padding: "3rem 1rem", textAlign: "center", border: "1px solid #E2E8F0", marginBottom: "1.25rem" }}>
              <p style={{ color: "#0F172A", fontSize: "1rem", fontWeight: 500, marginBottom: "8px" }}>{available ? "Waiting for jobs..." : "You are off duty"}</p>
              <p style={{ color: "#64748B", fontSize: "0.82rem", margin: 0 }}>{available ? "You'll be notified when a matching request comes in." : "Toggle your status to start receiving requests."}</p>
            </div>
          )}

          {jobs.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", margin: "0 0 10px" }}>Completed Jobs</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {jobs.map((job) => (
                  <div key={job.id} style={{ background: "white", borderRadius: "12px", padding: "1rem", border: "1px solid #E2E8F0", borderLeft: "4px solid #059669" }}>
                    <div style={{ fontWeight: 600, color: "#0F172A", fontSize: "0.88rem", marginBottom: "3px" }}>{job.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748B", marginBottom: "8px" }}>{timeAgo(job.createdAt)} · {job.category}</div>
                    {job.rating ? (
                      <div style={{ background: "#FFFBEB", borderRadius: "8px", padding: "8px 10px" }}>
                        <div style={{ fontSize: "0.82rem", color: "#F59E0B" }}>{"★".repeat(job.rating)}{"☆".repeat(5 - job.rating)}<span style={{ color: "#64748B", marginLeft: "6px", fontSize: "0.72rem" }}>Rated {job.rating}/5</span></div>
                        {job.feedback && <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "3px", fontStyle: "italic" }}>"{job.feedback}"</div>}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.72rem", color: "#94A3B8" }}>Rating pending from resident</div>
                    )}
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
const primaryBtn = { background: "#2563EB", color: "white", border: "none", borderRadius: "10px", padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" };

export default ProfessionalDashboard;