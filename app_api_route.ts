
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

// Prevent caching to ensure real-time-like behavior
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch the single JSON blob used for the entire app state
    const result = await sql`
      SELECT data FROM monitor_app_data WHERE key_name = 'global_store' LIMIT 1;
    `;
    
    // If no data exists yet, return null or empty structure (frontend handles defaults)
    const data = result.rows[0]?.data || null;
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Database Error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Upsert the data (update if exists, insert if not)
    // We store the entire state as one JSONB blob for simplicity given the nested structure
    await sql`
      INSERT INTO monitor_app_data (key_name, data, updated_at)
      VALUES ('global_store', ${JSON.stringify(body)}::jsonb, NOW())
      ON CONFLICT (key_name) 
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Database Error:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}
