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

    // Extract oobCode from the verification link
    let oobCode = '';
    let extractedLink = '';
    
    try {
      const url = new URL(link);
      
      // Try to get oobCode from main URL params first
      oobCode = url.searchParams.get('oobCode') || '';
      
      if (oobCode) {
        // The link might be the direct auth_action URL
        extractedLink = link;
      }
      
      // If not in main URL params, check the nested link parameter
      if (!oobCode) {
        const linkParam = url.searchParams.get('link');
        if (linkParam) {
          const nestedUrl = new URL(decodeURIComponent(linkParam));
          oobCode = nestedUrl.searchParams.get('oobCode') || '';
          extractedLink = decodeURIComponent(linkParam);
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
        { success: false, message: 'Could not extract verification code from link. Please make sure you copied the complete link from the email.' },
        { status: 400 }
      );
    }

    // Validate oobCode format (Firebase oobCodes are base64url encoded strings, typically 50+ chars)
    const validOobCodeFormat = /^[A-Za-z0-9_-]{20,}$/;
    if (!validOobCodeFormat.test(oobCode)) {
      return NextResponse.json(
        { success: false, message: 'Invalid verification code format. The link appears to be corrupted.' },
        { status: 400 }
      );
    }

    // CRITICAL FIX: Do NOT call signInWithEmailLink here!
    // Calling signInWithEmailLink CONSUMS the one-time-use oobCode
    // After consumption, the Alight Motion app cannot use it
    //
    // Instead, we validate the format and guide the user to complete 
    // verification by clicking the link (which preserves the oobCode for proper use)
    
    // Log the activation attempt
    addHistoryItem(email, 'activated');

    // Return success with the proper action link
    // The frontend should instruct user to click this link
    return NextResponse.json({
      success: true,
      message: 'Verification link validated! Complete activation by clicking the button below.',
      action: 'click_to_activate',
      email: email.trim(),
      activationUrl: extractedLink || link,
      instruction: 'Click the "Complete Activation" button to finish activating Premium. This will open the verification link in your browser.'
    });

  } catch (error: any) {
    console.error('Verify API error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

// GET endpoint to provide instructions
export async function GET() {
  return NextResponse.json({
    message: 'POST email and verification link to validate',
    instructions: {
      step1: 'Send verification email using /api/send',
      step2: 'Check email for verification link', 
      step3: 'POST to /api/verif with email and link to validate',
      step4: 'Click the activation link to complete Premium activation'
    }
  });
}
