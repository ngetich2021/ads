import { signIn } from '@/auth'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const session = await auth()
  if (session) redirect('/dashboard')

  const { callbackUrl, error } = await searchParams
  const redirectTo = callbackUrl ?? '/dashboard'

  return (
    <div className="min-h-screen bg-linear-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-violet-600 to-indigo-700 shadow-lg shadow-violet-200 mb-4">
            <span className="text-3xl font-black text-white">K</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Kwenik <span className="text-violet-600">Market</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">Real-time commodity prices across Kenya</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-violet-100 border border-violet-100 p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Sign in to manage </h2>
          <p className="text-sm text-gray-500 mb-6">
            Sign in with your Google account to continue.
          </p>

          {/* Error banner */}
          {error === 'EmailNotAllowed' && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
              Email not found. Contact an administrator to request access.
            </div>
          )}

          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all"
            >
              {/* Google G icon */}
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
              Continue with Google
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-400">
            By signing in you agree to manage responsibly.
          </p>
        </div>

        {/* Back to market */}
        <div className="mt-5 text-center">
          <a href="/market" className="text-sm text-violet-600 hover:text-violet-700 font-medium">
            ← View market prices without signing in
          </a>
        </div>
      </div>
    </div>
  )
}
