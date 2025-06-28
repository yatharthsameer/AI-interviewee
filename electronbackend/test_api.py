#!/usr/bin/env python3
"""
Test script to verify Gemini API is working correctly
"""

import os
import requests
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()


def test_gemini_direct():
    """Test Gemini API directly"""
    print("🧪 Testing Gemini API directly...")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY not found in environment")
        return False

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        print("📡 Sending test request to Gemini...")
        response = model.generate_content(
            "Hello! Please respond with 'API working correctly'"
        )

        if response.text:
            print(f"✅ Gemini API test successful: {response.text}")
            return True
        else:
            print("❌ Empty response from Gemini")
            return False

    except Exception as e:
        print(f"❌ Gemini API test failed: {e}")
        return False


def test_backend_endpoint():
    """Test the backend endpoint"""
    print("\n🔗 Testing backend endpoint...")

    try:
        response = requests.post("http://localhost:5002/api/test_gemini", timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"✅ Backend test successful: {data.get('response')}")
                return True
            else:
                print(f"❌ Backend test failed: {data.get('error')}")
                return False
        else:
            print(f"❌ Backend returned status code: {response.status_code}")
            return False

    except Exception as e:
        print(f"❌ Backend test failed: {e}")
        return False


if __name__ == "__main__":
    print("🚀 Starting API tests...\n")

    # Test 1: Direct Gemini API
    direct_test = test_gemini_direct()

    # Test 2: Backend endpoint
    backend_test = test_backend_endpoint()

    print(f"\n📊 Results:")
    print(f"   Direct Gemini API: {'✅ PASS' if direct_test else '❌ FAIL'}")
    print(f"   Backend Endpoint:  {'✅ PASS' if backend_test else '❌ FAIL'}")

    if direct_test and backend_test:
        print("\n🎉 All tests passed! The API should work for screenshots.")
    else:
        print("\n⚠️  Some tests failed. Check the configuration and try again.")
