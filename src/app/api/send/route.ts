import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Firebase configuration - UPDATED TO NEW SETUP
const FIREBASE_API_KEY = 'AIzaSyAAh--qI_hEEF3AN26HADZ-I5TKPOZrZqA';
const AUTHORIZED_REFERER = 'https://alightcreative.com/';
const AUTHORIZED_ORIGIN = 'https://alightcreative.com';

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

    // Call Firebase Auth API with NEW configuration
    // Using new API key and alightcreative.com as authorized domain
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': AUTHORIZED_REFERER,
          'Origin': AUTHORIZED_ORIGIN,
        },
        body: JSON.stringify({
          requestType: 'EMAIL_SIGNIN',
          email: email.trim(),
          // Don't include continueUrl - it causes domain restriction errors
        }),
      }
    );

    const firebaseData = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      console.error('Firebase error:', firebaseData);
      
      if (firebaseData.error?.message?.includes('TOO_MANY_ATTEMPTS')) {
        return NextResponse.json(
          { success: false, message: 'Too many requests. Please wait.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, message: firebaseData.error?.message || 'Failed to send link' },
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
      { success: false, message: 'Server error. Try again.' },
      { status: 500 }
    );
  }
}
