import ReactWordcloud from "react-wordcloud";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useGamification } from "../../context/GamificationContext";
import { students } from "../../data/users";

export default function ActivityStats() {
  const navigate = useNavigate();
  const { activity, nextQuestion, endActivity } = useGamification();
  const user = JSON.parse(localStorage.getItem("user"));

  const [viewQuestionIndex, setViewQuestionIndex] = useState(0);
  const [renderCloud, setRenderCloud] = useState(false); // 🔑 KEY FIX

  /* 🔐 Auth guard */
  useEffect(() => {
    if (!user || user.role !== "teacher") {
      navigate("/login");
    }
  }, [user, navigate]);

  /* 🔄 Sync stats with live quiz question */
  useEffect(() => {
    if (activity?.type === "quiz") {
      setViewQuestionIndex(activity.currentQuestionIndex);
    }
  }, [activity?.currentQuestionIndex, activity?.type]);

  /* 🧯 Delay WordCloud rendering to avoid React 19 crash */
  useEffect(() => {
    setRenderCloud(false);
    const t = setTimeout(() => setRenderCloud(true), 100);
    return () => clearTimeout(t);
  }, [activity]);

  if (!activity) {
    return (
      <>
        <Navbar title="Activity Stats" />
        <div className="panel">
          <h2>No active activity</h2>
        </div>
      </>
    );
  }

  /* ===================== WORD CLOUD ===================== */
  /* ===================== WORD CLOUD ===================== */
if (activity.type === "wordcloud") {
  const freq = {};
  Object.values(activity.responses || {}).forEach((word) => {
    freq[word] = (freq[word] || 0) + 1;
  });

  const maxFreq = Math.max(...Object.values(freq), 1);

  return (
    <>
      <Navbar title="Word Cloud Results" />

      <div className="panel">
        <h2>{activity.prompt}</h2>

        {Object.keys(freq).length === 0 && (
          <p>No responses yet</p>
        )}

        {Object.keys(freq).length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "16px",
              padding: "20px",
              border: "1px dashed #ccc",
              borderRadius: "8px",
              minHeight: "200px"
            }}
          >
            {Object.entries(freq).map(([word, count]) => {
              const size =
                16 + (count / maxFreq) * 44; // font scaling

              return (
                <span
                  key={word}
                  style={{
                    fontSize: `${size}px`,
                    fontWeight: "600",
                    color: "#333",
                    transform: `rotate(${Math.random() * 10 - 5}deg)`,
                    userSelect: "none"
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        )}

        <hr />

        <h3>Student Responses</h3>
        <ul>
          {Object.entries(activity.responses || {}).map(
            ([student, word]) => (
              <li key={student}>
                <strong>{student}</strong> → {word}
              </li>
            )
          )}
        </ul>

        <button
          className="btn-primary"
          onClick={() => {
            endActivity();
            navigate("/teacher/dashboard");
          }}
        >
          End Word Cloud
        </button>
      </div>
    </>
  );
}


  /* ===================== QUIZ ===================== */
  if (activity.type === "quiz") {
    const sectionStudents = students.filter(
      (s) => s.section === activity.section
    );

    const responses = activity.responses || {};
    const question = activity.questions[viewQuestionIndex];

    const attemptedStudents = Object.entries(responses).filter(
      ([_, data]) => data.answers?.[viewQuestionIndex] !== undefined
    );

    const correctCount = attemptedStudents.filter(
      ([_, data]) =>
        data.answers[viewQuestionIndex] === question.correctAnswer
    ).length;

    const optionStats = question.options.map((_, idx) =>
      attemptedStudents.filter(
        ([_, data]) => data.answers[viewQuestionIndex] === idx
      ).length
    );

    return (
      <>
        <Navbar title="Live Quiz Statistics" />

        <div className="panel">
          <h2>
            Question {viewQuestionIndex + 1} of {activity.questions.length}
          </h2>
          <p><strong>{question.question}</strong></p>

          <label>View Question:</label>
          <select
            value={viewQuestionIndex}
            onChange={(e) => setViewQuestionIndex(Number(e.target.value))}
          >
            {activity.questions.map((_, idx) => (
              <option key={idx} value={idx}>
                Question {idx + 1}
              </option>
            ))}
          </select>

          <hr />

          <p><strong>Section:</strong> {activity.section}</p>
          <p><strong>Total Students:</strong> {sectionStudents.length}</p>
          <p><strong>Attempted:</strong> {attemptedStudents.length}</p>
          <p><strong>Correct Answers:</strong> {correctCount}</p>

          <h3>Option-wise Distribution</h3>
<ul>
  {question.options.map((opt, idx) => (
    <li key={idx}>
      {opt} → {optionStats[idx]} students
    </li>
  ))}
</ul>

<hr />

{/* 🏆 LEADERBOARD */}
<h3>Leaderboard (XP)</h3>
<table style={{ width: "100%", marginBottom: "20px" }}>
  <thead>
    <tr>
      <th align="left">Student</th>
      <th align="left">XP</th>
    </tr>
  </thead>
  <tbody>
    {Object.entries(responses)
      .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
      .map(([name, data]) => (
        <tr key={name}>
          <td>{name}</td>
          <td>{data.xp || 0}</td>
        </tr>
      ))}
  </tbody>
</table>

<hr />

<div style={{ display: "flex", gap: "12px" }}>

            {activity.currentQuestionIndex <
            activity.questions.length - 1 ? (
              <button className="btn-primary" onClick={nextQuestion}>
                Next Question (Q{activity.currentQuestionIndex + 2})
              </button>
            ) : (
              <button className="btn-primary" disabled>
                Quiz Completed
              </button>
            )}

            <button
              className="btn-secondary"
              onClick={() => {
                endActivity();
                navigate("/teacher/dashboard");
              }}
            >
              End Quiz
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}
