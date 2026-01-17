import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/auth/Login";
import StudentDashboard from "./pages/student/StudentDashboard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import UploadVideo from "./pages/student/UploadVideo";
import TeacherStats from "./pages/teacher/TeacherStats";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/student/dashboard" element={<StudentDashboard />} />
      <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
      <Route path="/student/upload" element={<UploadVideo />} />
      <Route path="/teacher/stats" element={<TeacherStats />} />
    </Routes>
  );
}

export default App;
