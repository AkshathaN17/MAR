import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function UploadVideo() {
  const navigate = useNavigate();
  const course = localStorage.getItem("selectedCourse");
  const user = JSON.parse(localStorage.getItem("user"));

  const [file, setFile] = useState(null);
  const [uploaded, setUploaded] = useState(false);

  if (!user || user.role !== "student") {
    navigate("/login");
    return null;
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Upload Video</h2>
  
        <p className="info"><strong>Student:</strong> {user.name}</p>
        <p className="info"><strong>Course:</strong> {course}</p>
  
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files[0])}
        />
  
        <button onClick={() => file && setUploaded(true)}>
          Upload
        </button>
  
        {uploaded && (
          <p className="success">
            "{file.name}" uploaded successfully!
          </p>
        )}
  
        <button
          className="secondary"
          onClick={() => navigate("/student/dashboard")}
        >
          Back
        </button>
      </div>
    </div>
  );
  
}
