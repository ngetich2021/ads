import type { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import {
  getAllData, getAllowedEmails, getUserProfile, getDropShipItems, getChallengesAdmin,
  getNeedRequests, getRoutes, getNews, getDropShipSales, getAgentVerifications,
} from '@/app/market/actions'
import { getAdsAdmin, getAdPackagesAdmin } from '@/app/ads/actions'
import DashboardClient from './client'

export const metadata: Metadata = {
  title: 'Dashboard | Kwenik Market',
  description: 'Manage commodity prices across Kenyan markets',
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userEmail = session.user.email ?? ''
  const [
    data, allowedEmails, userProfile, dropShipItems, challenges, needRequests,
    routes, news, dropShipSales, agentVerifications, ads, adPackages,
  ] = await Promise.all([
    getAllData(),
    getAllowedEmails(),
    getUserProfile(userEmail),
    getDropShipItems(),
    getChallengesAdmin(),
    getNeedRequests(),
    getRoutes(),
    getNews(),
    getDropShipSales(),
    getAgentVerifications(),
    getAdsAdmin(),
    getAdPackagesAdmin(),
  ])

  const userRecord = allowedEmails.find((e: { email: string }) => e.email === userEmail)
  const userCountyId = userRecord?.countyId ?? null
  const userRoles = userRecord?.roles ?? []
  const userMarketIds = userRecord?.marketIds ?? []

  return (
    <DashboardClient
      {...data}
      allowedEmails={allowedEmails}
      userCountyId={userCountyId}
      userRoles={userRoles}
      userMarketIds={userMarketIds}
      userProfile={userProfile}
      dropShipItems={dropShipItems}
      challenges={challenges}
      needRequests={needRequests}
      routes={routes}
      news={news}
      dropShipSales={dropShipSales}
      agentVerifications={agentVerifications}
      ads={ads}
      adPackages={adPackages}
      user={{
        name: session.user.name ?? 'Admin',
        email: userEmail,
        image: session.user.image ?? null,
      }}
    />
  )
}
