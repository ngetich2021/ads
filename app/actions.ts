'use server'

import { signOut } from '@/auth'
import { uploadBase64Image } from '@/lib/cloudinary'

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}

export async function uploadBase64(dataUrl: string, folder: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('Invalid image data.')
  const result = await uploadBase64Image(dataUrl, folder)
  return result.url
}
