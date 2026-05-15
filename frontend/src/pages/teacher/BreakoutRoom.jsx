import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useBreakout } from "../../context/BreakoutContext";

const API = "http://localhost:5000/api";

const EMOTION_META = {
  neutral:    { emoji: "😐", color: "#6b7280", label: "Neutral"     },
  interested: { emoji: "🤩", color: "#10b981", label: "Interested"  },
  bored:      { emoji: "😴", color: "#f59e0b", label: "Bored"       },
  confused:   { emoji: "😕", color: "#fb923c", label: "Confused"    },
  frustrated: { emoji: "😤", color: "#ef4444", label: "Frustrated"  },
};

export default function BreakoutRoom() {
  const { emotion } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const section = localStorage.getItem("selectedSection");

  const {
    breakoutActivity,
    setWatchedEmotion,
    launchBreakoutActivity,
    nextBreakoutQuestion,
    endBreakoutRoom,
  } = useBreakout();

  // ── Student list ───────────────────────────────────────────────────────
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  // ── Quiz builder state ─────────────────────────────────────────────────
  const [quizMode, setQuizMode] = useState("gemini"); // gemini | manual
  const [questions, setQuestions] = useState([]);
  const [topic, setTopic] = useState("");
  const [numQ, setNumQ] = useState(5);
  const [difficulty, setDifficulty] = useState("medium");
  const [genLoading, setGenLoading] = useState(false);
  // manual
  const [manualQ, setManualQ] = useState("");
  const [manualOpts, setManualOpts] = useState(["", "", "", ""]);
  const [manualCorrect, setManualCorrect] = useState(null);

  const [quizLaunched, setQuizLaunched] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!user || user.role !== "teacher") navigate("/login");
  }, [user, navigate]);

  // Start watching this emotion's activity
  useEffect(() => {
    setWatchedEmotion(emotion);
    return () => setWatchedEmotion(null);
  }, [emotion, setWatchedEmotion]);

  // Fetch student list
  useEffect(() => {
    if (!section || !user?.subject) return;
    setStudentsLoading(true);
    fetch(
      `${API}/breakout/students/${emotion}?section=${encodeURIComponent(
        section
      )}&subject=${encodeURIComponent(user.subject)}`
    )
      .then((r) => r.json())
      .then((d) => setStudents(Array.isArray(d) ? d : []))
      .catch(() => setStudents([]))
      .finally(() => setStudentsLoading(false));
  }, [emotion, section, user?.subject]);

  const meta = EMOTION_META[emotion] || { emoji: "🎯", color: "#6b7280", label: emotion };

  // ── Gemini generation ─────────────────────────────────────────────────
  const generateWithGemini = async () => {
    if (!topic.trim()) { alert("Enter a topic"); return; }
    setGenLoading(true);
    try {
      const res = await fetch(`${API}/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, numQuestions: numQ, difficulty }),
      });
      const data = await res.json();
      if (!Array.isArray(data.questions)) { alert("Gemini failed. Try again."); return; }
      setQuestions(data.questions);
    } catch { alert("Quiz generation failed"); }
    finally { setGenLoading(false); }
  };

  // ── Manual add question ───────────────────────────────────────────────
  const addManualQuestion = () => {
    if (!manualQ || manualOpts.some((o) => !o) || manualCorrect === null) {
      alert("Fill all fields and select correct answer");
      return;
    }
    setQuestions([...questions, { question: manualQ, options: manualOpts, correctAnswer: manualCorrect }]);
    setManualQ(""); setManualOpts(["", "", "", ""]); setManualCorrect(null);
  };

  // ── Launch quiz in room ───────────────────────────────────────────────
  const handleLaunchQuiz = async () => {
    if (questions.length === 0) { alert("No questions added"); return; }
    await launchBreakoutActivity(emotion, {
      type: "quiz",
      section,
      questions,
      currentQuestionIndex: 0,
      responses: {},
    });
    setQuizLaunched(true);
  };

  // ── End room ──────────────────────────────────────────────────────────
  const handleEndRoom = async () => {
    await endBreakoutRoom(emotion);
    navigate("/teacher/stats");
  };

  // ── Quiz stats (live) ─────────────────────────────────────────────────
  const renderStats = () => {
    if (!breakoutActivity || breakoutActivity.type !== "quiz") return null;
    const qIdx = breakoutActivity.currentQuestionIndex;
    const question = breakoutActivity.questions[qIdx];
    const responses = breakoutActivity.responses || {};
    const attempted = Object.entries(responses).filter(
      ([, d]) => d.answers?.[qIdx] !== undefined
    );
    const correct = attempted.filter(
      ([, d]) => d.answers[qIdx] === question.correctAnswer
    ).length;
    const optStats = question.options.map((_, i) =>
      attempted.filter(([, d]) => d.answers[qIdx] === i).length
    );

    return (
      <div className="breakout-stats-panel">
        <h3>
          📊 Live Stats — Question {qIdx + 1} of {breakoutActivity.questions.length}
        </h3>
        <p style={{ fontWeight: 600 }}>{question.question}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0" }}>
          {question.options.map((opt, i) => {
            const pct = attempted.length ? Math.round((optStats[i] / attempted.length) * 100) : 0;
            const isCorrect = i === question.correctAnswer;
            return (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: isCorrect ? 700 : 400 }}>
                    {isCorrect ? "✅ " : ""}{opt}
                  </span>
                  <span style={{ color: "#6b7280" }}>{optStats[i]} students ({pct}%)</span>
                </div>
                <div style={{ background: "#e5e7eb", borderRadius: 6, height: 10, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: isCorrect ? "#10b981" : "#a18cd1",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="info">
          Attempted: {attempted.length} / {students.length} &nbsp;|&nbsp; Correct: {correct}
        </p>

        {qIdx < breakoutActivity.questions.length - 1 ? (
          <button className="btn-primary" onClick={() => nextBreakoutQuestion(emotion)}>
            Next Question (Q{qIdx + 2})
          </button>
        ) : (
          <button className="btn-primary" disabled>Quiz Complete</button>
        )}

        <hr />

        <h3>🏆 Leaderboard</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "8px 0" }}>Student</th>
              <th style={{ textAlign: "left", padding: "8px 0" }}>XP</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(responses)
              .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
              .map(([name, data]) => (
                <tr key={name} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 0" }}>{name}</td>
                  <td style={{ padding: "8px 0", fontWeight: 600, color: "#a18cd1" }}>
                    {data.xp || 0} XP
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <Navbar title={`Breakout Room — ${meta.label}`} />

      <div className="content" style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>

        {/* Header badge */}
        <div className="breakout-header-badge" style={{ borderColor: meta.color }}>
          <span style={{ fontSize: 36 }}>{meta.emoji}</span>
          <div>
            <h2 style={{ margin: 0 }}>{meta.label} Breakout Room</h2>
            <p className="info" style={{ margin: 0 }}>Section {section} · {user?.subject}</p>
          </div>
          <button
            className="btn-danger"
            style={{ marginLeft: "auto" }}
            onClick={handleEndRoom}
          >
            🔴 End Breakout Room
          </button>
        </div>

        {/* Students in room */}
        <div className="panel">
          <h3>👥 Students in This Room ({studentsLoading ? "…" : students.length})</h3>
          {studentsLoading ? (
            <p className="info">Loading students…</p>
          ) : students.length === 0 ? (
            <p className="info">No students with this emotion detected yet.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
              {students.map((s) => (
                <span key={s.sid} className="student-chip">
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Live quiz stats (if quiz running) */}
        {breakoutActivity && renderStats()}

        {/* Quiz builder (show if no quiz launched) */}
        {!quizLaunched && (
          <div className="panel">
            <h3>🚀 Launch Personalized Quiz</h3>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              {["gemini", "manual"].map((m) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="radio"
                    checked={quizMode === m}
                    onChange={() => setQuizMode(m)}
                    style={{ width: "auto", margin: 0 }}
                  />
                  {m === "gemini" ? "🤖 Gemini AI" : "✍️ Manual"}
                </label>
              ))}
            </div>

            <hr />

            {quizMode === "gemini" && (
              <>
                <input
                  placeholder="Topic (e.g. Fractions, Newton's Laws)"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, color: "#6b7280" }}>No. of Questions</label>
                    <input
                      type="number" min={1} max={10}
                      value={numQ}
                      onChange={(e) => setNumQ(Number(e.target.value))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, color: "#6b7280" }}>Difficulty</label>
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
                <button className="btn-primary" disabled={genLoading} onClick={generateWithGemini}>
                  {genLoading ? "⏳ Generating…" : "Generate Quiz"}
                </button>
              </>
            )}

            {quizMode === "manual" && (
              <>
                <textarea
                  placeholder="Question text"
                  value={manualQ}
                  onChange={(e) => setManualQ(e.target.value)}
                  rows={3}
                />
                {manualOpts.map((opt, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="radio"
                      checked={manualCorrect === i}
                      onChange={() => setManualCorrect(i)}
                      style={{ width: "auto", margin: 0 }}
                    />
                    <input
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={(e) => {
                        const c = [...manualOpts]; c[i] = e.target.value; setManualOpts(c);
                      }}
                    />
                  </div>
                ))}
                <button className="btn-secondary" onClick={addManualQuestion} style={{ marginTop: 8 }}>
                  + Add Question
                </button>
              </>
            )}

            {/* Preview */}
            {questions.length > 0 && (
              <>
                <hr />
                <h3>Preview ({questions.length} questions)</h3>
                {questions.map((q, i) => (
                  <div key={i} style={{ background: "#f9fafb", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                    <p style={{ fontWeight: 600, margin: "0 0 6px 0" }}>Q{i + 1}. {q.question}</p>
                    <ul style={{ margin: 0 }}>
                      {q.options.map((o, j) => (
                        <li key={j} style={{ color: j === q.correctAnswer ? "#10b981" : "#374151" }}>
                          {j === q.correctAnswer ? "✅ " : ""}{o}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <button className="btn-launch" onClick={handleLaunchQuiz}>
                  🚀 Launch Quiz to Room
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
