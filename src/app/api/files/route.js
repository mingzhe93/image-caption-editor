import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  try {
    const files = await fs.promises.readdir(dirPath);
    
    // Filter for image files
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    // Map images to their expected text file
    const data = imageFiles.map(imageFile => {
      const ext = path.extname(imageFile);
      const baseName = path.basename(imageFile, ext);
      const textFile = `${baseName}.txt`;
      
      // Check if text file exists
      const hasTextFile = files.includes(textFile);

      return {
        image: imageFile,
        text: hasTextFile ? textFile : null,
        baseName: baseName
      };
    });

    return NextResponse.json({ files: data });
  } catch (error) {
    console.error('Error reading directory:', error);
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
