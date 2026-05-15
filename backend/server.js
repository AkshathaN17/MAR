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
const DB_URI = process.env.DB_URI || process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

if (!DB_URI) {
  console.error("❌ ERROR: DB_URI is not defined. Set DB_URI (Atlas connection string) in .env or environment variables.");
  process.exit(1);
}

const mongooseOptions = {
  dbName: DB_NAME || "mar",

  autoIndex: process.env.NODE_ENV !== "production",

  // SSL/TLS Fix
  tls: true,
  tlsAllowInvalidCertificates: true,
};

mongoose.connect(DB_URI, mongooseOptions)
  .then(() => {
    console.log("✅ INFO: Connected to MongoDB Atlas");
  })
  .catch((err) => {
    console.error("❌ ERROR: MongoDB Atlas connection error:");
    console.error(err);
  });
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

/** IST calendar date string (same as upload-video pipeline). */
function istDateStringForResult() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    .toISOString()
    .split("T")[0];
}

/**
 * Persist dominant emotion to MongoDB Result — same fields as upload-video
 * completion (Result.create).
 */
async function saveLiveEmotionResultToMongo({ studentId, section, course, dominant_emotion }) {
  if (dominant_emotion == null || dominant_emotion === "") {
    return;
  }
  const istDate = istDateStringForResult();
  await Result.create({
    sid: Number(studentId),
    section,
    subject: course,
    emotion: dominant_emotion,
    date: istDate,
  });
  console.log("✅ LIVE RESULT SAVED TO DB:", dominant_emotion);
}

