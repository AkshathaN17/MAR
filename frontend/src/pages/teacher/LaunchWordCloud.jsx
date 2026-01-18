import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useGamification } from "../../context/GamificationContext";

export default function LaunchWordCloud() {
  const navigate = useNavigate();
  const { launchWordCloud } = useGamification();
  const section = localStorage.getItem("selectedSection");

  const [prompt, setPrompt] = useState("");

  const launch = () => {
    if (!prompt) {
      alert("Enter a prompt");
      return;
    }

    launchWordCloud(prompt, section);
    navigate("/teacher/gamification");
  };

  return (
    <>
      <Navbar title="Launch Word Cloud" />

      <div className="panel">
        <h2>Word Cloud for Section {section}</h2>

        <textarea
          placeholder="e.g. Describe today's class in one word"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <button className="btn-primary" onClick={launch}>
          Launch Word Cloud
        </button>
      </div>
    </>
  );
}
