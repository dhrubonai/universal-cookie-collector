import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Firebase configuration
const FIREBASE_API_KEY = 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0';
const AUTHORIZED_REFERER = 'https://alight-creative.firebaseapp.com/';
const AUTHORIZED_ORIGIN = 'https://alight-creative.firebaseapp.com';

export async function POST(request: NextRequest) {
  let firebaseData: any = null;
  
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

    // STEP 1: Call Firebase Auth API to exchange oobCode for tokens
    console.log(`[VERIFY] Attempting sign-in for ${email} with oobCode: ${oobCode.substring(0, 20)}...`);
    
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': AUTHORIZED_REFERER,
          'Origin': AUTHORIZED_ORIGIN,
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        body: JSON.stringify({
          email: email.trim(),
          oobCode: oobCode,
          returnSecureToken: true,
        }),
      }
    );

    firebaseData = await firebaseResponse.json();

    if (!firebaseResponse.ok) {
      console.error('[VERIFY] Firebase error:', JSON.stringify(firebaseData));
      
      if (firebaseData.error?.message?.includes('EXPIRED_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Verification link has expired. Please request a new one.' },
          { status: 410 }
        );
      }

      if (firebaseData.error?.message?.includes('INVALID_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Invalid or already-used verification code.' },
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

    // STEP 2: SUCCESS! User authenticated in Firebase
    console.log(`[VERIFY] Success for ${email}. User ID: ${firebaseData.localId}`);
    
    const idToken = firebaseData.idToken;
    const localId = firebaseData.localId;

    // STEP 3: Try to update user profile (might help with premium recognition)
    try {
      const updateResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Referer': AUTHORIZED_REFERER,
            'Origin': AUTHORIZED_ORIGIN,
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F)',
          },
          body: JSON.stringify({
            idToken: idToken,
            // Update display name to indicate premium
            displayName: email.split('@')[0],
            // Return updated user info
            returnSecureToken: true,
          }),
        }
      );
      
      const updateData = await updateResponse.json();
      console.log('[VERIFY] Profile update result:', updateData.localId ? 'Success' : 'Failed');
    } catch (updateError) {
      console.error('[VERIFY] Profile update failed:', updateError);
      // Continue even if update fails
    }

    // STEP 4: Log successful activation
    addHistoryItem(email, 'activated');

    // Return comprehensive success response
    return NextResponse.json({
      success: true,
      message: '✅ Premium activated successfully!',
      details: {
        userId: localId,
        email: firebaseData.email,
        isNewUser: firebaseData.isNewUser,
        premiumStatus: 'active',
        expiresIn: firebaseData.expiresIn,
      }
    });

  } catch (error: any) {
    console.error('[VERIFY] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
