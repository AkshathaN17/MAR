# Multi-Modal Affect Analysis System

A complete **client-server system** for real-time affect analysis in remote learning environments. The system fuses **gaze** and **posture** cues using **decision-level fusion** to infer student emotions, aggregates data across students, and provides classroom-level analytics.

## Features

- **Client-Side Inference**: Real-time gaze and posture analysis using pre-trained CNNs
- **Decision-Level Fusion**: Config-driven weighted majority voting for emotion inference
- **Temporal Smoothing**: Sliding-window smoothing for robust predictions
- **HTTP Client-Server**: RESTful API for data ingestion and analytics
- **Aggregation & Analytics**: Window → Student → Classroom aggregation pipeline
- **Type-Safe Schemas**: Pydantic schemas for validation across the system
- **Research-Grade**: Clean, modular, explainable architecture

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT SIDE                            │
├─────────────────────────────────────────────────────────────┤
│  Video Input → Frame Sampling → Inference (Parallel)      │
│       ↓              ↓              ↓                       │
│  Gaze CNN+SVM    Posture CNN    Temporal Smoothing        │
│       ↓              ↓              ↓                       │
│  Cue→Affect Mapping → Fusion Engine → HTTP Client         │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│                    SERVER SIDE                            │
├─────────────────────────────────────────────────────────────┤
│  FastAPI Endpoints → Validation (Pydantic)                │
│       ↓                                                      │
│  Storage Service → Aggregation Service → Analytics Service │
│       ↓                                                      │
│  JSON Persistence (Window/Student/Classroom)               │
└─────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
MAR/
├── client/                          # Client-side pipeline
│   ├── preprocessing/
│   │   ├── frame_sampler.py         # Frame sampling (no disk saving)
│   │   └── face_body_detector.py    # MediaPipe detection (optional)
│   ├── inference/
│   │   ├── gaze_inference.py        # Gaze CNN + SVM inference
│   │   └── posture_inference.py    # Posture CNN inference
│   ├── temporal/
│   │   └── temporal_smoothing.py   # Sliding-window smoothing
│   ├── fusion/
│   │   ├── cue_to_affect.py         # Cue → emotion mapping
│   │   ├── fusion_engine.py         # Decision-level fusion
│   │   ├── weighted_voting.py       # Voting implementation
│   │   └── fusion_config.json       # Fusion configuration
│   ├── packaging/
│   │   └── data_packager.py         # JSON payload builder
│   ├── network/
│   │   └── http_client.py           # HTTP client with retry logic
│   └── run_client_pipeline.py       # Main pipeline runner
│
├── server/                          # Server-side API & services
│   ├── main.py                      # FastAPI application
│   ├── services/
│   │   ├── aggregation.py           # Window→Student→Classroom aggregation
│   │   └── analytics.py             # Analytics computation
│   └── persistence/
│       └── storage.py              # JSON file storage
│
├── shared/                          # Shared schemas
│   └── schemas.py                   # Pydantic schemas
│
├── models/                          # Trained models (inference only)
│   ├── gaze_cnn.pt
│   ├── gaze_svm.joblib
│   ├── posture_cnn.pt
│   └── posture_class_map.json
│
├── training/                        # Training scripts (DO NOT MODIFY)
│   ├── train_gaze.py
│   ├── train_posture.py
│   └── load_dataset.py
│
├── outputs/                         # Generated outputs
│   ├── client_jsons/                # Client-side JSONs
│   └── server/                      # Server-side storage
│       ├── windows/                  # Per-window data
│       ├── sessions/                 # Per-session data
│       ├── students/                 # Per-student summaries
│       └── classrooms/               # Per-classroom aggregates
│
├── requirements.txt                 # Python dependencies
└── README.md                        # This file
```

---

## 1. Shared Schemas (Pydantic)

All data structures are validated using Pydantic schemas in `shared/schemas.py`:

### 1.1. CueOutput
Schema for a single cue's inference output:
```python
{
    "cue": "gaze",
    "timestamp_sec": 40,
    "prediction": "looking_at_screen",
    "confidence": 0.92,
    "quality": "good",
    "emotion_distribution": {...},  # Optional
    "mapping_quality": "mapped"      # Optional
}
```

### 1.2. FusionOutput
Schema for decision-level fusion result:
```python
{
    "timestamp_sec": 40,
    "final_emotion": "interested",
    "confidence": 0.51,
    "emotion_scores": {...},
    "contributing_cues": ["gaze", "posture"],
    "fusion_type": "weighted_majority_voting"
}
```

### 1.3. WindowPayload
Schema for per-window streaming payload:
```python
{
    "type": "window_update",
    "class_id": "CS101",
    "student_id": "student_001",
    "session_id": "session_2025_01_01",
    "timestamp_sec": 40,
    "emotion": "interested",
    "confidence": 0.51,
    "emotion_scores": {...},
    "fusion_type": "weighted_majority_voting"
}
```

### 1.4. SessionPayload
Schema for end-of-session summary:
```python
{
    "type": "session_final",
    "class_id": "CS101",
    "student_id": "student_001",
    "session_id": "session_2025_01_01",
    "duration_sec": 350,
    "total_windows": 15,
    "emotion_distribution": {...},
    "dominant_emotion": "interested",
    "ended_at": 1704067200
}
```

### 1.5. ClassroomAnalytics
Schema for classroom-level analytics:
```python
{
    "class_id": "CS101",
    "total_students": 25,
    "total_sessions": 25,
    "total_windows": 375,
    "emotion_distribution": {...},
    "dominant_emotion": "interested",
    "student_summaries": [...],
    "temporal_trends": [...],
    "generated_at": "2025-01-01T12:00:00"
}
```

---

## 2. Client-Side Pipeline

### 2.1. Fusion Configuration

The fusion layer is configured via `client/fusion/fusion_config.json`:

```json
{
  "emotions": ["interested", "bored", "confused", "frustrated", "neutral"],
  "cue_weights": {
    "gaze": 0.6,
    "posture": 0.4
  },
  "confidence_threshold": 0.25,
  "cue_to_emotion": {
    "gaze": {
      "looking_at_screen": {
        "interested": 0.7,
        "confused": 0.2,
        "neutral": 0.1
      },
      "looking_away": {
        "bored": 0.6,
        "frustrated": 0.3,
        "neutral": 0.1
      }
    },
    "posture": {
      "sitting_upright": {"interested": 0.7, "neutral": 0.3},
      "writing": {"interested": 0.8, "neutral": 0.2},
      "hands_on_face": {"confused": 0.6, "frustrated": 0.2, "neutral": 0.2},
      "slouching": {"bored": 0.6, "frustrated": 0.2, "neutral": 0.2}
    }
  }
}
```

### 2.2. Fusion Formula

For each emotion \(e\), the fusion score is:

\[
\text{score}(e) = \sum_{\text{cue}} w_{\text{cue}} \times \text{conf}_{\text{cue}} \times P(e \mid \text{cue})
\]

Where:
- \(w_{\text{cue}}\) = cue weight from config
- \(\text{conf}_{\text{cue}}\) = cue confidence
- \(P(e \mid \text{cue})\) = emotion probability from `cue_to_emotion`

Final emotion = `argmax(score(e))`

### 2.3. Pipeline Flow

1. **Frame Sampling**: Extract frames every 20 seconds (configurable)
2. **Parallel Inference**: Gaze and posture inference run concurrently
3. **Temporal Smoothing**: Sliding-window majority voting
4. **Cue→Affect Mapping**: Map predictions to emotion distributions
5. **Fusion**: Weighted majority voting
6. **Packaging**: Build JSON payloads
7. **HTTP Transmission**: Send to server (optional)

---

## 3. Network Layer (HTTP Client)

### 3.1. AffectAnalysisClient

Located in `client/network/http_client.py`:

```python
from client.network.http_client import AffectAnalysisClient

