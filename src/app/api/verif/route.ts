import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Firebase configuration
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
    let apiKey = FIREBASE_API_KEY;
    
    try {
      const url = new URL(link);
      
      // Try to get oobCode from main URL params first
      oobCode = url.searchParams.get('oobCode') || '';
      apiKey = url.searchParams.get('apiKey') || apiKey;
      
      // If not in main URL params, check the nested link parameter
      if (!oobCode) {
        const linkParam = url.searchParams.get('link');
        if (linkParam) {
          const nestedUrl = new URL(decodeURIComponent(linkParam));
          oobCode = nestedUrl.searchParams.get('oobCode') || '';
          apiKey = nestedUrl.searchParams.get('apiKey') || apiKey;
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
        { success: false, message: 'Could not extract verification code from link.' },
        { status: 400 }
      );
    }

    // Validate oobCode format
    if (!/^[A-Za-z0-9_-]{20,}$/.test(oobCode)) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification code format.' },
        { status: 400 }
      );
    }

    // NEW APPROACH: Instead of consuming oobCode on server,
    # construct the proper Alight Motion auth_action URL for browser completion
    const authActionUrl = `https://alightcreative.com/auth_action?apiKey=${apiKey}&mode=signIn&oobCode=${oobCode}`;
    
    // Log the activation attempt
    addHistoryItem(email, 'activated');

    // Return the URL for frontend to open
    return NextResponse.json({
      success: true,
      message: '✅ Verification validated! Click the button below to ACTIVATE PREMIUM',
      actionRequired: true,
      actionType: 'redirect_to_alightmotion',
      activationUrl: authActionUrl,
      instruction: 'Click the button below. It will open Alight Motion\'s official page to complete Premium activation.'
    });

  } catch (error: any) {
    console.error('[VERIFY] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 }
    );
  }
}
