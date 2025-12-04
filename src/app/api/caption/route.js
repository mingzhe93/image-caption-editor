import { NextResponse } from 'next/server';
import fs from 'fs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  try {
    // If file doesn't exist, return empty string
    try {
        await fs.promises.access(filePath);
    } catch {
        return NextResponse.json({ content: '' });
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { path: filePath, content } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    await fs.promises.writeFile(filePath, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error writing file:', error);
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
