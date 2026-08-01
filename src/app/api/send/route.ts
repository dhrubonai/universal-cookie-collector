import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Firebase configuration
const FIREBASE_API_KEY = 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0';
const AUTHORIZED_REFERER = 'https://alight-creative.firebaseapp.com/';
const AUTHORIZED_ORIGIN = 'https://alight-creative.firebaseapp.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Call Firebase Auth API directly with authorized headers
    // CRITICAL: Include mobile app parameters for Alight Motion integration!
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': AUTHORIZED_REFERER,
          'Origin': AUTHORIZED_ORIGIN,
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
        },
        body: JSON.stringify({
          requestType: 'EMAIL_SIGNIN',
          email: email.trim(),
          continueUrl: 'https://alightcreative.com/auth_action',
          // Mobile app parameters - CRITICAL for Alight Motion!
          canHandleCodeInApp: true,
          iOSBundleId: 'com.alightcreatives.alightmotion',
          androidPackageName: 'com.alightcreatives.alightmotion',
          androidInstallApp: true,
          androidMinimumVersion: '1',
        }),
      }
    );

    const firebaseData = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      console.error('Firebase error:', firebaseData);
      
      // Handle rate limiting
      if (firebaseData.error?.message?.includes('TOO_MANY_ATTEMPTS')) {
        return NextResponse.json(
          { success: false, message: 'Too many requests. Please wait a few minutes.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, message: firebaseData.error?.message || 'Failed to send verification link' },
        { status: 500 }
      );
    }

    // Log successful send
    addHistoryItem(email, 'link_sent');

    return NextResponse.json({
      success: true,
      message: 'Verification link sent successfully'
    });

  } catch (error: any) {
    console.error('Send API error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
