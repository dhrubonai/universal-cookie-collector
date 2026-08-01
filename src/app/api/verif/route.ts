import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Firebase configuration - SAME as original site would use
const FIREBASE_API_KEY = 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0';
const AUTHORIZED_REFERER = 'https://alight-creative.firebaseapp.com/';
const AUTHORIZED_ORIGIN = 'https://alight-creative.firebaseapp.com';

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

    // Call Firebase Auth API to exchange oobCode for tokens
    // This is the CRITICAL step that activates premium!
    // When this succeeds, Firebase authenticates the user and 
    // Alight Motion recognizes them as Premium
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': AUTHORIZED_REFERER,
          'Origin': AUTHORIZED_ORIGIN,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        },
        body: JSON.stringify({
          email: email.trim(),
          oobCode: oobCode,
          // Return additional fields
          returnSecureToken: true,
        }),
      }
    );

    const firebaseData = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      console.error('Firebase verify error:', firebaseData);
      
      // Handle specific errors with helpful messages
      if (firebaseData.error?.message?.includes('EXPIRED_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Verification link has expired. Please request a new one.' },
          { status: 410 }
        );
      }

      if (firebaseData.error?.message?.includes('INVALID_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Invalid or already-used verification code. Please request a new link.' },
          { status: 400 }
        );
      }

      if (firebaseData.error?.message?.includes('TOO_MANY_ATTEMPTS')) {
        return NextResponse.json(
          { success: false, message: 'Too many attempts. Please wait a few minutes.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, message: firebaseData.error?.message || 'Verification failed' },
        { status: 500 }
      );
    }

    // SUCCESS! User is now authenticated in Firebase
    // Log successful activation
    addHistoryItem(email, 'activated');

    // Return comprehensive success response
    return NextResponse.json({
      success: true,
      message: 'Premium activated successfully! Open Alight Motion app to access Premium features.',
      // Include all Firebase data for debugging/transparency
      idToken: firebaseData.idToken,
      refreshToken: firebaseData.refreshToken,
      expiresIn: firebaseData.expiresIn,
      isNewUser: firebaseData.isNewUser || false,
      email: firebaseData.email,
      // Premium info
      premiumStatus: 'active',
      premiumDuration: '1 year'
    });

  } catch (error: any) {
    console.error('Verify API error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
