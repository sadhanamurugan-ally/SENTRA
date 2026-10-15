export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical'
export type AlertStatus = 'New' | 'Under Review' | 'Resolved'
export type PageKey = 'Overview' | 'Live Monitoring' | 'Industrial Locations' | 'Environmental Trends' | 'Risk Analysis' | 'Alerts' | 'Settings'
export type RangeKey = '24h' | '7d' | '14d'

export interface Location {
  id: string
  name: string
  latitude: number
  longitude: number
  region: string
  createdAt: string
}

export interface WeatherReading {
  time: string
  temperature: number | null
  humidity: number | null
  windSpeed: number | null
  windDirection: number | null
  rainfall: number | null
  isForecast: boolean
}

export interface PollutantReading {
  key: 'pm2_5' | 'pm10' | 'nitrogen_dioxide' | 'sulphur_dioxide' | 'carbon_monoxide' | 'ozone'
  label: string
  shortLabel: string
  value: number
  unit: string
  time: string
  source: string
}

export interface EnvironmentalData {
  weather: WeatherReading[]
  pollutants: PollutantReading[]
  source: 'live' | 'demo'
  fetchedAt: string
  current: WeatherReading | null
  error?: string
}

export interface RiskAssessment {
  score: number
  level: RiskLevel
  previousScore: number | null
  factors: { label: string; detail: string; points: number }[]
  warning: string | null
  completeness: number
}

export interface AlertRecord {
  id: string
  locationId: string
  locationName: string
  riskLevel: RiskLevel
  detectedAt: string
  factors: string[]
  explanation: string
  recommendations: string[]
  status: AlertStatus
  history: { status: AlertStatus; at: string }[]
  fingerprint: string
}

export interface AppSettings {
  demoMode: boolean
  pollutionThreshold: number
  temperatureDeviation: number
  notifications: boolean
}
