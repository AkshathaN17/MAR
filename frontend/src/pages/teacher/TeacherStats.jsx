import { useNavigate } from "react-router-dom";

export default function TeacherStats() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const section = localStorage.getItem("selectedSection");

  if (!user || user.role !== "teacher") {
    navigate("/login");
    return null;
  }

  // Mock statistics
  const stats = {
    students: 5,
    videosUploaded: Math.floor(Math.random() * 5) + 1,
    averageScore: Math.floor(Math.random() * 40) + 60
  };

  return (
    <div className="page">
      <div className="card">
        <h2>Section {section} Statistics</h2>
  
        <p className="info"><strong>Teacher:</strong> {user.name}</p>
        <p className="info"><strong>Subject:</strong> {user.subject}</p>
  
        <h3>Performance</h3>
        <p className="info">Total Students: {stats.students}</p>
        <p className="info">Videos Uploaded: {stats.videosUploaded}</p>
        <p className="info">Average Score: {stats.averageScore}%</p>
  
        <button
          className="secondary"
          onClick={() => navigate("/teacher/dashboard")}
        >
          Back
        </button>
      </div>
    </div>
  );
  
}
