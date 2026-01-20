import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function UploadVideo() {
  const navigate = useNavigate();
  const course = localStorage.getItem("selectedCourse");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [file, setFile] = useState(null);
  const [uploaded, setUploaded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "student") {
      navigate("/login");
    }
  }, [user, navigate]);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("video", file);
    formData.append("course", course);
    formData.append("studentId", user.sid);
    formData.append("section", user.section);
    
    try {
      const res = await fetch("http://localhost:5000/upload-video", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setUploaded(true);
      } else {
        alert("Upload failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading file");
    } finally {
      setLoading(false);
    }
  };

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

        <button onClick={handleUpload} disabled={!file || loading}>
          {loading ? "Uploading..." : "Upload"}
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