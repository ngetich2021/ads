import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export type UploadResult = { url: string; publicId: string }

export async function uploadFile(
  data: Buffer | string,
  options: { folder?: string; resourceType?: 'image' | 'raw' | 'auto'; filename?: string } = {}
): Promise<UploadResult> {
  const { folder = 'ads', resourceType = 'auto', filename } = options

  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, unknown> = {
      folder,
      resource_type: resourceType,
      use_filename: !!filename,
      unique_filename: true,
    }
    if (filename) uploadOptions.public_id = filename.replace(/\.[^/.]+$/, '')

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
      if (err || !result) return reject(err ?? new Error('Upload failed'))
      resolve({ url: result.secure_url, publicId: result.public_id })
    })

    if (typeof data === 'string') {
      // base64 data URL
      cloudinary.uploader.upload(data, uploadOptions, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'))
        resolve({ url: result.secure_url, publicId: result.public_id })
      })
    } else {
      stream.end(data)
    }
  })
}

export async function uploadBase64Image(
  base64: string,
  folder = 'ads/verification'
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      base64,
      { folder, resource_type: 'image', unique_filename: true },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'))
        resolve({ url: result.secure_url, publicId: result.public_id })
      }
    )
  })
}
