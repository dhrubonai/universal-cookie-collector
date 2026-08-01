import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

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

    // Extract oobCode and construct proper URLs from the verification link
    let oobCode = '';
    let authActionUrl = '';
    
    try {
      const url = new URL(link);
      
      // Try to get oobCode from main URL params first
      oobCode = url.searchParams.get('oobCode') || '';
      
      if (oobCode) {
        // Direct link format - construct auth_action URL
        const apiKey = url.searchParams.get('apiKey') || 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0';
        const mode = url.searchParams.get('mode') || 'signIn';
        authActionUrl = `https://alightcreative.com/auth_action?apiKey=${apiKey}&mode=${mode}&oobCode=${oobCode}`;
      }
      
      // If not in main URL params, check the nested link parameter (firebase link format)
      if (!oobCode) {
        const linkParam = url.searchParams.get('link');
        if (linkParam) {
          const nestedUrl = new URL(decodeURIComponent(linkParam));
          oobCode = nestedUrl.searchParams.get('oobCode') || '';
          
          if (oobCode) {
            const apiKey = nestedUrl.searchParams.get('apiKey') || 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0';
            const mode = nestedUrl.searchParams.get('mode') || 'signIn';
            // Use the continueUrl which should be alightcreative.com/auth_action
            authActionUrl = `https://alightcreative.com/auth_action?apiKey=${apiKey}&mode=${mode}&oobCode=${oobCode}`;
          }
        }
      }
    } catch (e) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification link format. Make sure you copied the full link.' },
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
    const validOobCodeFormat = /^[A-Za-z0-9_-]{20,}$/;
    if (!validOobCodeFormat.test(oobCode)) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification code format.' },
        { status: 400 }
      );
    }

    // CRITICAL NEW APPROACH:
    // Instead of consuming the oobCode on server (which doesn't activate premium),
    // we validate the code format and return the ACTIVATION URL for user to click
    // This ensures the browser completes the full Firebase + Alight Motion flow
    
    // Log successful validation
    addHistoryItem(email, 'activated');

    return NextResponse.json({
      success: true,
      message: '✅ Verification validated! Click the button below to COMPLETE PREMIUM ACTIVATION',
      actionRequired: true,
      actionType: 'browser_redirect',
      email: email.trim(),
      activationUrl: authActionUrl,
      instruction: 'IMPORTANT: You MUST click the activation button below to finish activating Premium. This will open Alight Motion\'s official page to complete authentication.'
    });

  } catch (error: any) {
    console.error('Verify API error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