client = AffectAnalysisClient(
    base_url="http://localhost:8000",
    max_retries=3,
    timeout=10
)

# Send window update
client.send_window(window_payload, validate=True)

# Send session summary
client.send_session(session_payload, validate=True)

# Health check
if client.health_check():
    print("Server is reachable")
```

### 3.2. Features

- **Automatic Retry**: Exponential backoff for failed requests
- **Validation**: Optional Pydantic schema validation
- **Error Handling**: Comprehensive logging and error reporting
- **Health Check**: Server connectivity verification

---

## 4. Server Layer (FastAPI)

### 4.1. Endpoints

#### POST `/ingest/window`
Receive per-window streaming data.

**Request Body**: `WindowPayload`

**Response**:
```json
{
  "status": "success",
  "message": "Window data ingested",
  "timestamp_sec": 40
}
```

#### POST `/ingest/session`
Receive end-of-session batch data.

**Request Body**: `SessionPayload`

**Response**:
```json
{
  "status": "success",
  "message": "Session data ingested",
  "session_id": "session_2025_01_01"
}
```

#### GET `/analytics/classroom/{classroom_id}`
Get aggregated classroom analytics.

**Response**: `ClassroomAnalytics`

**Example**:
```bash
curl http://localhost:8000/analytics/classroom/CS101
```

#### GET `/health`
Health check endpoint.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00"
}
```

