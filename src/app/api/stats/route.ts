import { NextResponse } from 'next/server';

// In-memory storage (in production, use Vercel KV or external database)
let stats = {
  daily: 269,
  dailyMax: 500,
  total: 1004
};

let history: Array<{
  email: string;
  action: string;
  time: string;
}> = [
  // Sample history data
  { email: 'k***@luxpremium.org', action: 'activated', time: new Date().toISOString() },
  { email: 'a***@gmail.com', action: 'link_sent', time: new Date(Date.now() - 60000).toISOString() },
];

export async function GET() {
  return NextResponse.json({
    ...stats,
    history: history.slice(0, 100).reverse()
  });
}

// Export helper function for other routes to use
export function addHistoryItem(email: string, action: string) {
  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
  history.push({
    email: maskedEmail,
    action,
    time: new Date().toISOString()
  });
  
  // Keep only last 1000 items
  if (history.length > 1000) {
    history = history.slice(-1000);
  }
  
  if (action === 'link_sent' || action === 'activated') {
    stats.total++;
    stats.daily++;
  }
}
