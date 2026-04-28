import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      // Bootstrap: if no emails are registered yet, allow sign-in so the first admin can add theirs
      const count = await db.allowedEmail.count()
      if (count === 0) return true
      const allowed = await db.allowedEmail.findUnique({ where: { email: user.email } })
      if (!allowed) return '/login?error=EmailNotAllowed'
      return true
    },
    session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
      }
      return session
    },
  },
})
