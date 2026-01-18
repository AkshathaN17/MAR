import { createContext, useContext, useEffect, useState } from "react";

const GamificationContext = createContext();
const API = "http://localhost:5000/api";

const launchWordCloud = async (prompt, section) => {
  await fetch(`${API}/wordcloud`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, section }),
  });
};

const submitWord = async (studentName, word) => {
  await fetch(`${API}/wordcloud/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentName, word }),
  });
};


export function GamificationProvider({ children }) {
  const [activity, setActivity] = useState(null);

  // 🔄 Poll backend every 2 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`${API}/activity`);
      const data = await res.json();
      setActivity(data);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const launchActivity = async (quiz) => {
    await fetch(`${API}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quiz)
    });
  };

  const submitResponse = async (studentName, qIndex, answer) => {
    await fetch(`${API}/activity/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentName, questionIndex: qIndex, answer })
    });
  };

  const nextQuestion = async () => {
    await fetch(`${API}/activity/next`, { method: "POST" });
  };

  const endActivity = async () => {
    await fetch(`${API}/activity/end`, { method: "POST" });
    
  };

  return (
    <GamificationContext.Provider
      value={{
  activity,
  launchActivity,
  submitResponse,
  nextQuestion,
  endActivity,
  launchWordCloud,
  submitWord
}}

    >
      {children}
    </GamificationContext.Provider>
  );
}

export const useGamification = () => useContext(GamificationContext);
