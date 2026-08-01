import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Firebase configuration
const FIREBASE_API_KEY = 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, link } = body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    if (!link || typeof link !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Verification link is required' },
        { status: 400 }
      );
    }

    // Extract oobCode from the verification link
    let oobCode = '';
    try {
      const url = new URL(link);
      oobCode = url.searchParams.get('oobCode') || '';
      
      // If not in main URL params, check the nested link parameter
      if (!oobCode) {
        const linkParam = url.searchParams.get('link');
        if (linkParam) {
          const nestedUrl = new URL(decodeURIComponent(linkParam));
          oobCode = nestedUrl.searchParams.get('oobCode') || '';
        }
      }
    } catch (e) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification link format' },
        { status: 400 }
      );
    }

    if (!oobCode) {
      return NextResponse.json(
        { success: false, message: 'Could not extract verification code from link' },
        { status: 400 }
      );
    }

    // Exchange oobCode for Firebase ID token
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          oobCode: oobCode,
        }),
      }
    );

    const firebaseData = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      console.error('Firebase verify error:', firebaseData);
      
      // Handle expired or invalid codes
      if (firebaseData.error?.message?.includes('EXPIRED_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Verification link has expired. Please request a new one.' },
          { status: 410 }
        );
      }

      if (firebaseData.error?.message?.includes('INVALID_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Invalid verification code.' },
          { status: 400 }
        );
      }

      if (firebaseData.error?.message?.includes('TOO_MANY_ATTEMPTS')) {
        return NextResponse.json(
          { success: false, message: 'Too many attempts. Please wait.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, message: firebaseData.error?.message || 'Verification failed' },
        { status: 500 }
      );
    }

    // Log successful activation
    addHistoryItem(email, 'activated');

    return NextResponse.json({
      success: true,
      message: 'Premium activated successfully!',
      idToken: firebaseData.idToken,
      refreshToken: firebaseData.refreshToken
    });

  } catch (error: any) {
    console.error('Verify API error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
