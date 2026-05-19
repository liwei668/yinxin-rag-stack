import { NextResponse } from 'next/server';
import { logger } from '../../../../src/lib/logger';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });

  return response;
}
