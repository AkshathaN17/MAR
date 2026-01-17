import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";

export default function StudentDashboard() {
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  if (!user || user.role !== "student") {
    navigate("/login");
    return null;
  }

  const courses = ["Math", "Science", "English"];

  return (
    <>
      <Navbar
        title="Student Portal"
        onLogout={() => {
          localStorage.clear();
          navigate("/login");
        }}
      />
  
      <div className="hero">
        <h1>Welcome, {user.name}</h1>
        <p>Section {user.section} · Academic Dashboard</p>
      </div>
  
      <div className="content">
        <div className="panel">
          <h2>Your Courses</h2>
  
          <div className="grid">
            {courses.map((course) => (
              <div className="panel" key={course}>
                <h3>{course}</h3>
                <p className="info">
                  Upload recorded video assignments for evaluation.
                </p>
                <button
                  className="btn-primary"
                  onClick={() => {
                    localStorage.setItem("selectedCourse", course);
                    navigate("/student/upload");
                  }}
                >
                  Upload Video
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
  
}

  