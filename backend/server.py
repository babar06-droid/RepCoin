from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from uuid import uuid4
from datetime import datetime
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
users = db["users"]

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# In-memory user store for REP points
user_store = {
    "demo_user": {
        "username": "demo_user",
        "rep_points": 0,
        "badges_unlocked": False,
        "premium_unlocked": False
    }
}

# Global Champions/Leaderboard - Best of All Time
champions = {
    "pushup": {
        "champion_name": "Be the first!",
        "champion_photo": None,  # base64 image
        "best_reps": 0,
        "best_time_seconds": 0,
        "date_achieved": None
    },
    "situp": {
        "champion_name": "Be the first!",
        "champion_photo": None,
        "best_reps": 0,
        "best_time_seconds": 0,
        "date_achieved": None
    }
}

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


# Rep tracking models
class Rep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    exercise_type: str  # 'pushup' or 'situp'
    coins_earned: int = 1
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class RepCreate(BaseModel):
    exercise_type: str
    coins_earned: int = 1


# Session models
class WorkoutSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pushups: int = 0
    situps: int = 0
    total_coins: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class WorkoutSessionCreate(BaseModel):
    pushups: int = 0
    situps: int = 0
    total_coins: int = 0


# Wallet model
class WalletData(BaseModel):
    total_coins: int = 0
    total_pushups: int = 0
    total_situps: int = 0
    sessions_count: int = 0


# Pose analysis models
class PoseAnalysisRequest(BaseModel):
    image_base64: str
    exercise_type: str = "pushup"

class PoseAnalysisResponse(BaseModel):
    position: str  # "up", "down", or "unknown"
    shoulder_y: float  # 0.0 (top) to 1.0 (bottom)
    confidence: str  # "high", "medium", "low"
    message: str
    raw_response: str = ""  # For debugging

# REP Points models
class RepPointsResponse(BaseModel):
    rep_points: int
    message: str

class StoreItem(BaseModel):
    item_id: str
    name: str
    cost: int
    unlocked: bool

class StorePurchaseRequest(BaseModel):
    item_id: str

class StorePurchaseResponse(BaseModel):
    success: bool
    message: str
    rep_points: int
    item_unlocked: bool

# Challenge/Leaderboard Models
class ChampionInfo(BaseModel):
    exercise_type: str
    champion_name: str
    champion_photo: Optional[str] = None  # base64
    best_reps: int
    best_time_seconds: int
    date_achieved: Optional[str] = None

class ChallengeAttempt(BaseModel):
    exercise_type: str
    reps_completed: int
    time_seconds: int
    player_name: str
    player_photo: Optional[str] = None  # base64

class ChallengeResult(BaseModel):
    success: bool
    is_new_champion: bool
    message: str
    current_champion: ChampionInfo


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Rep Coin API - Earn While You Burn!"}


# Create user endpoint
@api_router.post("/create-user")
async def create_user():
    user_id = str(uuid4())
    await users.insert_one({
        "_id": user_id,
        "rep": 0
    })
    return {"user_id": user_id}


# Add rep to user endpoint
@api_router.post("/add-rep/{user_id}")
async def add_rep(user_id: str, amount: int = 1):
    await users.update_one(
        {"_id": user_id},
        {"$inc": {"rep": amount}}
    )
    user = await users.find_one({"_id": user_id})
    return {"rep": user["rep"]}


# Get user wallet endpoint
@api_router.get("/wallet/{user_id}")
async def get_wallet_by_user(user_id: str):
    user = await users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"rep": user["rep"]}


# REP Points endpoints
@api_router.post("/add_rep", response_model=RepPointsResponse)
async def add_rep():
    """Increment rep_points by 1 and return balance"""
    user_store["demo_user"]["rep_points"] += 1
    return RepPointsResponse(
        rep_points=user_store["demo_user"]["rep_points"],
        message="Rep added! Keep pushing!"
    )

@api_router.get("/wallet", response_model=RepPointsResponse)
async def get_wallet():
    """Get current rep_points"""
    return RepPointsResponse(
        rep_points=user_store["demo_user"]["rep_points"],
        message="Current balance"
    )

@api_router.get("/store")
async def get_store():
    """Get store items with unlock status"""
    return {
        "items": [
            {
                "item_id": "badge",
                "name": "Badge",
                "cost": 50,
                "unlocked": user_store["demo_user"]["badges_unlocked"]
            },
            {
                "item_id": "premium",
                "name": "Premium",
                "cost": 100,
                "unlocked": user_store["demo_user"]["premium_unlocked"]
            }
        ],
        "rep_points": user_store["demo_user"]["rep_points"]
    }

