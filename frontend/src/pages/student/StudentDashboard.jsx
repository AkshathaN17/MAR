import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useBreakout } from "../../context/BreakoutContext";

export default function StudentDashboard() {
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  const { breakoutInvite, dismissInvite } = useBreakout();

  if (!user || user.role !== "student") {
    navigate("/login");
    return null;
  }

  const courses = ["Math", "Science", "English"];

  const handleJoinBreakout = () => {
    localStorage.setItem("breakoutEmotion", breakoutInvite.emotion);
    navigate("/student/breakout-activity");
  };

  const EMOTION_META = {
    neutral:    { emoji: "😐", color: "#6b7280", label: "Neutral"     },
    interested: { emoji: "🤩", color: "#10b981", label: "Interested"  },
    bored:      { emoji: "😴", color: "#f59e0b", label: "Bored"       },
    confused:   { emoji: "😕", color: "#fb923c", label: "Confused"    },
    frustrated: { emoji: "😤", color: "#ef4444", label: "Frustrated"  },
  };

  const emotionMeta = breakoutInvite
    ? EMOTION_META[breakoutInvite.emotion] || { emoji: "🎯", color: "#a18cd1", label: breakoutInvite.emotion }
    : null;

  return (
    <>
      <Navbar
        title="Student Portal"
        onLogout={() => {
          localStorage.clear();
          navigate("/login");
        }}
      />

      {/* ── Breakout Room Invite Popup ────────────────────────────────── */}
      {breakoutInvite && emotionMeta && (
        <div className="breakout-modal-overlay">
          <div className="breakout-modal">
            {/* Pulsing ring */}
            <div
              className="breakout-modal__ring"
              style={{ "--ring-color": emotionMeta.color }}
            />

            <div className="breakout-modal__emoji">{emotionMeta.emoji}</div>

            <h2 className="breakout-modal__title">
              You've Been Invited to a Breakout Room!
            </h2>

            <p className="breakout-modal__desc">
              Your teacher has started a personalised{" "}
              <strong style={{ color: emotionMeta.color }}>
                {emotionMeta.label}
              </strong>{" "}
              session just for you.
            </p>

            <div className="breakout-modal__actions">
              <button
                className="btn-launch"
                onClick={handleJoinBreakout}
              >
                🚀 Join Breakout Room
              </button>
              <button
                className="btn-secondary"
                onClick={dismissInvite}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

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
                <button
                  className="btn-secondary"
                  onClick={() => navigate("/student/activity")}
                  style={{ marginTop: 8 }}
                >
                  Join Live Activity
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}