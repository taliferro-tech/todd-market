const PHOTO_EDGE = 1600;

/** Long edge at most 1600px, as JPEG. HEIC only decodes where the browser can (Safari). */
export async function shrinkPhoto ( file: File ): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap( file );
  } catch {
    throw new Error( "Can't read this photo. Save it as JPG." );
  }
  const scale = Math.min( 1, PHOTO_EDGE / Math.max( bitmap.width, bitmap.height ) );
  const canvas = document.createElement( 'canvas' );
  canvas.width = Math.round( bitmap.width * scale );
  canvas.height = Math.round( bitmap.height * scale );
  const ctx = canvas.getContext( '2d' )!;
  ctx.fillStyle = '#fff';
  ctx.fillRect( 0, 0, canvas.width, canvas.height );
  ctx.drawImage( bitmap, 0, 0, canvas.width, canvas.height );
  bitmap.close();
  return canvas.toDataURL( 'image/jpeg', 0.85 );
}
