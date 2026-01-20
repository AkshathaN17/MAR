import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export default function TeacherStats() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const section = localStorage.getItem("selectedSection");

  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  /* 🔐 AUTH GUARD */
  useEffect(() => {
    if (!user || user.role !== "teacher") {
      navigate("/login");
    }
  }, [user, navigate]);

  /* 📊 FETCH STATS */
  useEffect(() => {
    if (!user || user.role !== "teacher" || !section) return;

    const fetchStats = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/results/stats?section=${section}&subject=${user.subject}`
        );

        if (!res.ok) throw new Error("Failed to fetch stats");

        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error(err);
        setError("Could not load statistics");
      }
    };

    fetchStats();
  }, [section, user]);

  /* ✅ MEMOIZED PIE DATA */
  const pieData = useMemo(() => {
    if (!stats) return [];

    return [
      { name: "Interested", value: parseFloat(stats.interested) || 0 },
      { name: "Bored", value: parseFloat(stats.bored) || 0 },
      { name: "Confused", value: parseFloat(stats.confused) || 0 },
      { name: "Frustrated", value: parseFloat(stats.frustrated) || 0 },
      { name: "Neutral", value: parseFloat(stats.neutral) || 0 },
    ];
  }, [stats]);

  if (!user || user.role !== "teacher") return null;

  

  const COLORS = ["#10b981", "#f59e0b", "#fb923c", "#ef4444", "#6b7280"];

  return (
    <div className="page">
      <div className="card">
        <h2>Section {section} Statistics</h2>

        <p className="info">
          <strong>Teacher:</strong> {user.name}
        </p>
        <p className="info">
          <strong>Subject:</strong> {user.subject}
        </p>

        {error && <p className="error">{error}</p>}

        {!stats ? (
          <p>Loading stats...</p>
        ) : (
          <>
            <p className="info">Total Records: {stats.total}</p>

            <h3>Emotion Distribution</h3>

            {/* 🔥 HEIGHT FIX IS HERE */}
            <div style={{ width: "100%", height: 400 }}>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart key={stats.total}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    isAnimationActive={false}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <hr />

            <h3>Detailed Statistics</h3>
            <p className="info">Interested: {stats.interested}%</p>
            <p className="info">Bored: {stats.bored}%</p>
            <p className="info">Confused: {stats.confused}%</p>
            <p className="info">Frustrated: {stats.frustrated}%</p>
            <p className="info">Neutral: {stats.neutral}%</p>
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
