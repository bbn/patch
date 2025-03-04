import { saveToKV, getFromKV, listKeysFromKV } from '@/lib/kv';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test saving to KV
    const testKey = 'test-key';
    const testValue = { timestamp: Date.now(), message: 'Hello from KV test!' };
    
    await saveToKV(testKey, testValue);
    console.log('Successfully saved to KV');
    
    // Test retrieving from KV
    const retrievedValue = await getFromKV(testKey);
    console.log('Retrieved from KV:', retrievedValue);
    
    // Test listing keys
    const keys = await listKeysFromKV('*');
    console.log('Keys in KV:', keys);
    
    return NextResponse.json({
      success: true,
      message: 'KV connection successful',
      retrieved: retrievedValue,
      keys: keys
    });
  } catch (error) {
    console.error('KV test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}