import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Tooltip } from "recharts";

export default function TeacherStats() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const section = localStorage.getItem("selectedSection");

  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  if (!user || user.role !== "teacher") {
    navigate("/login");
    return null;
  }

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/results/stats?section=${section}&subject=${user.subject}`
        );
        if (!res.ok) {
          throw new Error("Failed to fetch stats");
        }
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error(err);
        setError("Could not load statistics");
      }
    };

    fetchStats();
  }, [section, user.subject]);

  return (
    <div className="page">
      <div className="card">
        <h2>Section {section} Statistics</h2>

        <p className="info"><strong>Teacher:</strong> {user.name}</p>
        <p className="info"><strong>Subject:</strong> {user.subject}</p>

        <h3>Performance</h3>

        {error && <p className="error">{error}</p>}
        {!stats ? (
          <p>Loading stats...</p>
        ) : (
          <>
            <p className="info">Total Records: {stats.total}</p>
            
            {/* Emotion Distribution Pie Chart */}
            <h3>Emotion Distribution</h3>
            <div style={{ marginBottom: "24px" }}>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Interested", value: parseFloat(stats.interested) || 0 },
                      { name: "Bored", value: parseFloat(stats.bored) || 0 },
                      { name: "Confused", value: parseFloat(stats.confused) || 0 },
                      { name: "Frustrated", value: parseFloat(stats.frustrated) || 0 },
                      { name: "Neutral", value: parseFloat(stats.neutral) || 0 },
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="#10b981" /> {/* Interested - Green */}
                    <Cell fill="#f59e0b" /> {/* Bored - Amber/Orange */}
                    <Cell fill="#fb923c" /> {/* Confused - Orange */}
                    <Cell fill="#ef4444" /> {/* Frustrated - Red */}
                    <Cell fill="#6b7280" /> {/* Neutral - Gray */}
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <hr />

            <h3>Detailed Statistics</h3>
            <p className="info">Neutral: {stats.neutral}%</p>
            <p className="info">Interested: {stats.interested}%</p>
            <p className="info">Bored: {stats.bored}%</p>
            <p className="info">Confused: {stats.confused}%</p>
            <p className="info">Frustrated: {stats.frustrated}%</p>
          </>
        )}

        <button
          className="secondary"
          onClick={() => navigate("/teacher/dashboard")}
        >
          Back
        </button>
        <button
          className="btn-primary"
          onClick={() => navigate("/teacher/gamification")}
        >
          Enable Gamification
        </button>
	 

      </div>
    </div>
  );
  
}
