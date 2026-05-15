import { createContext, useContext, useEffect, useState, useCallback } from "react";

const BreakoutContext = createContext();
const API = "http://localhost:5000/api";

export function BreakoutProvider({ children }) {
  // ── Student: invite polling ──────────────────────────────────────────────
  const [breakoutInvite, setBreakoutInvite] = useState(null); // { emotion } | null
  const [inviteDismissed, setInviteDismissed] = useState(false);

  // ── Shared: per-emotion activity polling (teacher + student) ─────────────
  const [breakoutActivity, setBreakoutActivity] = useState(null);
  const [watchedEmotion, setWatchedEmotion] = useState(null);

  // ── Teacher: all-room status polling ────────────────────────────────────
  const [roomStatuses, setRoomStatuses] = useState({}); // { neutral: bool, confused: bool, ... }

  // ── Student invite poll (every 3 s) ──────────────────────────────────────
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || user.role !== "student") return;

    const poll = async () => {
      try {
        const course = localStorage.getItem("selectedCourse") || user.subject || "";
        const res = await fetch(
          `${API}/breakout/my-room?studentId=${user.sid}&section=${encodeURIComponent(
            user.section
          )}&subject=${encodeURIComponent(course)}`
        );
        const data = await res.json();
        if (data.active && !inviteDismissed) {
          setBreakoutInvite({ emotion: data.emotion });
        } else if (!data.active) {
          setBreakoutInvite(null);
          setInviteDismissed(false);
        }
      } catch {
        // silently ignore network errors
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [inviteDismissed]);

  // ── Teacher: all-status poll (every 3 s) ─────────────────────────────────
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || user.role !== "teacher") return;

    const poll = async () => {
      try {
        const res = await fetch(`${API}/breakout/all-status`);
        const data = await res.json();
        setRoomStatuses(data);
      } catch {
        // silently ignore
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // ── Per-room activity poll (teacher stats page + student breakout page) ──
  useEffect(() => {
    if (!watchedEmotion) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API}/breakout/${watchedEmotion}/activity`);
        const data = await res.json();
        setBreakoutActivity(data);
      } catch {
        // silently ignore
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [watchedEmotion]);

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Teacher: launch a breakout room for an emotion */
  const launchBreakoutRoom = useCallback(async (emotion, section, subject) => {
    const res = await fetch(`${API}/breakout/launch/${emotion}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, subject }),
    });
    const data = await res.json();
    setRoomStatuses((prev) => ({ ...prev, [emotion]: true }));
    return data;
  }, []);

  /** Teacher: end a breakout room */
  const endBreakoutRoom = useCallback(async (emotion) => {
    await fetch(`${API}/breakout/${emotion}/end`, { method: "POST" });
    setRoomStatuses((prev) => ({ ...prev, [emotion]: false }));
    setBreakoutActivity(null);
  }, []);

  /** Teacher: launch quiz inside breakout room */
  const launchBreakoutActivity = useCallback(async (emotion, quiz) => {
    await fetch(`${API}/breakout/${emotion}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quiz),
    });
  }, []);

  /** Teacher: next question in breakout quiz */
  const nextBreakoutQuestion = useCallback(async (emotion) => {
    await fetch(`${API}/breakout/${emotion}/activity/next`, { method: "POST" });
  }, []);

  /** Student: submit answer in breakout quiz */
  const submitBreakoutResponse = useCallback(
    async (emotion, studentName, qIndex, answer) => {
      await fetch(`${API}/breakout/${emotion}/activity/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName, questionIndex: qIndex, answer }),
      });
    },
    []
  );

  /** Student: dismiss invite popup */
  const dismissInvite = useCallback(() => {
    setInviteDismissed(true);
    setBreakoutInvite(null);
  }, []);

  return (
    <BreakoutContext.Provider
      value={{
        breakoutInvite,
        dismissInvite,
        roomStatuses,
        breakoutActivity,
        watchedEmotion,
        setWatchedEmotion,
        launchBreakoutRoom,
        endBreakoutRoom,
        launchBreakoutActivity,
        nextBreakoutQuestion,
        submitBreakoutResponse,
      }}
    >
      {children}
    </BreakoutContext.Provider>
  );
}

export const useBreakout = () => useContext(BreakoutContext);