@api_router.post("/store/purchase", response_model=StorePurchaseResponse)
async def purchase_item(request: StorePurchaseRequest):
    """Purchase a store item"""
    user = user_store["demo_user"]
    
    if request.item_id == "badge":
        cost = 50
        if user["badges_unlocked"]:
            return StorePurchaseResponse(
                success=False,
                message="Badge already unlocked!",
                rep_points=user["rep_points"],
                item_unlocked=True
            )
        if user["rep_points"] < cost:
            return StorePurchaseResponse(
                success=False,
                message=f"Not enough REP points! Need {cost}, have {user['rep_points']}",
                rep_points=user["rep_points"],
                item_unlocked=False
            )
        user["rep_points"] -= cost
        user["badges_unlocked"] = True
        return StorePurchaseResponse(
            success=True,
            message="🎖️ Badge Unlocked!",
            rep_points=user["rep_points"],
            item_unlocked=True
        )
    
    elif request.item_id == "premium":
        cost = 100
        if user["premium_unlocked"]:
            return StorePurchaseResponse(
                success=False,
                message="Premium already unlocked!",
                rep_points=user["rep_points"],
                item_unlocked=True
            )
        if user["rep_points"] < cost:
            return StorePurchaseResponse(
                success=False,
                message=f"Not enough REP points! Need {cost}, have {user['rep_points']}",
                rep_points=user["rep_points"],
                item_unlocked=False
            )
        user["rep_points"] -= cost
        user["premium_unlocked"] = True
        return StorePurchaseResponse(
            success=True,
            message="⭐ Premium Unlocked!",
            rep_points=user["rep_points"],
            item_unlocked=True
        )
    
    else:
        return StorePurchaseResponse(
            success=False,
            message="Item not found",
            rep_points=user["rep_points"],
            item_unlocked=False
        )


# Challenge/Leaderboard Endpoints
@api_router.get("/challenge/{exercise_type}")
async def get_champion(exercise_type: str):
    """Get current champion for an exercise type"""
    if exercise_type not in champions:
        raise HTTPException(status_code=404, detail="Exercise type not found")
    
    champ = champions[exercise_type]
    return ChampionInfo(
        exercise_type=exercise_type,
        champion_name=champ["champion_name"],
        champion_photo=champ["champion_photo"],
        best_reps=champ["best_reps"],
        best_time_seconds=champ["best_time_seconds"],
        date_achieved=champ["date_achieved"]
    )

@api_router.get("/challenge")
async def get_all_champions():
    """Get all champions"""
    return {
        "pushup": ChampionInfo(
            exercise_type="pushup",
            champion_name=champions["pushup"]["champion_name"],
            champion_photo=champions["pushup"]["champion_photo"],
            best_reps=champions["pushup"]["best_reps"],
            best_time_seconds=champions["pushup"]["best_time_seconds"],
            date_achieved=champions["pushup"]["date_achieved"]
        ),
        "situp": ChampionInfo(
            exercise_type="situp",
            champion_name=champions["situp"]["champion_name"],
            champion_photo=champions["situp"]["champion_photo"],
            best_reps=champions["situp"]["best_reps"],
            best_time_seconds=champions["situp"]["best_time_seconds"],
            date_achieved=champions["situp"]["date_achieved"]
        )
    }

@api_router.post("/challenge/submit", response_model=ChallengeResult)
async def submit_challenge(attempt: ChallengeAttempt):
    """Submit a challenge attempt - become champion if you beat the record!"""
    if attempt.exercise_type not in champions:
        raise HTTPException(status_code=404, detail="Exercise type not found")
    
    current = champions[attempt.exercise_type]
    
    # Check if this beats the current record (more reps wins, or same reps in less time)
    is_new_record = False
    if attempt.reps_completed > current["best_reps"]:
        is_new_record = True
    elif attempt.reps_completed == current["best_reps"] and current["best_reps"] > 0:
        if attempt.time_seconds < current["best_time_seconds"]:
            is_new_record = True
    
    if is_new_record:
        # Update champion!
        champions[attempt.exercise_type] = {
            "champion_name": attempt.player_name,
            "champion_photo": attempt.player_photo,
            "best_reps": attempt.reps_completed,
            "best_time_seconds": attempt.time_seconds,
            "date_achieved": datetime.utcnow().isoformat()
        }
        
        return ChallengeResult(
            success=True,
            is_new_champion=True,
            message=f"🏆 NEW CHAMPION! {attempt.player_name} with {attempt.reps_completed} reps!",
            current_champion=ChampionInfo(
                exercise_type=attempt.exercise_type,
                champion_name=attempt.player_name,
                champion_photo=attempt.player_photo,
                best_reps=attempt.reps_completed,
                best_time_seconds=attempt.time_seconds,
                date_achieved=champions[attempt.exercise_type]["date_achieved"]
            )
        )
    else:
        return ChallengeResult(
            success=True,
            is_new_champion=False,
            message=f"Good effort! Current record: {current['best_reps']} reps by {current['champion_name']}",
            current_champion=ChampionInfo(
                exercise_type=attempt.exercise_type,
                champion_name=current["champion_name"],
                champion_photo=current["champion_photo"],
                best_reps=current["best_reps"],
                best_time_seconds=current["best_time_seconds"],
                date_achieved=current["date_achieved"]
            )
        )


