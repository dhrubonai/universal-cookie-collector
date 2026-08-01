#!/usr/bin/env python3
"""
Quick test of ORIGINAL Firebase API key
"""

import requests
import json

# ORIGINAL Firebase project (same as ap.rifan.dev)
API_KEY = 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0'
BASE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts'

HEADERS = {
    'Content-Type': 'application/json',
    'Referer': 'https://alight-creative.firebaseapp.com/',
    'Origin': 'https://alight-creative.firebaseapp.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

def test_send_oob():
    """Test sending OOB code"""
    print("[*] Testing sendOobCode with ORIGINAL Firebase project...")
    
    url = f"{BASE_URL}:sendOobCode?key={API_KEY}"
    payload = {
        "requestType": "EMAIL_SIGNIN",
        "email": "test12345@gmail.com",  # Test email
    }
    
    try:
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=30)
        data = resp.json()
        
        print(f"[+] Status: {resp.status_code}")
        print(f"[+] Response:\n{json.dumps(data, indent=2)}")
        
        return resp.status_code == 200
    except Exception as e:
        print(f"[-] Error: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("TESTING ORIGINAL FIREBASE KEY")
    print("=" * 60 + "\n")
    
    success = test_send_oob()
    
    print("\n" + "=" * 60)
    print("RESULT:", "SUCCESS - Key works!" if success else "FAILED")
    print("=" * 60)
