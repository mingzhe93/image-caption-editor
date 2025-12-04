import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let dirPath = searchParams.get('path');

  // Default to home directory if no path provided
  if (!dirPath) {
    dirPath = os.homedir();
  }

  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    const directories = items
      .filter(item => item.isDirectory() && !item.name.startsWith('.')) // Exclude hidden dirs
      .map(item => item.name);

    return NextResponse.json({ 
      path: dirPath,
      directories: directories,
      parent: path.dirname(dirPath)
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
