import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("resident");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", result.user.uid), {
        name,
        email,
        role,
        createdAt: new Date().toISOString(),
        ...(role === "professional" && { available: true, rating: 0, jobsCompleted: 0 })
      });
      if (role === "resident") navigate("/resident");
      else if (role === "professional") navigate("/professional");
      else if (role === "admin") navigate("/admin");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>⚡ SnapFix</h1>
        <p style={styles.sub}>Create your account</p>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleRegister}>
          <input style={styles.input} type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <select style={styles.input} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="resident">Resident</option>
            <option value="professional">Professional (Plumber / Electrician / Mechanic)</option>
            <option value="admin">Admin</option>
          </select>
          <button style={styles.button} type="submit">Create Account</button>
        </form>
        <p style={styles.link}>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
};

const styles = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" },
  card: { background: "white", padding: "2rem", borderRadius: "12px", width: "100%", maxWidth: "400px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
  logo: { textAlign: "center", margin: "0 0 0.25rem", fontSize: "1.8rem" },
  sub: { textAlign: "center", color: "#666", marginBottom: "1.5rem", fontSize: "0.9rem" },
  input: { width: "100%", padding: "0.75rem", marginBottom: "1rem", border: "1px solid #ddd", borderRadius: "8px", fontSize: "1rem", boxSizing: "border-box" },
  button: { width: "100%", padding: "0.75rem", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "1rem", cursor: "pointer" },
  error: { color: "red", fontSize: "0.85rem", marginBottom: "1rem" },
  link: { textAlign: "center", marginTop: "1rem", fontSize: "0.9rem" }
};

export default Register;