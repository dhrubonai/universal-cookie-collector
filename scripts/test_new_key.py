#!/usr/bin/env python3
"""
Test the NEW Firebase API key from alightcreative.com
"""

import requests
import json

# NEW Firebase key from alightcreative.com (official site)
API_KEY = 'AIzaSyAAh--qI_hEEF3AN26HADZ-I5TKPOZrZqA'
BASE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts'

HEADERS = {
    'Content-Type': 'application/json',
    'Referer': 'https://alightcreative.com/',
    'Origin': 'https://alightcreative.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

def test_send_oob():
    """Test sending OOB code with new key"""
    print("[*] Testing sendOobCode with NEW Firebase API key (from alightcreative.com)...")
    
    url = f"{BASE_URL}:sendOobCode?key={API_KEY}"
    payload = {
        "requestType": "EMAIL_SIGNIN",
        "email": "test67890@gmail.com",
    }
    
    try:
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=30)
        data = resp.json()
        
        print(f"[+] Status: {resp.status_code}")
        print(f"[+] Response:\n{json.dumps(data, indent=2)}")
        
        # Check if oobCode is returned directly
        if resp.status_code == 200:
            oob_code = data.get('oobCode')
            if oob_code:
                print(f"\n[!!!] GOT DIRECT OOBCODE: {oob_code[:40]}...")
                return True, oob_code
            else:
                print("\n[*] No direct oobCode - email would be sent")
                return True, None
        return False, None
    except Exception as e:
        print(f"[-] Error: {e}")
        return False, None

if __name__ == "__main__":
    print("=" * 60)
    print("TESTING NEW FIREBASE KEY (alightcreative.com)")
    print("=" * 60 + "\n")
    
    success, oob_code = test_send_oob()
    
    print("\n" + "=" * 60)
    if success:
        print("RESULT: SUCCESS - Key works!")
        if oob_code:
            print("Direct oobCode available - can verify immediately!")
    else:
        print("RESULT: FAILED")
    print("=" * 60)
