import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const docSnap = await getDoc(doc(db, "users", result.user.uid));
      const role = docSnap.data().role;
      if (role === "resident") navigate("/resident");
      else if (role === "professional") navigate("/professional");
      else if (role === "admin") navigate("/admin");
    } catch (err) {
      setError("Invalid email or password");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>⚡ SnapFix</h1>
        <p style={styles.sub}>Sign in to your account</p>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleLogin}>
          <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button style={styles.button} type="submit">Sign In</button>
        </form>
        <p style={styles.link}>Don't have an account? <Link to="/register">Register</Link></p>
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

export default Login;