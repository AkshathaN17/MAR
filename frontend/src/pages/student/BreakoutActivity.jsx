import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useBreakout } from "../../context/BreakoutContext";

const EMOTION_META = {
  neutral:    { emoji: "😐", color: "#6b7280", label: "Neutral"     },
  interested: { emoji: "🤩", color: "#10b981", label: "Interested"  },
  bored:      { emoji: "😴", color: "#f59e0b", label: "Bored"       },
  confused:   { emoji: "😕", color: "#fb923c", label: "Confused"    },
  frustrated: { emoji: "😤", color: "#ef4444", label: "Frustrated"  },
};

export default function BreakoutActivity() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const emotion = localStorage.getItem("breakoutEmotion");

  const { breakoutActivity, setWatchedEmotion, submitBreakoutResponse, breakoutInvite } =
    useBreakout();

  const [selectedOption, setSelectedOption] = useState(null);

  // Auth guard
  useEffect(() => {
    if (!user || user.role !== "student") navigate("/login");
    if (!emotion) navigate("/student/dashboard");
  }, [user, navigate, emotion]);

  // Watch this emotion's breakout activity
  useEffect(() => {
    if (emotion) setWatchedEmotion(emotion);
    return () => setWatchedEmotion(null);
  }, [emotion, setWatchedEmotion]);

  // If breakout room ends, redirect student back
  useEffect(() => {
    if (breakoutInvite === null && emotion) {
      // Room ended — go back to dashboard after brief delay
      const t = setTimeout(() => navigate("/student/dashboard"), 2000);
      return () => clearTimeout(t);
    }
  }, [breakoutInvite, navigate, emotion]);

  if (!user || !emotion) return null;

  const meta = EMOTION_META[emotion] || { emoji: "🎯", color: "#6b7280", label: emotion };

  /* ── No quiz launched yet ────────────────────────────────────────────── */
  if (!breakoutActivity) {
    return (
      <>
        <Navbar title="Breakout Room" />
        <div className="panel" style={{ maxWidth: 560, margin: "60px auto", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>{meta.emoji}</div>
          <h2 style={{ color: meta.color }}>{meta.label} Breakout Room</h2>
          <p className="info">You're in the breakout room.</p>
          <p className="info">⏳ Waiting for your teacher to launch a quiz…</p>
          <div className="breakout-pulse-ring" style={{ "--ring-color": meta.color }} />
        </div>
      </>
    );
  }

  /* ── Quiz ───────────────────────────────────────────────────────────── */
  if (breakoutActivity.type === "quiz") {
    const qIdx = breakoutActivity.currentQuestionIndex;
    const question = breakoutActivity.questions[qIdx];
    const alreadyAnswered =
      breakoutActivity.responses?.[user.name]?.answers?.[qIdx] !== undefined;

    const handleSubmit = async () => {
      if (selectedOption === null) { alert("Select an option"); return; }
      await submitBreakoutResponse(emotion, user.name, qIdx, selectedOption);
      setSelectedOption(null);
    };

    return (
      <>
        <Navbar
          title={`Breakout Quiz – Q${qIdx + 1}`}
          onLogout={() => { localStorage.clear(); navigate("/login"); }}
        />

        <div className="panel" style={{ maxWidth: 620, margin: "40px auto" }}>
          {/* Emotion badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: meta.color + "20",
              color: meta.color,
              borderRadius: 20,
              padding: "4px 14px",
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {meta.emoji} {meta.label} Room
          </div>

          <h2 style={{ fontSize: "1.1rem", marginBottom: 20 }}>
            Question {qIdx + 1} of {breakoutActivity.questions.length}
          </h2>

          <p style={{ fontWeight: 600, fontSize: "1.15rem", marginBottom: 20 }}>
            {question.question}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {question.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              return (
                <label
                  key={idx}
                  className={`breakout-option ${isSelected ? "selected" : ""} ${alreadyAnswered ? "disabled" : ""}`}
                  onClick={() => !alreadyAnswered && setSelectedOption(idx)}
                >
                  <input
                    type="radio"
                    disabled={alreadyAnswered}
                    checked={isSelected}
                    onChange={() => setSelectedOption(idx)}
                    style={{ width: "auto", margin: 0, accentColor: meta.color }}
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: 24 }}>
            {!alreadyAnswered ? (
              <button className="btn-primary" onClick={handleSubmit}>
                Submit Answer
              </button>
            ) : (
              <p style={{ color: "#10b981", fontWeight: 600 }}>
                ✅ Answer submitted! Waiting for next question…
              </p>
            )}
          </div>
        </div>
      </>
    );
  }

  return null;
}