### 4.2. Running the Server

```bash
# From project root
python -m server.main

# Or with uvicorn directly
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

The server will:
- Validate all incoming data using Pydantic schemas
- Store data in structured JSON files
- Trigger aggregation automatically
- Provide analytics endpoints

---

## 5. Aggregation & Analytics Services

### 5.1. Aggregation Service

**Location**: `server/services/aggregation.py`

**Functions**:
- `aggregate_student_session()`: Window → Student aggregation
- `aggregate_classroom()`: Student → Classroom aggregation

**Process**:
1. Load all windows for a student session
2. Compute emotion distribution
3. Calculate average confidence
4. Identify dominant emotion
5. Save student summary

### 5.2. Analytics Service

**Location**: `server/services/analytics.py`

**Functions**:
- `compute_classroom_analytics()`: Comprehensive classroom analytics

**Outputs**:
- Aggregated emotion distributions
- Per-student summaries
- Temporal trends over time
- Dominant classroom emotion

---

## 6. Persistence Layer

### 6.1. Storage Service

**Location**: `server/persistence/storage.py`

**Storage Structure**:
```
outputs/server/
├── windows/
│   └── {class_id}/
│       └── {student_id}/
│           └── window_{timestamp}.json
├── sessions/
│   └── {class_id}/
│       └── {student_id}/
│           └── {session_id}.json
├── students/
│   └── {class_id}/
│       └── {student_id}/
│           └── {session_id}.json
└── classrooms/
    └── {class_id}.json
```

### 6.2. Data Organization

- **Windows**: Individual time-window records
- **Sessions**: End-of-session summaries
- **Students**: Aggregated student summaries
- **Classrooms**: Aggregated classroom statistics

All data is stored as **structured JSON** files, making it:
- Dashboard-ready
- Easy to query
- Research-friendly

---

## 7. Installation & Setup

### 7.1. Prerequisites

- Python 3.10+
- Trained model files in `models/` directory

### 7.2. Install Dependencies

```bash
pip install -r requirements.txt
```

**Key Dependencies**:
- `torch` - PyTorch for CNN inference
- `scikit-learn` - SVM inference
- `opencv-python` - Video processing
- `mediapipe` - Face/body detection
- `pydantic` - Schema validation
- `fastapi` - API server
- `uvicorn` - ASGI server
- `requests` - HTTP client

### 7.3. Model Files

Ensure these files exist:
- `models/gaze_cnn.pt`
- `models/gaze_svm.joblib`
- `models/posture_cnn.pt`
- `models/posture_class_map.json`

---

## 8. Testing the System

### 8.1. Step 1: Start the Server

**Terminal 1**:
```bash
# Start FastAPI server
python -m server.main

# Server will start at http://localhost:8000
# You should see:
# INFO:     Started server process
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
```

**Verify server is running**:
```bash
curl http://localhost:8000/health
# Expected: {"status":"healthy","timestamp":"..."}
```

### 8.2. Step 2: Run Client Pipeline

**Terminal 2**:
```bash
# Run client pipeline (with network enabled)
python -m client.run_client_pipeline

# Or disable network (local-only mode)
ENABLE_NETWORK=false python -m client.run_client_pipeline
```

**What happens**:
1. Video is processed frame-by-frame (every 20 seconds)
2. Gaze and posture inference run in parallel
3. Temporal smoothing is applied
4. Fusion computes final emotions
5. Window payloads are sent to server (if enabled)
6. Session summary is sent at the end (if enabled)
7. Local JSON files are saved to `outputs/client_jsons/`

**Expected Output**:
```
Connected to server: http://localhost:8000
[   0s] Emotion=interested Conf=0.51
[  20s] Emotion=interested Conf=0.48
[  40s] Emotion=bored Conf=0.35
...
Session complete.
Final dominant emotion: interested
```

### 8.3. Step 3: Verify Data Ingestion

**Check server logs** (Terminal 1):
```
INFO: Window ingested: class=CS101, student=student_001, timestamp=0
INFO: Window ingested: class=CS101, student=student_001, timestamp=20
...
INFO: Session ingested: class=CS101, student=student_001, session=session_2025_01_01
```

**Check stored data**:
```bash
# List stored windows
ls -R outputs/server/windows/

