require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔴 SHARED STATE (acts like DB for now)
let activeActivity = null;

/**
 * TEACHER: Launch quiz
 */
app.post("/api/activity", (req, res) => {
  activeActivity = {
    ...req.body,
    responses: {},
    currentQuestionIndex: 0
  };
  res.json({ success: true, activity: activeActivity });
});

/**
 * STUDENT: Get live activity
 */
app.get("/api/activity", (req, res) => {
  res.json(activeActivity);
});

/**
 * STUDENT: Submit answer
 */
app.post("/api/activity/submit", (req, res) => {
  const { studentName, questionIndex, answer } = req.body;

  if (!activeActivity) {
    return res.status(400).json({ error: "No active activity" });
  }

  if (!activeActivity.responses[studentName]) {
    activeActivity.responses[studentName] = {
      answers: [],
      xp: 0
    };
  }

  activeActivity.responses[studentName].answers[questionIndex] = answer;

  const correct =
    answer ===
    activeActivity.questions[questionIndex].correctAnswer;

  activeActivity.responses[studentName].xp += correct ? 10 : 2;

  res.json({ success: true });
});

/**
 * TEACHER: Next question
 */
app.post("/api/activity/next", (req, res) => {
  if (!activeActivity) {
    return res.status(400).json({ error: "No active activity" });
  }

  if (
    activeActivity.currentQuestionIndex <
    activeActivity.questions.length - 1
  ) {
    activeActivity.currentQuestionIndex++;
  }

  res.json(activeActivity);
});

app.post("/api/generate-quiz", async (req, res) => {
  const { topic, numQuestions, difficulty } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
Generate ${numQuestions} multiple-choice questions for high school students.

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

    // 🔍 DEBUG LOG (VERY IMPORTANT)
    console.log("Gemini raw output:\n", text);

    // 🛡️ SAFELY extract JSON
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]") + 1;

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON array found in Gemini response");
    }

    const cleanJson = text.slice(jsonStart, jsonEnd);
    const questions = JSON.parse(cleanJson);

    res.json({ questions });

  } catch (error) {
    console.error("Gemini quiz generation failed:", error.message);
    res.status(500).json({
      error: "Quiz generation failed",
      details: error.message
    });
  }
});

app.post("/api/wordcloud", (req, res) => {
  const { prompt, section } = req.body;

  activeActivity = {
    type: "wordcloud",
    section,
    prompt,
    responses: {}
  };

  console.log("Wordcloud launched:", activeActivity);

  // 🔑 RETURN SAME STRUCTURE AS /api/activity
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



/**
 * TEACHER: End activity
 */
app.post("/api/activity/end", (req, res) => {
  activeActivity = null;
  res.json({ success: true });
});

app.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});

