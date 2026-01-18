import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useGamification } from "../../context/GamificationContext";

const API = "http://localhost:5000/api";

export default function LaunchQuiz() {
  const navigate = useNavigate();
  const { launchActivity } = useGamification();

  const user = JSON.parse(localStorage.getItem("user"));
  const section = localStorage.getItem("selectedSection");

  // 🔐 Safety guards
  if (!user || user.role !== "teacher") {
    navigate("/login");
    return null;
  }

  if (!section) {
    alert("No section selected. Please go back to dashboard.");
    navigate("/teacher/dashboard");
    return null;
  }

  // 🔁 Mode toggle
  const [mode, setMode] = useState("manual"); // manual | gemini

  // 📦 Common state
  const [questions, setQuestions] = useState([]);

  // ✍️ Manual quiz state
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState(null);

  // 🤖 Gemini quiz state
  const [topic, setTopic] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState("medium");
  const [loading, setLoading] = useState(false);

  // ➕ Add manual question
  const addQuestion = () => {
    if (!question || options.some(o => o === "") || correctAnswer === null) {
      alert("Please fill all fields");
      return;
    }

    setQuestions([
      ...questions,
      { question, options, correctAnswer }
    ]);

    setQuestion("");
    setOptions(["", "", "", ""]);
    setCorrectAnswer(null);
  };

  // 🤖 Generate quiz via Gemini
  const generateWithGemini = async () => {
    if (loading) return; // prevent duplicate clicks

    if (!topic) {
      alert("Enter a topic");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, numQuestions, difficulty }),
      });

      const data = await res.json();

      if (!Array.isArray(data.questions)) {
        alert("Gemini failed to generate quiz. Try again.");
        return;
      }

      // 🔁 Replace existing questions
      setQuestions([...data.questions]);

    } catch (err) {
      alert("Failed to generate quiz");
    } finally {
      setLoading(false);
    }
  };

  // 🚀 Launch quiz for selected section
  const launchQuiz = () => {
    if (questions.length === 0) {
      alert("No questions to launch");
      return;
    }

    launchActivity({
      type: "quiz",
      section,
      currentQuestionIndex: 0,
      questions,
      responses: {},
    });

    navigate("/teacher/gamification");
  };

  return (
    <>
      <Navbar title="Launch Quiz" onLogout={() => navigate("/login")} />

      <div className="panel">
        <h2>Create Quiz for Section {section}</h2>

        {/* 🔄 MODE TOGGLE */}
        <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
          <label>
            <input
              type="radio"
              checked={mode === "manual"}
              onChange={() => setMode("manual")}
            />{" "}
            Manual
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "gemini"}
              onChange={() => setMode("gemini")}
            />{" "}
            Gemini AI
          </label>
        </div>

        <hr />

        {/* ✍️ MANUAL MODE */}
        {mode === "manual" && (
          <>
            <textarea
              placeholder="Enter question"
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />

            {options.map((opt, idx) => (
              <div key={idx}>
                <input
                  type="radio"
                  checked={correctAnswer === idx}
                  onChange={() => setCorrectAnswer(idx)}
                />
                <input
                  type="text"
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={e => {
                    const copy = [...options];
                    copy[idx] = e.target.value;
                    setOptions(copy);
                  }}
                />
              </div>
            ))}

            <button className="btn-primary" onClick={addQuestion}>
              Add Question
            </button>
          </>
        )}

        {/* 🤖 GEMINI MODE */}
        {mode === "gemini" && (
          <>
            <input
              placeholder="Topic (e.g. Nouns in English Grammar)"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />

            <label>Number of Questions</label>
            <input
              type="number"
              min="1"
              max="10"
              value={numQuestions}
              onChange={e => setNumQuestions(Number(e.target.value))}
            />

            <label>Difficulty</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            <button
              className="btn-primary"
              disabled={loading}
              onClick={generateWithGemini}
            >
              {loading ? "Generating..." : "Generate Quiz"}
            </button>
          </>
        )}

        <hr />

        {/* 👀 PREVIEW */}
        <h3>Questions Preview ({questions?.length || 0})</h3>

        {questions.length === 0 && <p>No questions yet</p>}

        {questions.map((q, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #ddd",
              padding: "12px",
              marginBottom: "12px",
              borderRadius: "8px",
            }}
          >
            <p>
              <strong>Q{i + 1}.</strong> {q.question}
            </p>

            <ul>
              {q.options.map((opt, idx) => (
                <li key={idx}>
                  {idx === q.correctAnswer ? "✅ " : ""}
                  {opt}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <button className="btn-primary" onClick={launchQuiz}>
          Launch Quiz
        </button>
      </div>
    </>
  );
}