// =======================
// Live recording → Mongo (same Result row shape as upload-video)
// =======================
app.post("/realtime/live-result-mongo", async (req, res) => {
  try {
    const { studentId, section, course, dominant_emotion } = req.body || {};
    if (!studentId || !section || !course || dominant_emotion == null || dominant_emotion === "") {
      return res.status(400).json({
        error: "Missing studentId, section, course, or dominant_emotion",
      });
    }
    await saveLiveEmotionResultToMongo({
      studentId,
      section,
      course,
      dominant_emotion,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ ERROR: Live Mongo result save failed:", err);
    res.status(500).json({ error: "Failed to save result", details: err.message });
  }
});

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
// Students API
// =======================
app.get("/api/students", async (req, res) => {
  const { section } = req.query;
  try {
    const query = section ? { section } : {};
    const studentList = await Student.find(query).select("sid name section subject -_id");
    res.json(studentList);
  } catch (err) {
    console.error("❌ ERROR: Fetching students failed:", err);
    res.status(500).json({ message: "Error fetching students", details: err.message });
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
// Breakout Rooms
// =======================

/**
 * breakoutRooms[emotion] = {
 *   active: boolean,
 *   section: string,
 *   subject: string,
 *   students: [{ sid, name }],
 *   activity: null | { type, questions, currentQuestionIndex, responses }
 * }
 */
const breakoutRooms = {};

const EMOTIONS = ["neutral", "interested", "bored", "confused", "frustrated"];

// GET /api/breakout/students/:emotion?section=&subject=
// Returns the list of students whose most-recent Result has this emotion.
app.get("/api/breakout/students/:emotion", async (req, res) => {
  const { emotion } = req.params;
  const { section, subject } = req.query;

  if (!section || !subject) {
    return res.status(400).json({ error: "Missing section or subject" });
  }

  try {
    // For each student in this section, find their most-recent Result record
    const latestPerStudent = await Result.aggregate([
      { $match: { section, subject } },
      { $sort: { date: -1, _id: -1 } },
      {
        $group: {
          _id: "$sid",
          emotion: { $first: "$emotion" },
        },
      },
      { $match: { emotion } },
    ]);

    const sids = latestPerStudent.map((r) => r._id);

    // Look up names from Student collection
    const studentDocs = await Student.find({ sid: { $in: sids } }).select(
      "sid name section -_id"
    );

    res.json(studentDocs);
  } catch (err) {
    console.error("❌ ERROR: breakout/students failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/breakout/launch/:emotion
// Teacher launches a breakout room for the given emotion.
app.post("/api/breakout/launch/:emotion", async (req, res) => {
  const { emotion } = req.params;
  const { section, subject } = req.body;

  if (!EMOTIONS.includes(emotion)) {
    return res.status(400).json({ error: "Invalid emotion" });
  }

  try {
    // Resolve students with this emotion
    const latestPerStudent = await Result.aggregate([
      { $match: { section, subject } },
      { $sort: { date: -1, _id: -1 } },
      { $group: { _id: "$sid", emotion: { $first: "$emotion" } } },
      { $match: { emotion } },
    ]);

    const sids = latestPerStudent.map((r) => r._id);
    const studentDocs = await Student.find({ sid: { $in: sids } }).select(
      "sid name -_id"
    );

    breakoutRooms[emotion] = {
      active: true,
      section,
      subject,
      students: studentDocs,
      activity: null,
    };

    console.log(
      `✅ Breakout room launched for [${emotion}] — ${studentDocs.length} students`
    );
    res.json({ success: true, students: studentDocs });
  } catch (err) {
    console.error("❌ ERROR: breakout/launch failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/breakout/status/:emotion
// Teacher / student polls whether this room is active.
app.get("/api/breakout/status/:emotion", (req, res) => {
  const { emotion } = req.params;
  const room = breakoutRooms[emotion];
  res.json({ active: room?.active === true });
});

// GET /api/breakout/my-room?studentId=&section=&subject=
// Student polls to check if they have been invited to any breakout room.
app.get("/api/breakout/my-room", async (req, res) => {
  const { studentId, section, subject } = req.query;

  if (!studentId || !section || !subject) {
    return res.json({ active: false });
  }

  try {
    // Find student's most recent emotion
    const latest = await Result.findOne(
      { sid: Number(studentId), section, subject },
      {},
      { sort: { date: -1, _id: -1 } }
    );

    if (!latest) return res.json({ active: false });

    const emotion = latest.emotion;
    const room = breakoutRooms[emotion];

    if (!room || !room.active) return res.json({ active: false });

    // Confirm this student is in the room's student list
    const inRoom = room.students.some((s) => s.sid === Number(studentId));
    if (!inRoom) return res.json({ active: false });

    res.json({ active: true, emotion });
  } catch (err) {
    console.error("❌ ERROR: breakout/my-room failed:", err);
    res.json({ active: false });
  }
});

// POST /api/breakout/:emotion/activity
// Teacher launches a quiz inside the breakout room.
app.post("/api/breakout/:emotion/activity", (req, res) => {
  const { emotion } = req.params;
  const room = breakoutRooms[emotion];

  if (!room || !room.active) {
    return res.status(400).json({ error: "Breakout room not active" });
  }

  room.activity = { ...req.body, responses: {}, currentQuestionIndex: 0 };
  res.json({ success: true, activity: room.activity });
});

// GET /api/breakout/:emotion/activity
// Teacher/student polls for the current quiz in this room.
app.get("/api/breakout/:emotion/activity", (req, res) => {
  const { emotion } = req.params;
  const room = breakoutRooms[emotion];
  res.json(room?.activity ?? null);
});

// POST /api/breakout/:emotion/activity/submit
// Student submits a quiz answer in the breakout room.
app.post("/api/breakout/:emotion/activity/submit", (req, res) => {
  const { emotion } = req.params;
  const { studentName, questionIndex, answer } = req.body;
  const room = breakoutRooms[emotion];

  if (!room || !room.active || !room.activity) {
    return res.status(400).json({ error: "No active breakout activity" });
  }

  if (!room.activity.responses[studentName]) {
    room.activity.responses[studentName] = { answers: [], xp: 0 };
  }

  room.activity.responses[studentName].answers[questionIndex] = answer;
  const correct =
    answer === room.activity.questions[questionIndex].correctAnswer;
  room.activity.responses[studentName].xp += correct ? 10 : 2;

  res.json({ success: true });
});

// POST /api/breakout/:emotion/activity/next
// Teacher advances to the next question in the breakout quiz.
app.post("/api/breakout/:emotion/activity/next", (req, res) => {
  const { emotion } = req.params;
  const room = breakoutRooms[emotion];

  if (!room || !room.activity) {
    return res.status(400).json({ error: "No active breakout activity" });
  }

  if (
    room.activity.currentQuestionIndex <
    room.activity.questions.length - 1
  ) {
    room.activity.currentQuestionIndex++;
  }

  res.json(room.activity);
});

// POST /api/breakout/:emotion/end
// Teacher ends the breakout room.
app.post("/api/breakout/:emotion/end", (req, res) => {
  const { emotion } = req.params;
  if (breakoutRooms[emotion]) {
    breakoutRooms[emotion].active = false;
    breakoutRooms[emotion].activity = null;
  }
  res.json({ success: true });
});

// GET /api/breakout/all-status?section=&subject=
// Teacher polls status of all emotion rooms at once.
app.get("/api/breakout/all-status", (req, res) => {
  const status = {};
  EMOTIONS.forEach((e) => {
    status[e] = breakoutRooms[e]?.active === true;
  });
  res.json(status);
});

// =======================
// Start Server (HTTP + WebSocket for live recording relay)
// =======================
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/realtime/ws" });
attachRealtimeWebSocket(wss);

server.listen(5000, () => {
  console.log("ℹ️  INFO: Backend running on http://localhost:5000");
  console.log("ℹ️  INFO: Realtime WebSocket: ws://localhost:5000/realtime/ws");
});
