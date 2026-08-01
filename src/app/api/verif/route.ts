import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// CURRENT Firebase project from alightcreative.com (official site)
const FIREBASE_API_KEY = 'AIzaSyAAh--qI_hEEF3AN26HADZ-I5TKPOZrZqA';
const AUTHORIZED_REFERER = 'https://alightcreative.com/';
const AUTHORIZED_ORIGIN = 'https://alightcreative.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, link } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    if (!link || typeof link !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Verification link required' },
        { status: 400 }
      );
    }

    // Extract oobCode
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
        { success: false, message: 'Invalid link format' },
        { status: 400 }
      );
    }

    if (!oobCode) {
      return NextResponse.json(
        { success: false, message: 'Cannot extract code' },
        { status: 400 }
      );
    }

    console.log(`[VERIFY] Auth ${email} with WORKING key...`);

    // Call signInWithEmailLink with WORKING key
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

    if (!firebaseResponse.ok) {
      console.error('[VERIFY] Error:', firebaseData);
      
      const msg = firebaseData.error?.message || '';
      
      if (msg.includes('EXPIRED_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Link expired. Get new one.' },
          { status: 410 }
        );
      }

      if (msg.includes('INVALID_OOB_CODE')) {
        return NextResponse.json(
          { success: false, message: 'Invalid or used code.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, message: msg || 'Failed' },
        { status: 500 }
      );
    }

    // ✅ SUCCESS! User authenticated
    console.log(`[VERIFY] ✅ User: ${firebaseData.localId}`);
    
    addHistoryItem(email, 'activated');

    return NextResponse.json({
      success: true,
      message: '✅ PREMIUM ACTIVATED! Open Alight Motion app now!',
      userId: firebaseData.localId,
      isNewUser: firebaseData.isNewUser
    });

  } catch (error: any) {
    console.error('[VERIFY] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error.' },
      { status: 500 }
    );
  }
}
