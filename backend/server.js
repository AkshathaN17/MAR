require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const {
  attachRealtimeWebSocket,
  registerRealtimeHttpRoutes,
} = require("./realtimeWs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

registerRealtimeHttpRoutes(app);

// =======================
// MongoDB Connection
// =======================
mongoose.connect("mongodb://localhost:27017/mar")
  .then(() => console.log("ℹ️  INFO: Connected to MongoDB"))
  .catch(err => console.error("❌ ERROR: MongoDB connection error:", err));

// =======================
// Schemas & Models
// =======================

   
const Student = mongoose.model("Student", new mongoose.Schema({
  sid: { type: Number, required: true },
  username: String,
  password: String,
  name: String,
  section: String,
  subject: String
}));

   
const Teacher = mongoose.model("Teacher", new mongoose.Schema({
  tid: { type: Number, required: true },
  username: String,
  password: String,
  name: String,
  subject: String,
  sections: [String],
}));

// 🔴 NOTE: emotion field (NOT result)
const Result = mongoose.model("Result", new mongoose.Schema({
  sid: { type: Number, required: true },
										
				   
  section: String,
  subject: String,
  emotion: String,
  date: String
}));

// =======================
// Login Routes
// =======================
app.post("/login/student", async (req, res) => {
  const { username, password } = req.body;
  try {
    const student = await Student.findOne({ username, password });
    if (!student) return res.status(401).json({ message: "Invalid student credentials" });
    res.json(student);
  } catch (err) {
    console.error("❌ ERROR: Student login failed:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

app.post("/login/teacher", async (req, res) => {
  const { username, password } = req.body;
  try {
    const teacher = await Teacher.findOne({ username, password });
    if (!teacher) return res.status(401).json({ message: "Invalid faculty credentials" });
    res.json(teacher);
  } catch (err) {
    console.error("❌ ERROR: Teacher login failed:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// =======================
// Results Stats Route
// =======================
app.get("/results/stats", async (req, res) => {
  const { section, subject } = req.query;

  try {
    const results = await Result.find({ section, subject });
    const total = results.length;

    if (total === 0) {
      return res.json({
        total: 0,
        neutral: 0,
        interested: 0,
        bored: 0,
        confused: 0,
        frustrated: 0,
      });
    }

    const counts = {
      neutral: results.filter(r => r.emotion === "neutral").length,
      interested: results.filter(r => r.emotion === "interested").length,
      bored: results.filter(r => r.emotion === "bored").length,
      confused: results.filter(r => r.emotion === "confused").length,
      frustrated: results.filter(r => r.emotion === "frustrated").length,
    };

    const stats = {
      total,
      neutral: ((counts.neutral / total) * 100).toFixed(1),
      interested: ((counts.interested / total) * 100).toFixed(1),
      bored: ((counts.bored / total) * 100).toFixed(1),
      confused: ((counts.confused / total) * 100).toFixed(1),
      frustrated: ((counts.frustrated / total) * 100).toFixed(1),
    };

    res.json(stats);
  } catch (err) {
    console.error("❌ ERROR: Fetching stats failed:", err);
    res.status(500).json({ message: "Error fetching stats", details: err.message });
  }
});

// =======================
// File Upload + ML Trigger + SAVE RESULT
// =======================
const UPLOAD_FOLDER = path.join(__dirname, "../data");
fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_FOLDER),
	
 
		 
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
   
});
	 

const upload = multer({ storage });

app.post("/upload-video", upload.single("video"), (req, res) => {
  try {
	 
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  

    const { studentId, section, course } = req.body;
	  
    if (!studentId || !section || !course) {
      return res.status(400).json({ error: "Missing metadata" });
    }

    const videoPath = path.resolve(req.file.path);
    const pythonScriptPath = path.resolve(__dirname, "../client/run_client_pipeline.py");
	
		  
   

    console.log("ℹ️  INFO: Video:", videoPath);
    console.log("ℹ️  INFO: Student:", studentId);

    let pythonOutput = "";

    const pythonProcess = spawn(
      "python",
      ["-u", pythonScriptPath, "--video_path", videoPath, "--student_id", studentId],
      { cwd: path.resolve(__dirname, "..") }
    );

											
    pythonProcess.stdout.on("data", (data) => {
      pythonOutput += data.toString();
      console.log(`ℹ️  PYTHON INFO 1234:\n${data.toString()}`);
    });

														
    pythonProcess.stderr.on("data", (data) => {
      const msg = data.toString();

		  
      if (msg.includes("Traceback") || msg.includes("Error")) {
								
								 
		 
        console.error(`❌ PYTHON ERROR:\n${msg}`);
      } else {
        console.warn(`⚠️  PYTHON WARNING:\n${msg}`);
      }
    });

    pythonProcess.on("close", async (code) => {
      try {
        if (code !== 0) {
          console.error("❌ ERROR: ML pipeline failed");
          return;
        }

        // -------- Extract FINAL RESULT using markers --------
        const startMarker = "###FINAL_RESULT_START###";
        const endMarker = "###FINAL_RESULT_END###";

        const startIndex = pythonOutput.lastIndexOf(startMarker);
        const endIndex = pythonOutput.lastIndexOf(endMarker);

        if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
          console.error("❌ ERROR: Could not extract FINAL_RESULT block");
          return;
        }

        const jsonBlock = pythonOutput
          .slice(startIndex + startMarker.length, endIndex)
          .trim();

        let finalResult;
        try {
          finalResult = JSON.parse(jsonBlock);
        } catch (err) {
          console.error("❌ ERROR: Failed to parse FINAL_RESULT JSON", err);
          return;
        }

        const dominantEmotion = finalResult.dominant_emotion;

        const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
        .toISOString()
        .split("T")[0];

        await Result.create({
          sid: studentId,
          section: section,
          subject: course,
          emotion: dominantEmotion,   // ✅ FIXED FIELD NAME
          date: istDate,
        });

        console.log("✅ RESULT SAVED TO DB:", dominantEmotion);

      } catch (err) {
			  
        console.error("❌ ERROR: Saving ML result failed:", err);
      }
    });

    res.json({
      message: "Video uploaded & ML processing started",
      filename: req.file.filename,
    });

  } catch (err) {
    console.error("❌ ERROR: Video processing failed:", err);
    res.status(500).json({ error: "Video processing failed" });
  }
	  
});

// =======================
// Quiz / Wordcloud APIs
// =======================
let activeActivity = null;

app.post("/api/activity", (req, res) => {
	 
	
	  
  activeActivity = { ...req.body, responses: {}, currentQuestionIndex: 0 };
 
  res.json({ success: true, activity: activeActivity });
});

app.get("/api/activity", (req, res) => {
  res.json(activeActivity);
});

app.post("/api/activity/submit", (req, res) => {
  const { studentName, questionIndex, answer } = req.body;

	  
  if (!activeActivity) return res.status(400).json({ error: "No active activity" });
   

  if (!activeActivity.responses[studentName]) {
    activeActivity.responses[studentName] = { answers: [], xp: 0 };
   
  
   
  }

  activeActivity.responses[studentName].answers[questionIndex] = answer;

	 
  
  const correct = answer === activeActivity.questions[questionIndex].correctAnswer;

  activeActivity.responses[studentName].xp += correct ? 10 : 2;

  res.json({ success: true });
});

app.post("/api/activity/next", (req, res) => {
	  
  if (!activeActivity) return res.status(400).json({ error: "No active activity" });
   

  if (activeActivity.currentQuestionIndex < activeActivity.questions.length - 1) {
		   
    activeActivity.currentQuestionIndex++;
  }

  res.json(activeActivity);
});

// =======================
// Gemini Quiz Generation
// =======================
app.post("/api/generate-quiz", async (req, res) => {
  const { topic, numQuestions, difficulty } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
Generate ${numQuestions} multiple-choice questions.

Topic: ${topic}
Difficulty: ${difficulty}

STRICT RULES:
- Each question must have exactly 4 options
- correctAnswer must be an INTEGER (0,1,2,3)
- DO NOT include markdown
- DO NOT include explanations
- OUTPUT ONLY VALID JSON ARRAY

FORMAT EXACTLY LIKE THIS:

[
  {
    "question": "Question text",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": 1
  }
]
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log("Gemini raw output:\n", text);											  

    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]") + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error("No JSON array found in Gemini response");
    }

    const questions = JSON.parse(text.slice(jsonStart, jsonEnd));
											

    res.json({ questions });

  } catch (error) {
    console.error("❌ ERROR: Gemini quiz generation failed:", error.message);
						  
    res.status(500).json({ error: "Quiz generation failed" });
							
	   
  }
});

// =======================
// Wordcloud APIs
// =======================
app.post("/api/wordcloud", (req, res) => {
  const { prompt, section } = req.body;
  activeActivity = { type: "wordcloud", section, prompt, responses: {} };
					
					  
			
		   
				  
	

													 

  res.json({ success: true, activity: activeActivity });
});

app.post("/api/wordcloud/submit", (req, res) => {
  const { studentName, word } = req.body;

  if (!activeActivity || activeActivity.type !== "wordcloud") {
    return res.status(400).json({ error: "No active word cloud" });
  }

  activeActivity.responses[studentName] = word.toLowerCase();
  res.json({ success: true });
});

app.post("/api/activity/end", (req, res) => {
  activeActivity = null;
  res.json({ success: true });
});

// =======================
// Start Server (HTTP + WebSocket for live recording relay)
// =======================
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/realtime/ws" });
attachRealtimeWebSocket(wss);

server.listen(5000, () => {
  console.log("ℹ️  INFO: Backend running on http://localhost:5000");
  console.log("ℹ️  INFO: Realtime WebSocket at ws://localhost:5000/realtime/ws");
});
