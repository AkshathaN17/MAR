import { useState } from "react";
import { BACKEND_URL } from "../../config/appConfig.js";
import Navbar from "../../components/Navbar";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    // Clear previous session
    localStorage.removeItem("user");

    // Trim inputs
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    // Validation
    if (!trimmedUsername || !trimmedPassword) {
      setError("Please enter both username and password.");
      setLoading(false);
      return;
    }

    try {
      console.log("BACKEND URL:", BACKEND_URL);
      console.log("Sending login request...");

      const response = await fetch(
        `${BACKEND_URL}/login/${role}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: trimmedUsername,
            password: trimmedPassword,
          }),
        }
      );

      console.log("Response status:", response.status);

      // Read response safely
      const data = await response.json();

      console.log("Response data:", data);

      // Handle failed login
      if (!response.ok) {
        setError(data.message || "Invalid credentials");
        setLoading(false);
        return;
      }

      // Save logged in user
      localStorage.setItem(
        "user",
        JSON.stringify({
          ...data,
          role,
        })
      );

      console.log("Login successful");

      // Redirect
      if (role === "student") {
        window.location.href = "/student/dashboard";
      } else {
        window.location.href = "/teacher/dashboard";
      }

    } catch (err) {
      console.error("LOGIN ERROR:", err);

      setError(
        "Unable to connect to server. Check backend connection."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar title="R. V. College of Engineering" />

      <div className="page center-page">
        <div className="card auth-card">

          {/* HERO SECTION */}
          <div className="hero">
            <div className="container">
              <h1>College Learning Management System</h1>

              <p>
                Academic portal for students and faculty of
                R. V. College of Engineering
              </p>
            </div>
          </div>

          {/* LOGIN FORM */}
          <div className="content">
            <div
              className="panel"
              style={{ maxWidth: "420px", margin: "0 auto" }}
            >
              <h2>Portal Login</h2>

              <form onSubmit={handleLogin}>

                {/* ROLE */}
                <label>Role</label>

                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="student">Student</option>
                  <option value="teacher">Faculty</option>
                </select>

                {/* USERNAME */}
                <label>Username</label>

                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />

                {/* PASSWORD */}
                <label>Password</label>

                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                {/* BUTTON */}
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Signing In..." : "Sign In"}
                </button>

                {/* ERROR */}
                {error && (
                  <p
                    className="error"
                    style={{
                      color: "red",
                      marginTop: "15px",
                      textAlign: "center",
                    }}
                  >
                    {error}
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}