# View a window file
cat outputs/server/windows/CS101/student_001/window_000000.json

# View session summary
cat outputs/server/sessions/CS101/student_001/session_2025_01_01.json

# View student summary
cat outputs/server/students/CS101/student_001/session_2025_01_01.json

# View classroom aggregate
cat outputs/server/classrooms/CS101.json
```

### 8.4. Step 4: Query Analytics

**Get classroom analytics**:
```bash
curl http://localhost:8000/analytics/classroom/CS101 | python -m json.tool
```

**Expected Response**:
```json
{
  "class_id": "CS101",
  "total_students": 1,
  "total_sessions": 1,
  "total_windows": 15,
  "emotion_distribution": {
    "interested": 0.6,
    "bored": 0.1,
    "confused": 0.1,
    "frustrated": 0.05,
    "neutral": 0.15
  },
  "dominant_emotion": "interested",
  "student_summaries": [...],
  "temporal_trends": [...],
  "generated_at": "2025-01-01T12:00:00"
}
```

### 8.5. Step 5: Test with Multiple Students

**Simulate multiple students**:

```python
# test_multiple_students.py
from client.run_client_pipeline import run_pipeline
import os

# Student 1
os.environ["STUDENT_ID"] = "student_001"
os.environ["SESSION_ID"] = "session_001"
run_pipeline("data/video1.mp4")

# Student 2
os.environ["STUDENT_ID"] = "student_002"
os.environ["SESSION_ID"] = "session_002"
run_pipeline("data/video2.mp4")

# Query classroom analytics
import requests
response = requests.get("http://localhost:8000/analytics/classroom/CS101")
print(response.json())
```

### 8.6. Step 6: Test Error Handling

**Test server offline**:
```bash
# Stop server, then run client
ENABLE_NETWORK=true python -m client.run_client_pipeline

# Expected: Warning message, continues without network
# Local JSON files still saved
```

**Test invalid payload**:
```python
# test_invalid_payload.py
import requests

# Send invalid payload
response = requests.post(
    "http://localhost:8000/ingest/window",
    json={"invalid": "data"}
)
print(response.status_code)  # Expected: 422 (validation error)
print(response.json())
```

---

## 9. API Reference

### 9.1. Client APIs

#### `FrameSampler`
```python
sampler = FrameSampler(video_path, interval_sec=20)
for frame, timestamp_sec in sampler:
    # Process frame
```

#### `GazeInference`
```python
gaze = GazeInference("models/gaze_cnn.pt", "models/gaze_svm.joblib")
result = gaze.infer(frame, timestamp_sec)
```

#### `PostureInference`
```python
posture = PostureInference("models/posture_cnn.pt", "models/posture_class_map.json")
result = posture.infer(frame, timestamp_sec)
```

#### `TemporalSmoother`
```python
smoother = TemporalSmoother(window_size=3)
smoothed = smoother.update(cue_output)
```

#### `FusionEngine`
```python
engine = FusionEngine("client/fusion/fusion_config.json")
fusion_result = engine.fuse(cues={"gaze": ..., "posture": ...}, timestamp_sec=40)
```

#### `AffectAnalysisClient`
```python
client = AffectAnalysisClient(base_url="http://localhost:8000")
client.send_window(window_payload)
client.send_session(session_payload)
```

### 9.2. Server APIs

#### POST `/ingest/window`
- **Content-Type**: `application/json`
- **Body**: `WindowPayload` schema
- **Status Codes**: 201 (success), 422 (validation error), 500 (server error)

#### POST `/ingest/session`
- **Content-Type**: `application/json`
- **Body**: `SessionPayload` schema
- **Status Codes**: 201 (success), 422 (validation error), 500 (server error)

#### GET `/analytics/classroom/{classroom_id}`
- **Response**: `ClassroomAnalytics` schema
- **Status Codes**: 200 (success), 404 (not found), 500 (server error)

#### GET `/health`
- **Response**: `{"status": "healthy", "timestamp": "..."}`
- **Status Code**: 200

---

## 10. Configuration

### 10.1. Client Configuration

Edit `client/run_client_pipeline.py`:

```python
VIDEO_PATH = "data/sample_video.mp4"
FRAME_INTERVAL_SEC = 20  # Frame sampling interval
OUTPUT_DIR = "outputs/client_jsons"
STUDENT_ID = "student_001"
CLASS_ID = "CS101"
SESSION_ID = "session_2025_01_01"
SERVER_URL = "http://localhost:8000"
ENABLE_NETWORK = True
```

### 10.2. Server Configuration

Edit `server/persistence/storage.py`:

```python
base_dir = "outputs/server"  # Change storage location
```

### 10.3. Fusion Configuration

Edit `client/fusion/fusion_config.json`:

- Adjust `cue_weights` to change cue importance
- Modify `cue_to_emotion` mappings to change semantic interpretations
- Change `confidence_threshold` to filter low-confidence cues

---

## 11. Troubleshooting

### 11.1. Server Not Starting

**Error**: `Address already in use`

**Solution**:
```bash
# Change port
uvicorn server.main:app --port 8001

