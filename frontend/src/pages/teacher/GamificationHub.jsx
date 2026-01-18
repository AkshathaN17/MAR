import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useGamification } from "../../context/GamificationContext";
import "./GamificationHub.css";

export default function GamificationHub() {
  const navigate = useNavigate();
  const { activity } = useGamification();

  const user = JSON.parse(localStorage.getItem("user"));

  // Auth guard
  if (!user || user.role !== "teacher") {
    navigate("/login");
    return null;
  }

  return (
    <>
      <Navbar
        title="Gamification Control Center"
        onLogout={() => {
          localStorage.clear();
          navigate("/login");
        }}
      />

      <div className="page">
  <div className="card">

        <h1>Boost Classroom Engagement</h1>
        <p className="subtitle">
          Launch and monitor interactive activities to reduce boredom.
        </p>

        {/* 🔴 LIVE ACTIVITY PANEL (MOST IMPORTANT FIX) */}
        {activity && (
          <div className="panel" style={{ marginBottom: "30px" }}>
            <h3>Live Activity Running</h3>

            <p>
              <strong>Type:</strong> {activity.type.toUpperCase()} <br />
              <strong>Section:</strong> {activity.section}
            </p>

            <button
              className="btn-primary"
              onClick={() => navigate("/teacher/activity-stats")}
            >
              View Live Stats
            </button>
          </div>
        )}

        {/* 🎮 GAMIFICATION OPTIONS */}
        <div className="grid">
          {/* QUIZ */}
          <div className="game-card">
            <h2>Live Quiz</h2>
            <p>
              Instantly engage students with multiple-choice questions.
            </p>
            <button
              className="btn-primary"
              onClick={() => navigate("/teacher/launch-quiz")}
            >
              Launch Quiz
            </button>
          </div>

          

          {/* WORD CLOUD */}
          <div className="game-card">
            <h2>Word Cloud</h2>
            <p>
              Collect one-word responses from students.
            </p>
            <button
  className="btn-primary"
  onClick={() => navigate("/teacher/launch-wordcloud")}
>
  Launch Word Cloud
</button>
           </div>
          </div>

        
          
        </div>
      </div>
    </>
  );
}
