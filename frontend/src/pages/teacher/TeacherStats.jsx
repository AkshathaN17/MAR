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
import { useBreakout } from "../../context/BreakoutContext";

const EMOTION_META = [
  { key: "interested", label: "Interested", emoji: "🤩", color: "#10b981" },
  { key: "bored",      label: "Bored",      emoji: "😴", color: "#f59e0b" },
  { key: "confused",   label: "Confused",   emoji: "😕", color: "#fb923c" },
  { key: "frustrated", label: "Frustrated", emoji: "😤", color: "#ef4444" },
  { key: "neutral",    label: "Neutral",    emoji: "😐", color: "#6b7280" },
];

export default function TeacherStats() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const section = localStorage.getItem("selectedSection");

  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  const {
    roomStatuses,
    launchBreakoutRoom,
    endBreakoutRoom,
  } = useBreakout();

  const [launching, setLaunching] = useState({}); // { emotion: bool }

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
    return EMOTION_META.map((e) => ({
      name: e.label,
      value: parseFloat(stats[e.key]) || 0,
    }));
  }, [stats]);

  if (!user || user.role !== "teacher") return null;

  /* ── Launch a room ───────────────────────────────────────────────────── */
  const handleLaunch = async (emotion) => {
    setLaunching((p) => ({ ...p, [emotion]: true }));
    try {
      await launchBreakoutRoom(emotion, section, user.subject);
    } finally {
      setLaunching((p) => ({ ...p, [emotion]: false }));
    }
  };

  /* ── End a room ──────────────────────────────────────────────────────── */
  const handleEnd = async (emotion) => {
    await endBreakoutRoom(emotion);
  };

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
          <p>Loading stats…</p>
        ) : (
          <>
            <p className="info">Total Records: {stats.total}</p>

            <h3>Emotion Distribution</h3>

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
                      <Cell key={idx} fill={EMOTION_META[idx].color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <hr />

            <h3>Detailed Statistics &amp; Breakout Rooms</h3>
            <p className="info" style={{ marginBottom: 20 }}>
              Launch a breakout room to send a targeted session invitation to
              students grouped by their most recent emotion.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {EMOTION_META.map((em) => {
                const pct = stats[em.key] ?? "0.0";
                const isActive = roomStatuses[em.key] === true;
                const isLaunching = launching[em.key] === true;

                return (
                  <div key={em.key} className="emotion-row">
                    {/* Left: emotion info */}
                    <div className="emotion-row__info">
                      <span className="emotion-row__emoji">{em.emoji}</span>
                      <div>
                        <div className="emotion-row__label">{em.label}</div>
                        <div
                          className="emotion-row__pct"
                          style={{ color: em.color }}
                        >
                          {pct}%
                        </div>
                      </div>
                      {isActive && (
                        <span className="badge-active">🟢 Active</span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="emotion-row__bar-track">
                      <div
                        className="emotion-row__bar-fill"
                        style={{
                          width: `${Math.min(parseFloat(pct), 100)}%`,
                          background: em.color,
                        }}
                      />
                    </div>

                    {/* Right: action buttons */}
                    <div className="emotion-row__actions">
                      {!isActive ? (
                        <button
                          className="btn-launch"
                          disabled={isLaunching}
                          onClick={() => handleLaunch(em.key)}
                          title={`Send breakout invite to all ${em.label} students`}
                        >
                          {isLaunching ? "⏳ Launching…" : "🚀 Launch Breakout Room"}
                        </button>
                      ) : (
                        <button
                          className="btn-danger-sm"
                          onClick={() => handleEnd(em.key)}
                          title="End this breakout room"
                        >
                          🔴 End Room
                        </button>
                      )}

                      <button
                        className="btn-join"
                        disabled={!isActive}
                        onClick={() =>
                          navigate(`/teacher/breakout/${em.key}`)
                        }
                        title={
                          isActive
                            ? `Join ${em.label} breakout room`
                            : "Launch the room first"
                        }
                      >
                        👥 Join Breakout Room
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <hr />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
    </div>
  );
}
