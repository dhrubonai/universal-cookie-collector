#!/usr/bin/env python3
"""
Test Firebase flow with guerrilla mail - fixed version
"""

import requests
import json
import time
import re
import sys

FIREBASE_API_KEY = 'AIzaSyAAh--qI_hEEF3AN26HADZ-I5TKPOZrZqA'
FIREBASE_AUTH_URL = f'https://identitytoolkit.googleapis.com/v1/accounts'

HEADERS = {
    'Content-Type': 'application/json',
    'Referer': 'https://alightcreative.com/',
    'Origin': 'https://alightcreative.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

def get_guerrilla_email():
    """Get guerrilla mail address"""
    print("[*] Getting guerrilla mail...")
    try:
        resp = requests.get('https://api.guerrillamail.com/ajax.php?f=get_email_address',
                          params={'lang': 'en'}, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('email_addr'), data.get('sid_token')
    except Exception as e:
        print(f"[-] Error: {e}")
    return None, None

def check_guerrilla_inbox(sid):
    """Check inbox and get full message details"""
    try:
        resp = requests.get('https://api.guerrillamail.com/ajax.php?f=get_email_list',
                          params={'offset': 0, 'sid_token': sid}, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            msgs = data.get('list', [])
            
            # Fetch each message body
            for msg in msgs:
                msg_id = msg.get('mail_id')
                fetch_resp = requests.get('https://api.guerrillamail.com/ajax.php=fetch_email',
                                        params={'mail_id': msg_id, 'sid_token': sid}, timeout=15)
                if fetch_resp.status_code == 200:
                    msg_data = fetch_resp.json()
                    msg['body'] = msg_data.get('mail_body', '')
                    msg['subject'] = msg_data.get('mail_subject', '')
                    
            return msgs
    except Exception as e:
        print(f"[-] Inbox error: {e}")
    return []

def send_verification_email(email):
    """Send Firebase EMAIL_SIGNIN"""
    print(f"\n[*] Sending verification to: {email}")
    
    url = f"{FIREBASE_AUTH_URL}:sendOobCode?key={FIREBASE_API_KEY}"
    payload = {
        "requestType": "EMAIL_SIGNIN",
        "email": email,
        "returnOobCode": True
    }
    
    try:
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=30)
        data = resp.json()
        
        print(f"[+] Status: {resp.status_code}")
        print(f"[+] Response: {json.dumps(data, indent=2)}")
        return data
    except Exception as e:
        print(f"[-] Error: {e}")
        return None

def extract_oob(text):
    """Extract oobCode from text"""
    patterns = [
        r'oobCode=([^&\s<>\'\"]+)',
        r'apiKey=[^&]*&oobCode=([^&\s]+)',
    ]
    for p in patterns:
        match = re.search(p, str(text))
        if match:
            return match.group(1)
    return None

def sign_in_with_link(email, oob_code):
    """Sign in using email link"""
    print(f"\n[*] Signing in...")
    print(f"    Email: {email}")
    print(f"    Code: {oob_code[:40]}..." if len(oob_code) > 40 else f"    Code: {oob_code}")
    
    url = f"{FIREBASE_AUTH_URL}:signInWithEmailLink?key={FIREBASE_API_KEY}"
    payload = {"email": email, "oobCode": oob_code}
    
    try:
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=30)
        data = resp.json()
        
        print(f"\n{'='*60}")
        print("SIGN IN RESPONSE")
        print('='*60)
        print(json.dumps(data, indent=2))
        
        if resp.status_code == 200:
            print(f"\n[+] SUCCESS!")
            print(f"    User ID: {data.get('localId')}")
            print(f"    Email Verified: {data.get('emailVerified')}")
            return data
        else:
            print(f"[-] Error: {data.get('error', {}).get('message')}")
            return None
    except Exception as e:
        print(f"[-] Request error: {e}")
        return None

def decode_jwt(token):
    """Decode JWT to see claims"""
    import base64
    
    try:
        parts = token.split('.')
        if len(parts) >= 2:
            payload = parts[1]
            payload += '=' * (4 - len(payload) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload))
            
            print(f"\n{'='*60}")
            print("JWT TOKEN CLAIMS")
            print('='*60)
            print(json.dumps(claims, indent=2))
            
            # Check for premium-related claims
            print(f"\n[*] All claim keys: {list(claims.keys())}")
            for key in claims:
                kl = key.lower()
                if any(x in kl for x in ['premium', 'role', 'plan', 'pro', 'tier', 'sub']):
                    print(f"[!!!] PREMIUM CLAIM '{key}': {claims[key]}")
            
            return claims
    except Exception as e:
        print(f"[-] Decode error: {e}")
    return None

def main():
    print("=" * 60)
    print("ALIGHT MOTION PREMIUM TEST")
    print("=" * 60)
    
    # Get temp email
    email, sid = get_guerrilla_email()
    if not email:
        print("[-] Failed to get email")
        return False
    
    # Send verification
    result = send_verification_email(email)
    if not result or result.get('error'):
        print("[-] Failed to send")
        return False
    
    oob_code = result.get('oobCode')
    
    # If no direct code, wait for email
    if not oob_code:
        print("\n[*] Waiting for email (checking every 10s)...")
        
        for i in range(18):  # 3 minutes max
            time.sleep(10)
            
            msgs = check_guerrilla_inbox(sid)
            print(f"[*] Check {i+1}/18: Found {len(msgs)} messages")
            
            for msg in msgs:
                subject = msg.get('subject', '(no subject)')
                body = msg.get('body', '')
                
                print(f"    Subject: {subject}")
                print(f"    Body preview: {str(body)[:200]}...")
                
                oob_code = extract_oob(body)
                if not oob_code:
                    oob_code = extract_oob(subject)
                
                if oob_code:
                    print(f"\n[+] FOUND OOBCODE!")
                    break
            
            if oob_code:
                break
        
        if not oob_code:
            print("\n[-] No oobCode found in emails")
            return False
    
    # Sign in
    signin_result = sign_in_with_link(email, oob_code)
    if not signin_result:
        return False
    
    # Decode token
    id_token = signin_result.get('idToken')
    if id_token:
        decode_jwt(id_token)
    
    print("\n[+] Test complete!")
    return True

if __name__ == "__main__":
    main()
