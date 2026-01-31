#!/usr/bin/env python3
"""
Backend API Testing for Rep Coin App
Tests all backend endpoints to verify functionality
"""

import requests
import json
import sys
from datetime import datetime
import os
import base64
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from frontend environment
BACKEND_URL = os.getenv('EXPO_PUBLIC_BACKEND_URL', 'http://localhost:8001')
BASE_API_URL = f"{BACKEND_URL}/api"

print(f"Testing backend at: {BASE_API_URL}")

def test_root_endpoint():
    """Test GET /api/ - Root endpoint"""
    print("\n=== Testing Root Endpoint ===")
    try:
        response = requests.get(f"{BASE_API_URL}/")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "Rep Coin API - Earn While You Burn!":
                print("✅ Root endpoint working correctly")
                return True
            else:
                print("❌ Root endpoint returned unexpected message")
                return False
        else:
            print(f"❌ Root endpoint failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Root endpoint error: {e}")
        return False

def test_create_rep():
    """Test POST /api/reps - Create rep record"""
    print("\n=== Testing Create Rep Endpoint ===")
    
    # Test pushup rep
    pushup_data = {"exercise_type": "pushup", "coins_earned": 1}
    try:
        response = requests.post(f"{BASE_API_URL}/reps", json=pushup_data)
        print(f"Pushup Rep - Status Code: {response.status_code}")
        print(f"Pushup Rep - Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("exercise_type") == "pushup" and 
                data.get("coins_earned") == 1 and 
                "id" in data and 
                "timestamp" in data):
                print("✅ Pushup rep creation working correctly")
                pushup_success = True
            else:
                print("❌ Pushup rep creation returned unexpected data")
                pushup_success = False
        else:
            print(f"❌ Pushup rep creation failed with status {response.status_code}")
            pushup_success = False
    except Exception as e:
        print(f"❌ Pushup rep creation error: {e}")
        pushup_success = False
    
    # Test situp rep
    situp_data = {"exercise_type": "situp", "coins_earned": 1}
    try:
        response = requests.post(f"{BASE_API_URL}/reps", json=situp_data)
        print(f"Situp Rep - Status Code: {response.status_code}")
        print(f"Situp Rep - Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("exercise_type") == "situp" and 
                data.get("coins_earned") == 1 and 
                "id" in data and 
                "timestamp" in data):
                print("✅ Situp rep creation working correctly")
                situp_success = True
            else:
                print("❌ Situp rep creation returned unexpected data")
                situp_success = False
        else:
            print(f"❌ Situp rep creation failed with status {response.status_code}")
            situp_success = False
    except Exception as e:
        print(f"❌ Situp rep creation error: {e}")
        situp_success = False
    
    return pushup_success and situp_success

def test_get_reps():
    """Test GET /api/reps - Get all reps"""
    print("\n=== Testing Get Reps Endpoint ===")
    try:
        response = requests.get(f"{BASE_API_URL}/reps")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                print(f"✅ Get reps working correctly - returned {len(data)} reps")
                # Check if reps have required fields
                if data:
                    first_rep = data[0]
                    if all(key in first_rep for key in ["id", "exercise_type", "coins_earned", "timestamp"]):
                        print("✅ Rep objects have all required fields")
                        return True
                    else:
                        print("❌ Rep objects missing required fields")
                        return False
                else:
                    print("✅ Empty reps list is valid")
                    return True
            else:
                print("❌ Get reps returned non-list response")
                return False
        else:
            print(f"❌ Get reps failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Get reps error: {e}")
        return False

def test_create_session():
    """Test POST /api/sessions - Create workout session"""
    print("\n=== Testing Create Session Endpoint ===")
    
    session_data = {"pushups": 10, "situps": 5, "total_coins": 15}
    try:
        response = requests.post(f"{BASE_API_URL}/sessions", json=session_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("pushups") == 10 and 
                data.get("situps") == 5 and 
                data.get("total_coins") == 15 and 
                "id" in data and 
                "timestamp" in data):
                print("✅ Session creation working correctly")
                return True
            else:
                print("❌ Session creation returned unexpected data")
                return False
        else:
            print(f"❌ Session creation failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Session creation error: {e}")
        return False

def test_get_sessions():
    """Test GET /api/sessions - Get all sessions"""
    print("\n=== Testing Get Sessions Endpoint ===")
    try:
        response = requests.get(f"{BASE_API_URL}/sessions")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                print(f"✅ Get sessions working correctly - returned {len(data)} sessions")
                # Check if sessions have required fields
                if data:
                    first_session = data[0]
                    if all(key in first_session for key in ["id", "pushups", "situps", "total_coins", "timestamp"]):
                        print("✅ Session objects have all required fields")
                        return True
                    else:
                        print("❌ Session objects missing required fields")
                        return False
                else:
                    print("✅ Empty sessions list is valid")
                    return True
            else:
                print("❌ Get sessions returned non-list response")
                return False
        else:
            print(f"❌ Get sessions failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Get sessions error: {e}")
        return False

def test_get_wallet():
    """Test GET /api/wallet - Get wallet summary"""
    print("\n=== Testing Get Wallet Endpoint ===")
    try:
        response = requests.get(f"{BASE_API_URL}/wallet")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["total_coins", "total_pushups", "total_situps", "sessions_count"]
            if all(key in data for key in required_fields):
                # Verify data types
                if (isinstance(data["total_coins"], int) and 
                    isinstance(data["total_pushups"], int) and 
                    isinstance(data["total_situps"], int) and 
                    isinstance(data["sessions_count"], int)):
                    print("✅ Wallet endpoint working correctly")
                    return True
                else:
                    print("❌ Wallet endpoint returned incorrect data types")
                    return False
            else:
                print("❌ Wallet endpoint missing required fields")
                return False
        else:
            print(f"❌ Wallet endpoint failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Wallet endpoint error: {e}")
        return False

def run_all_tests():
    """Run all backend tests"""
    print("🚀 Starting Rep Coin Backend API Tests")
    print("=" * 50)
    
    test_results = {
        "root_endpoint": test_root_endpoint(),
        "create_rep": test_create_rep(),
        "get_reps": test_get_reps(),
        "create_session": test_create_session(),
        "get_sessions": test_get_sessions(),
        "get_wallet": test_get_wallet()
    }
    
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed = 0
    failed = 0
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\nTotal: {passed + failed} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed == 0:
        print("\n🎉 All tests passed! Backend API is working correctly.")
        return True
    else:
        print(f"\n⚠️  {failed} test(s) failed. Backend needs attention.")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)