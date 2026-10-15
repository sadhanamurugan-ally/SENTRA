import type { AlertRecord, AppSettings, EnvironmentalData, Location, RiskAssessment } from '../types'

const keys = {
  locations: 'citypulse.locations.v1',
  settings: 'citypulse.settings.v1',
  alerts: 'citypulse.alerts.v1',
  observations: 'citypulse.observations.v1',
  assessments: 'citypulse.assessments.v1',
}

const initialLocations: Location[] = [
  { id: 'loc-north', name: 'North River Works', latitude: 40.7128, longitude: -74.006, region: 'North district', createdAt: new Date().toISOString() },
  { id: 'loc-east', name: 'Eastpoint Industrial Park', latitude: 40.7282, longitude: -73.7949, region: 'East district', createdAt: new Date().toISOString() },
  { id: 'loc-south', name: 'South Harbor Refinery', latitude: 40.5795, longitude: -73.9707, region: 'Harbor district', createdAt: new Date().toISOString() },
]

export const defaultSettings: AppSettings = {
  demoMode: true,
  pollutionThreshold: 35,
  temperatureDeviation: 8,
  notifications: true,
}

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch (error) {
    console.error(`Could not read ${key} from browser storage`, error)
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Could not save ${key} to browser storage`, error)
  }
}

export const storage = {
  locations: () => read<Location[]>(keys.locations, initialLocations),
  saveLocations: (value: Location[]) => write(keys.locations, value),
  settings: () => ({ ...defaultSettings, ...read<Partial<AppSettings>>(keys.settings, {}) }),
  saveSettings: (value: AppSettings) => write(keys.settings, value),
  alerts: () => read<AlertRecord[]>(keys.alerts, []),
  saveAlerts: (value: AlertRecord[]) => write(keys.alerts, value),
  observations: () => read<Record<string, EnvironmentalData>>(keys.observations, {}),
  saveObservations: (value: Record<string, EnvironmentalData>) => write(keys.observations, value),
  assessments: () => read<Record<string, RiskAssessment>>(keys.assessments, {}),
  saveAssessments: (value: Record<string, RiskAssessment>) => write(keys.assessments, value),
}
