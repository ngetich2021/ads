import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function sendAdApprovalEmail({
  to,
  name,
  title,
  adId,
  invoiceAmount,
  adminNotes,
}: {
  to: string
  name: string
  title: string
  adId: string
  invoiceAmount: number
  adminNotes?: string | null
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const statusUrl = `${appUrl}/ads/${adId}/pay`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Ad Is Now Live</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4338ca,#6d28d9);padding:32px 32px 24px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Kwenik Ads</h1>
      <p style="margin:6px 0 0;color:#c4b5fd;font-size:13px;">Ad Management Platform</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;font-weight:700;color:#15803d;font-size:15px;">✅ Your ad is approved and now live!</p>
        <p style="margin:4px 0 0;color:#166534;font-size:13px;">Your campaign has started running across our platform.</p>
      </div>

      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 8px;">Hi <strong>${name}</strong>,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Great news — your ad <strong>"${title}"</strong> has been reviewed, approved, and is now running.
        Your payment of <strong>KSh ${invoiceAmount.toLocaleString()}</strong> has already been received.
      </p>

      ${adminNotes ? `
      <!-- Admin notes -->
      <div style="background:#fefce8;border-left:4px solid #fbbf24;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Note from admin</p>
        <p style="margin:6px 0 0;color:#78350f;font-size:14px;">${adminNotes}</p>
      </div>` : ''}

      <!-- CTA button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${statusUrl}" style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6d28d9);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.2px;">
          View Ad Status →
        </a>
      </div>

      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        Your ad will run for the full duration of your chosen package. Track its status using the button above.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Kwenik Ads · This email was sent to ${to} because you submitted an ad.<br/>
        Need help? Reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
`

  const text = `
Hi ${name},

Your ad "${title}" has been approved and is now live!

Your payment of KSh ${invoiceAmount.toLocaleString()} has already been received.
${adminNotes ? `\nNote from admin: ${adminNotes}\n` : ''}
Track your ad status here: ${statusUrl}

- Kwenik Ads
`.trim()

  await transporter.sendMail({
    from: `"Kwenik Ads" <${process.env.GMAIL_USER}>`,
    to,
    subject: `✅ Your ad "${title}" is approved and now live`,
    html,
    text,
  })
}

export async function sendAdRejectionEmail({
  to, name, title, reason,
}: {
  to: string; name: string; title: string; reason?: string | null
}) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Ad Rejected</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#4338ca,#6d28d9);padding:32px 32px 24px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Kwenik Ads</h1>
      <p style="margin:6px 0 0;color:#c4b5fd;font-size:13px;">Ad Management Platform</p>
    </div>
    <div style="padding:32px;">
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;font-weight:700;color:#dc2626;font-size:15px;">Your ad was not approved</p>
        <p style="margin:4px 0 0;color:#b91c1c;font-size:13px;">Please review the reason below and resubmit.</p>
      </div>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 8px;">Hi <strong>${name}</strong>,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Unfortunately your ad <strong>"${title}"</strong> was not approved after review.
      </p>
      ${reason ? `
      <div style="background:#fefce8;border-left:4px solid #fbbf24;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;">Reason from admin</p>
        <p style="margin:6px 0 0;color:#78350f;font-size:14px;">${reason}</p>
      </div>` : ''}
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        You may submit a new ad after addressing the issue. Reply to this email if you have questions.
      </p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Kwenik Ads · Sent to ${to}</p>
    </div>
  </div>
</body>
</html>`

  const text = `Hi ${name},\n\nYour ad "${title}" was not approved.\n${reason ? `\nReason: ${reason}\n` : ''}\nPlease resubmit after addressing the issue.\n\n- Kwenik Ads`.trim()

  await transporter.sendMail({
    from: `"Kwenik Ads" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Your ad "${title}" was not approved`,
    html,
    text,
  })
}
