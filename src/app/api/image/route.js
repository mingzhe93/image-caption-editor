import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// import mime from 'mime'; // We might need to install this, or just map manually for simplicity

// Simple mime type map to avoid dependency if possible, or we can install 'mime'
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  try {
    // Basic security check: ensure we are reading a file, not a directory
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
       return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const contentType = getMimeType(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
      },
    });
  } catch (error) {
    console.error('Error reading image:', error);
    return NextResponse.json({ error: 'Failed to read image' }, { status: 500 });
  }
}
