import { useState } from "react";
import { useNavigate } from "react-router-dom";
													  
import Navbar from "../../components/Navbar";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");
    localStorage.clear(); // clear old session

    try {
      // Call backend API depending on role
      const res = await fetch(`http://localhost:5000/login/${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.message || "Login failed");
		

					 
												
        return;
      }

      const userData = await res.json();
				   
										 
		

      // Save user in localStorage
      localStorage.setItem("user", JSON.stringify({ ...userData, role }));
												  
			 
	 

      // Navigate to dashboard
      if (role === "student") {
        window.location.href = "/student/dashboard";
      } else {
        window.location.href = "/teacher/dashboard";

					 
												
			   
      }
    } catch (err) {
      console.error(err);
      setError("Server error. Please try again.");
										 
		

															 
												  
			 
    }
  };

  return (
    <>
      <Navbar title="R. V. College of Engineering" />

      <div className="page center-page">
        <div className="card auth-card">

          <div className="hero">
            <div className="container">
              <h1>College Learning Management System</h1>
              <p>
                Academic portal for students and faculty of R. V. College of Engineering
              </p>
            </div>
          </div>
			  

          <div className="content">
            <div className="panel" style={{ maxWidth: 420 }}>
              <h2>Portal Login</h2>

              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="teacher">Faculty</option>
              </select>

              <label>Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />

              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button className="btn-primary" onClick={handleLogin}>
                Sign In
              </button>

              {error && <p className="error">{error}</p>}
            </div>
          </div>
        </div>

      </div>
    </>
	 
  );
}