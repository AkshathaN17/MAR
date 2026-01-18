import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useGamification } from "../../context/GamificationContext";

export default function LiveActivity() {
  const navigate = useNavigate();
  const { activity, submitResponse, submitWord } = useGamification();

  const [user, setUser] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [word, setWord] = useState("");

  /* 🔐 Load user */
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);
  }, []);

  /* 🔐 Auth guard */
  useEffect(() => {
    if (user && user.role !== "student") {
      navigate("/login");
    }
  }, [user, navigate]);

  if (!user) {
    return <div style={{ padding: 40 }}>Loading student session…</div>;
  }

  /* ⏳ No activity */
  if (!activity) {
    return (
      <>
        <Navbar title="Live Activity" />
        <div className="panel">
          <h2>No live activity</h2>
          <p>Please wait for your teacher to start an activity.</p>
        </div>
      </>
    );
  }

  /* ❌ Activity for another section */
  if (activity.section !== user.section) {
    return (
      <>
        <Navbar title="Live Activity" />
        <div className="panel">
          <h2>No activity for your section</h2>
        </div>
      </>
    );
  }

  /* ===================== WORD CLOUD ===================== */
  if (activity.type === "wordcloud") {
    const alreadySubmitted = Boolean(activity.responses?.[user.name]);

    const handleSubmitWord = async () => {
      if (!word.trim()) return;
      if (alreadySubmitted) return;

      await submitWord(user.name, word.trim());
      setWord("");
    };

    return (
      <>
        <Navbar title="Live Word Cloud" />
        <div className="panel">
          <h2>{activity.prompt}</h2>

          <input
            placeholder="Enter one word"
            value={word}
            disabled={alreadySubmitted}
            onChange={(e) => setWord(e.target.value)}
          />

          <button
            className="btn-primary"
            disabled={alreadySubmitted}
            onClick={handleSubmitWord}
          >
            {alreadySubmitted ? "Already Submitted" : "Submit"}
          </button>

          {alreadySubmitted && (
            <p style={{ color: "green", marginTop: 10 }}>
              You have already submitted your response.
            </p>
          )}
        </div>
      </>
    );
  }

  /* ===================== QUIZ ===================== */
  if (activity.type === "quiz") {
    const qIndex = activity.currentQuestionIndex;
    const question = activity.questions[qIndex];

    const alreadyAnswered =
      activity.responses?.[user.name]?.answers?.[qIndex] !== undefined;

    const handleSubmitQuiz = () => {
      if (selectedOption === null) {
        alert("Select an option");
        return;
      }
      submitResponse(user.name, qIndex, selectedOption);
    };

    return (
      <>
        <Navbar
          title={`Live Quiz – Question ${qIndex + 1}`}
          onLogout={() => {
            localStorage.clear();
            navigate("/login");
          }}
        />

        <div className="panel">
          <h2>{question.question}</h2>

          {question.options.map((opt, idx) => (
            <div key={idx} style={{ marginBottom: 10 }}>
              <label>
                <input
                  type="radio"
                  disabled={alreadyAnswered}
                  checked={selectedOption === idx}
                  onChange={() => setSelectedOption(idx)}
                />
                {" "}
                {opt}
              </label>
            </div>
          ))}

          {!alreadyAnswered ? (
            <button className="btn-primary" onClick={handleSubmitQuiz}>
              Submit Answer
            </button>
          ) : (
            <p style={{ color: "green" }}>
              Answer submitted. Waiting for next question…
            </p>
          )}
        </div>
      </>
    );
  }

  return null;
}
