import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { students, teachers } from "../../data/users";
import Navbar from "../../components/Navbar";


export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleLogin = () => {
    setError("");

    if (role === "student") {
      const student = students.find(
        (u) => u.username === username && u.password === password
      );

      if (!student) {
        setError("Invalid student credentials");
        return;
      }

      localStorage.setItem("user", JSON.stringify({ ...student, role }));
      navigate("/student/dashboard");
    }

    if (role === "teacher") {
      const teacher = teachers.find(
        (u) => u.username === username && u.password === password
      );

      if (!teacher) {
        setError("Invalid teacher credentials");
        return;
      }

      localStorage.setItem("user", JSON.stringify({ ...teacher, role }));
      navigate("/teacher/dashboard");
    }
  };

  return (
    <>
      <Navbar title="R. V. College of Engineering" />
  
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
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
  
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
    </>
  ); 
}
