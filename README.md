# 💪 FitCoin - Earn While You Burn!

A fitness rep counter app that rewards your workouts with simulated cryptocurrency coins. Track push-ups and sit-ups, hear motivational voice coaching, and watch coins fly into your wallet!

![FitCoin App](https://img.shields.io/badge/Expo-React%20Native-blue) ![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green) ![MongoDB](https://img.shields.io/badge/Database-MongoDB-brightgreen)

## 🎯 Features

### Current Implementation
- **Manual Rep Counter** - Tap to count each rep
- **Auto Counter** - Automatic timed counting with 3-second countdown
- **Live Camera View** - See yourself while working out
- **Coin Rewards** - Earn coins every 5 reps with animations
- **Voice Motivation** - Powerful coach voice every 10 reps
- **Progress Tracking** - Visual progress bar and wallet
- **Exercise Types** - Push-ups and Sit-ups support
- **Count Direction** - Count UP (0→20) or DOWN (20→0)

### Rewards System
- 💰 **Every 5 reps** → Coin sound + flying coin animation
- 🎤 **Every 10 reps** → Voice motivation ("BEAST MODE!", "CRUSHING IT!")
- 🏆 **Workout complete** → "YOU'RE A CHAMPION!" + bonus coins

## 📱 Screenshots

| Home | Workout Setup | Active Workout | Wallet |
|------|--------------|----------------|--------|
| Start workout button | Choose exercise, target, mode | Camera + counter | Total coins |

## 🛠️ Tech Stack

### Frontend
- **Expo** (React Native)
- **expo-router** - File-based navigation
- **expo-camera** - Live camera view
- **expo-av** - Sound effects
- **expo-speech** - Voice motivation
- **React Native Animated** - Coin animations

### Backend
- **FastAPI** (Python)
- **MongoDB** - Data persistence
- **emergentintegrations** - AI integrations (optional)

## 📁 Project Structure

```
/app
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx      # Root layout with navigation
│   │   ├── index.tsx        # Home screen
│   │   ├── workout.tsx      # Main workout screen (camera, counter)
│   │   └── wallet.tsx       # Wallet/stats screen
│   ├── assets/
│   │   └── sounds/
│   │       └── chaching.mp3 # Coin sound effect
│   ├── .env                 # Frontend environment variables
│   ├── app.json            # Expo configuration
│   └── package.json        # Dependencies
│
├── backend/
│   ├── server.py           # FastAPI server with all endpoints
│   ├── .env                # Backend environment variables
│   └── requirements.txt    # Python dependencies
│
└── README.md               # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- MongoDB (local or cloud)
- Expo Go app on your phone

### Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Create .env file
cp .env.example .env

# Start Expo development server
npx expo start
```

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Start FastAPI server
uvicorn server:app --reload --port 8001
```

### Environment Variables

#### Frontend (`frontend/.env`)
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

#### Backend (`backend/.env`)
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=fitcoin
EMERGENT_LLM_KEY=your_key_here  # Optional, for AI features
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/` | Health check |
| GET | `/api/reps` | Get all logged reps |
| POST | `/api/reps` | Log a new rep |
| GET | `/api/sessions` | Get all workout sessions |
| POST | `/api/sessions` | Save a workout session |
| GET | `/api/wallet` | Get wallet summary (total coins) |
| POST | `/api/analyze-pose` | AI pose analysis (optional) |

## 🔮 Future: AI Rep Detection

The app is prepared for automatic rep detection using AI. Here's where to add it:

### Option 1: On-Device Pose Detection
```typescript
// In frontend/app/workout.tsx
// Add TensorFlow.js or MediaPipe for pose detection

import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';

// Detect shoulder position from camera frames
// Use the existing state machine logic:
// if(state === "up" && shoulderY > DOWN_THRESHOLD) → state = "down"
// if(state === "down" && shoulderY < UP_THRESHOLD) → count++, state = "up"
```

### Option 2: Cloud AI Vision
```python
# In backend/server.py
# The /api/analyze-pose endpoint is already set up
# It uses Gemini Vision API to analyze pose from images
# Adjust the prompt and thresholds as needed
```

### State Machine for Rep Counting
```javascript
// Core logic (already implemented, just needs accurate pose data)
const DOWN_THRESHOLD = 0.55;  // Shoulder Y position threshold
const UP_THRESHOLD = 0.35;

if (state === "up" && shoulderY > DOWN_THRESHOLD) {
  state = "down";
}

if (state === "down" && shoulderY < UP_THRESHOLD) {
  count++;
  state = "up";
}
```

## 🎨 Customization

### Voice Settings
```typescript
// In frontend/app/workout.tsx
Speech.speak(phrase, {
  pitch: 0.8,    // Lower = deeper voice (0.5-2.0)
  rate: 0.85,    // Slower = more impact (0.5-2.0)
  volume: 1.0,   // Max volume
});
```

### Motivation Phrases
```typescript
const MOTIVATION_PHRASES = [
  "YEAH BABY!",
  "LET'S GOOO!",
  "BEAST MODE!",
  // Add your own...
];
```

### Coin Rewards Frequency
```typescript
// Change from every 5 reps to any number
if (totalRepsCompleted % 5 === 0) {  // ← Change 5 to desired number
  playCoinSound();
  animateCoin();
}
```

## 🐛 Troubleshooting

### Camera not working
- Ensure camera permissions are granted
- On iOS: Check Settings > Privacy > Camera
- On Android: Check app permissions

### Sound not playing
- Check device volume
- Ensure `chaching.mp3` exists in `assets/sounds/`

### Backend connection failed
- Verify `EXPO_PUBLIC_BACKEND_URL` is correct
- Check if backend server is running
- For local development, use your machine's IP, not `localhost`

## 📄 License

MIT License - Feel free to use and modify!

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**Built with 💪 and ☕ using Emergent AI**
