import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";


export default function TeacherDashboard() {
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  if (!user || user.role !== "teacher") {
    navigate("/login");
    return null;
  }
  return (
    <>
      <Navbar
        title="Faculty Portal"
        onLogout={() => {
          localStorage.clear();
          navigate("/login");
        }}
      />
  
      <div className="hero">
        <h1>{user.name}</h1>
        <p>{user.subject} · Faculty Dashboard</p>
      </div>
  
      <div className="content">
        <div className="panel">
          <h2>Assigned Sections</h2>
  
          <div className="grid">
            {user.sections.map((section) => (
              <div className="panel" key={section}>
                <h3>Section {section}</h3>
                <button
                  className="btn-primary"
                  onClick={() => {
                    localStorage.setItem("selectedSection", section);
                    navigate("/teacher/stats");
                  }}
                >
                  View Statistics
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
