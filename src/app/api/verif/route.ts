import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Firebase configuration - ORIGINAL key that worked before
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
        { success: false, message: 'Could not extract verification code' },
        { status: 400 }
      );
    }

    console.log(`[VERIFY] Processing for ${email} with oobCode: ${oobCode.substring(0, 20)}...`);

    // Call Firebase signInWithEmailLink - THIS IS THE MAIN AUTH STEP
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': AUTHORIZED_REFERER,
          'Origin': AUTHORIZED_ORIGIN,
        },
        body: JSON.stringify({
          email: email.trim(),
          oobCode: oobCode,
          returnSecureToken: true,
        }),
      }
    );

    const firebaseData = await firebaseResponse.json();
    console.log(`[VERIFY] Firebase response status: ${firebaseResponse.status}`);

    if (!firebaseResponse.ok) {
      console.error(`[VERIFY] Firebase error:`, firebaseData);
      
      const errorMsg = firebaseData.error?.message || '';
      
      if (errorMsg.includes('EXPIRED_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Link expired. Request new one.' },
          { status: 410 }
        );
      }

      if (errorMsg.includes('INVALID_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Invalid or used code. Request new one.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, message: errorMsg || 'Verification failed' },
        { status: 500 }
      );
    }

    // SUCCESS! User authenticated
    console.log(`[VERIFY] ✅ Success! User ID: ${firebaseData.localId}`);
    
    // Log activation
    addHistoryItem(email, 'activated');

    // Return complete response with all Firebase data
    return NextResponse.json({
      success: true,
      message: '✅ Premium activated! Open Alight Motion app.',
      firebaseData: {
        idToken: firebaseData.idToken,
        refreshToken: firebaseData.refreshToken,
        expiresIn: firebaseData.expiresIn,
        localId: firebaseData.localId,
        email: firebaseData.email,
        isNewUser: firebaseData.isNewUser || false,
        registered: true
      }
    });

  } catch (error: any) {
    console.error('[VERIFY] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error. Try again.' },
      { status: 500 }
    );
  }
}
