import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/auth/Login";
import StudentDashboard from "./pages/student/StudentDashboard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import UploadVideo from "./pages/student/UploadVideo";
import TeacherStats from "./pages/teacher/TeacherStats";
import GamificationHub from "./pages/teacher/GamificationHub";
import LaunchQuiz from "./pages/teacher/LaunchQuiz";
import ActivityStats from "./pages/teacher/ActivityStats";
import LiveActivity from "./pages/student/LiveActivity";
import LaunchWordCloud from "./pages/teacher/LaunchWordCloud";
import BreakoutRoom from "./pages/teacher/BreakoutRoom";
import BreakoutActivity from "./pages/student/BreakoutActivity";
import "./styles/theme.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/student/dashboard" element={<StudentDashboard />} />
      <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
      <Route path="/student/upload" element={<UploadVideo />} />
      <Route path="/teacher/stats" element={<TeacherStats />} />
      <Route path="/teacher/gamification" element={<GamificationHub />} />
      <Route path="/teacher/launch-quiz" element={<LaunchQuiz />} />
      <Route path="/teacher/activity-stats" element={<ActivityStats />} />
      <Route path="/student/activity" element={<LiveActivity />} />
      <Route path="/teacher/launch-wordcloud" element={<LaunchWordCloud />} />
      <Route path="/teacher/breakout/:emotion" element={<BreakoutRoom />} />
      <Route path="/student/breakout-activity" element={<BreakoutActivity />} />
    </Routes>
  );
}

export default App;