# Pose analysis endpoint - AI Vision
@api_router.post("/analyze-pose", response_model=PoseAnalysisResponse)
async def analyze_pose(request: PoseAnalysisRequest):
    try:
        if not EMERGENT_LLM_KEY:
            logging.error("EMERGENT_LLM_KEY not configured")
            return PoseAnalysisResponse(
                position="unknown",
                shoulder_y=0.5,
                confidence="low",
                message="AI key not configured",
                raw_response=""
            )

        # Create chat instance for vision analysis
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"pose-{uuid.uuid4()}",
            system_message="""You are a fitness pose analyzer. Analyze the image and estimate the vertical position of the person's shoulders.

Your job:
1. Find the person's shoulders in the image
2. Estimate how high/low their shoulders are as a percentage (0.0 = top of frame, 1.0 = bottom of frame)
3. Determine if they are in UP position (shoulders high, arms extended) or DOWN position (shoulders low, arms bent)

RESPOND IN THIS EXACT FORMAT:
shoulder_y: 0.XX
position: up/down/unknown

Example responses:
shoulder_y: 0.35
position: up

shoulder_y: 0.72
position: down"""
        ).with_model("gemini", "gemini-2.0-flash")

        # Clean base64 string - remove data URI prefix if present
        image_data = request.image_base64
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        # Create image content using correct parameter
        image_content = ImageContent(image_base64=image_data)

        # Create message with file_contents (not image_contents!)
        prompt = f"Analyze this {request.exercise_type} position. Where are the shoulders? Give shoulder_y (0.0-1.0) and position (up/down/unknown)."
        
        user_message = UserMessage(
            text=prompt,
            file_contents=[image_content]  # CORRECT: use file_contents, not image_contents
        )

        # Get response
        response = await chat.send_message(user_message)
        logging.info(f"Gemini raw response: {response}")
        
        # Parse response - look for shoulder_y and position
        response_lower = response.strip().lower()
        
        # Extract shoulder_y value
        shoulder_y = 0.5  # default middle
        if "shoulder_y:" in response_lower:
            try:
                y_part = response_lower.split("shoulder_y:")[1].split("\n")[0].strip()
                shoulder_y = float(y_part)
                # Clamp to valid range
                shoulder_y = max(0.0, min(1.0, shoulder_y))
            except:
                pass
        
        # Determine position from response
        if "position: up" in response_lower or "position:up" in response_lower:
            position = "up"
            confidence = "high"
        elif "position: down" in response_lower or "position:down" in response_lower:
            position = "down"
            confidence = "high"
        elif "up" in response_lower and "down" not in response_lower:
            position = "up"
            confidence = "medium"
        elif "down" in response_lower and "up" not in response_lower:
            position = "down"
            confidence = "medium"
        else:
            position = "unknown"
            confidence = "low"

        logging.info(f"Parsed: position={position}, shoulder_y={shoulder_y}, confidence={confidence}")
        
        return PoseAnalysisResponse(
            position=position,
            shoulder_y=shoulder_y,
            confidence=confidence,
            message=f"Detected {position} position at y={shoulder_y:.2f}",
            raw_response=response[:200]  # First 200 chars for debugging
        )

    except Exception as e:
        logging.error(f"Pose analysis error: {e}")
        return PoseAnalysisResponse(
            position="unknown",
            shoulder_y=0.5,
            confidence="low",
            message=str(e),
            raw_response=""
        )


# Status endpoints
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# Rep tracking endpoints
@api_router.post("/reps", response_model=Rep)
async def create_rep(input: RepCreate):
    rep_dict = input.dict()
    rep_obj = Rep(**rep_dict)
    _ = await db.reps.insert_one(rep_obj.dict())
    
    # IMPORTANT: Also increment REP points in user store
    user_store["demo_user"]["rep_points"] += 1
    
    return rep_obj

@api_router.get("/reps", response_model=List[Rep])
async def get_reps():
    reps = await db.reps.find().sort("timestamp", -1).to_list(1000)
    return [Rep(**rep) for rep in reps]


# Session endpoints
@api_router.post("/sessions", response_model=WorkoutSession)
async def create_session(input: WorkoutSessionCreate):
    session_dict = input.dict()
    session_obj = WorkoutSession(**session_dict)
    _ = await db.sessions.insert_one(session_obj.dict())
    return session_obj

@api_router.get("/sessions", response_model=List[WorkoutSession])
async def get_sessions():
    sessions = await db.sessions.find().sort("timestamp", -1).to_list(100)
    return [WorkoutSession(**session) for session in sessions]


# Wallet endpoint - aggregates all data including REP points
@api_router.get("/wallet/stats", response_model=WalletData)
async def get_wallet_stats():
    # Count total reps by type
    pushup_count = await db.reps.count_documents({"exercise_type": "pushup"})
    situp_count = await db.reps.count_documents({"exercise_type": "situp"})
    
    # Total coins from all reps
    total_coins_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$coins_earned"}}}
    ]
    coins_result = await db.reps.aggregate(total_coins_pipeline).to_list(1)
    total_coins = coins_result[0]["total"] if coins_result else 0
    
    # Count sessions
    sessions_count = await db.sessions.count_documents({})
    
    return WalletData(
        total_coins=total_coins,
        total_pushups=pushup_count,
        total_situps=situp_count,
        sessions_count=sessions_count
    )


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
