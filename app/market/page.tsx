import type { Metadata } from 'next'
import { getAllData, getDropShipItems, getPublicChallenges, getRoutes, getNews } from './actions'
import MarketClient from './client'

export const metadata: Metadata = {
  title: 'Market Prices | Kwenik',
  description: 'Real-time commodity prices from markets across Kenya',
}

export default async function MarketPage() {
  const [{ countries, counties, items, prices }, dropShipItems, challenges, routes, news] = await Promise.all([
    getAllData(),
    getDropShipItems(),
    getPublicChallenges(),
    getRoutes(),
    getNews(),
  ])
  return (
    <MarketClient
      countries={countries}
      counties={counties}
      items={items}
      prices={prices}
      dropShipItems={dropShipItems}
      challenges={challenges}
      routes={routes}
      news={news}
    />
  )
}
