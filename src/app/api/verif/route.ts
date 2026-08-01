import { NextRequest, NextResponse } from 'next/server';
import { addHistoryItem } from '../stats/route';

// Original website API (already authorized with Firebase)
const ORIGINAL_API = 'https://ap.rifan.dev/api/verif';

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

    // Proxy request to original API (which has Firebase access)
    const response = await fetch(ORIGINAL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, link }),
    });

    const data = await response.json();

    // Log successful activation
    if (data.success) {
      addHistoryItem(email, 'activated');
    }

    return NextResponse.json(data, { status: response.status });

  } catch (error: any) {
    console.error('Verify API error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