# Or kill existing process
# Windows: netstat -ano | findstr :8000
# Linux/Mac: lsof -i :8000
```

### 11.2. Model Files Not Found

**Error**: `FileNotFoundError: models/gaze_cnn.pt`

**Solution**: Ensure all model files exist in `models/` directory:
- `gaze_cnn.pt`
- `gaze_svm.joblib`
- `posture_cnn.pt`
- `posture_class_map.json`

### 11.3. Validation Errors

**Error**: `422 Unprocessable Entity`

**Solution**: Check payload structure matches Pydantic schemas:
```python
from shared.schemas import WindowPayload
payload = WindowPayload(**your_dict)  # Will raise ValidationError if invalid
```

### 11.4. Network Connection Issues

**Error**: `Connection refused`

**Solution**:
1. Verify server is running: `curl http://localhost:8000/health`
2. Check firewall settings
3. Verify `SERVER_URL` in client configuration
4. Use `ENABLE_NETWORK=false` to run in local-only mode

---

## 12. Extending the System

### 12.1. Adding New Cues

1. Create inference module in `client/inference/`
2. Add cue to `fusion_config.json`:
   ```json
   "cue_weights": {
     "gaze": 0.5,
     "posture": 0.3,
     "new_cue": 0.2
   }
   ```
3. Add mappings in `cue_to_emotion`
4. Update pipeline to include new cue

### 12.2. Adding New Emotions

1. Update `fusion_config.json`:
   ```json
   "emotions": ["interested", "bored", "confused", "frustrated", "neutral", "excited"]
   ```
2. Update emotion distributions in `cue_to_emotion`
3. Update Pydantic schemas in `shared/schemas.py`

### 12.3. Custom Aggregation Logic

Edit `server/services/aggregation.py`:
- Modify `aggregate_student_session()` for student-level logic
- Modify `aggregate_classroom()` for classroom-level logic

### 12.4. Custom Analytics

Edit `server/services/analytics.py`:
- Add new metrics to `compute_classroom_analytics()`
- Create new endpoint in `server/main.py`

---

## 13. Research Notes

### 13.1. Explainability

Every window JSON includes:
- Raw cue predictions and confidences
- Mapped emotion distributions
- Fusion scores for all emotions
- Contributing cues list

This enables:
- Debugging fusion decisions
- Analyzing cue contributions
- Research into fusion strategies

### 13.2. Determinism

The system is deterministic:
- Same inputs → same outputs
- No randomness in fusion or aggregation
- Reproducible results for research

### 13.3. Modularity

Each component is independent:
- Can swap fusion strategies
- Can change aggregation logic
- Can add new inference modules
- No monolithic dependencies

---

## 14. License & Credits

This system is designed for research purposes. All ML models are inference-only and should not be retrained or modified.

**Technologies Used**:
- PyTorch (inference)
- scikit-learn (SVM inference)
- OpenCV (video processing)
- MediaPipe (detection)
- FastAPI (server)
- Pydantic (validation)

---

## 15. Support

For issues or questions:
1. Check troubleshooting section (Section 11)
2. Review API documentation (Section 9)
3. Inspect server logs for detailed error messages
4. Verify all dependencies are installed correctly

---

**Last Updated**: 2025-01-01
