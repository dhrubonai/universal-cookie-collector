import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// THE WORKING API KEY - From alight-creative-staging Firebase project
const FIREBASE_API_KEY = 'AIzaSyDzNWMTFIiRRuu6ewOkcPQurqrK2fwXhHQ';
const AUTHORIZED_REFERER = 'https://alight-creative-staging.web.app/';
const AUTHORIZED_ORIGIN = 'https://alight-creative-staging.web.app';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Send verification link with WORKING key
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
        }),
      }
    );

    const firebaseData = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      console.error('Firebase error:', firebaseData);
      
      if (firebaseData.error?.message?.includes('TOO_MANY_ATTEMPTS')) {
        return NextResponse.json(
          { success: false, message: 'Too many requests. Wait a bit.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, message: firebaseData.error?.message || 'Failed to send' },
        { status: 500 }
      );
    }

    addHistoryItem(email, 'link_sent');

    return NextResponse.json({
      success: true,
      message: 'Verification link sent!'
    });

  } catch (error: any) {
    console.error('Send error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error.' },
      { status: 500 }
    );
  }
}
