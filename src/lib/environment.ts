import type { EnvironmentalData, Location, PollutantReading, WeatherReading } from '../types'

const pollutants = [
  { key: 'pm2_5', label: 'PM2.5', shortLabel: 'PM2.5', unit: 'μg/m³' },
  { key: 'pm10', label: 'PM10', shortLabel: 'PM10', unit: 'μg/m³' },
  { key: 'nitrogen_dioxide', label: 'Nitrogen dioxide', shortLabel: 'NO₂', unit: 'μg/m³' },
  { key: 'sulphur_dioxide', label: 'Sulphur dioxide', shortLabel: 'SO₂', unit: 'μg/m³' },
  { key: 'carbon_monoxide', label: 'Carbon monoxide', shortLabel: 'CO', unit: 'μg/m³' },
  { key: 'ozone', label: 'Ozone', shortLabel: 'O₃', unit: 'μg/m³' },
] as const

export function buildDemoData(location: Location, now = new Date()): EnvironmentalData {
  const hour = now.getHours()
  const seed = location.latitude * 8 + location.longitude * 3
  const weather: WeatherReading[] = []
  for (let i = -48; i <= 24; i += 1) {
    const time = new Date(now.getTime() + i * 60 * 60 * 1000)
    const wave = Math.sin((hour + i) / 4)
    weather.push({
      time: time.toISOString(),
      temperature: Math.round((18 + wave * 5 + Math.sin(seed) * 2 + (i > 16 ? 1.5 : 0)) * 10) / 10,
      humidity: Math.round(56 + Math.cos((hour + i) / 5) * 15 + (location.id === 'loc-south' ? 8 : 0)),
      windSpeed: Math.round((13 + Math.sin((hour + i) / 3) * 5 + Math.cos(seed) * 2) * 10) / 10,
      windDirection: (220 + i * 7 + Math.abs(seed)) % 360,
      rainfall: Math.max(0, Math.round((Math.sin((hour + i) / 3) - 0.6) * 10) / 10),
      isForecast: i > 0,
    })
  }
  const pollutantValues = location.id === 'loc-south'
    ? [64, 88, 51, 8, 210, 64]
    : location.id === 'loc-east'
      ? [27, 39, 18, 5, 180, 72]
      : [18, 28, 12, 4, 150, 58]
  const pollutantsData = pollutants.map((pollutant, index): PollutantReading => ({
    key: pollutant.key,
    label: pollutant.label,
    shortLabel: pollutant.shortLabel,
    unit: pollutant.unit,
    value: pollutantValues[index],
    time: now.toISOString(),
    source: 'CityPulse demo sample',
  }))
  return {
    weather,
    pollutants: pollutantsData,
    source: 'demo',
    fetchedAt: now.toISOString(),
    current: weather[48],
  }
}

export function mergeObservationHistory(previous: EnvironmentalData | undefined, incoming: EnvironmentalData): EnvironmentalData {
  const hourlyHistory = new Map<string, WeatherReading>()
  previous?.weather.filter((reading) => !reading.isForecast).forEach((reading) => hourlyHistory.set(reading.time, reading))
  incoming.weather.filter((reading) => !reading.isForecast).forEach((reading) => hourlyHistory.set(reading.time, reading))
  const historical = [...hourlyHistory.values()]
    .sort((first, second) => first.time.localeCompare(second.time))
    .slice(-336)
  const forecast = incoming.weather.filter((reading) => reading.isForecast)
  return { ...incoming, weather: [...historical, ...forecast] }
}

interface OpenMeteoWeather {
  current?: { time?: string; temperature_2m?: number; relative_humidity_2m?: number; wind_speed_10m?: number; wind_direction_10m?: number; precipitation?: number }
  hourly?: { time?: string[]; temperature_2m?: number[]; relative_humidity_2m?: number[]; wind_speed_10m?: number[]; wind_direction_10m?: number[]; precipitation?: number[] }
}

interface OpenMeteoAir {
  hourly?: Record<string, string[] | number[]>
}

export async function fetchEnvironmentalData(location: Location): Promise<EnvironmentalData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation',
    hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation',
    past_days: '7',
    forecast_days: '7',
    timezone: 'UTC',
  })
  const airParams = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: 'pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone',
    past_days: '2',
    forecast_days: '5',
    timezone: 'UTC',
  })
  const [weatherResponse, airResponse] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`).catch(() => null),
  ])
  if (!weatherResponse.ok) throw new Error(`Weather service returned ${weatherResponse.status}. Try again or enable demo mode.`)
  const weatherPayload = await weatherResponse.json() as OpenMeteoWeather
  const airPayload = airResponse?.ok ? await airResponse.json() as OpenMeteoAir : null
  const hourly = weatherPayload.hourly
  const weather: WeatherReading[] = (hourly?.time ?? []).map((time, index) => ({
    time: new Date(time).toISOString(),
    temperature: hourly?.temperature_2m?.[index] ?? null,
    humidity: hourly?.relative_humidity_2m?.[index] ?? null,
    windSpeed: hourly?.wind_speed_10m?.[index] ?? null,
    windDirection: hourly?.wind_direction_10m?.[index] ?? null,
    rainfall: hourly?.precipitation?.[index] ?? null,
    isForecast: new Date(time).getTime() > Date.now(),
  }))
  const currentPayload = weatherPayload.current
  const currentTime = currentPayload?.time ? new Date(currentPayload.time).toISOString() : new Date().toISOString()
  const current: WeatherReading | null = currentPayload ? {
    time: currentTime,
    temperature: currentPayload.temperature_2m ?? null,
    humidity: currentPayload.relative_humidity_2m ?? null,
    windSpeed: currentPayload.wind_speed_10m ?? null,
    windDirection: currentPayload.wind_direction_10m ?? null,
    rainfall: currentPayload.precipitation ?? null,
    isForecast: false,
  } : weather.find((entry) => !entry.isForecast) ?? null
  const airTime = airPayload?.hourly?.time as string[] | undefined
  const nowIndex = airTime ? airTime.reduce((selected, time, index) => {
    if (new Date(time).getTime() <= Date.now()) return index
    return selected
  }, -1) : -1
  const airReadings: PollutantReading[] = []
  if (airPayload?.hourly && airTime && nowIndex >= 0) {
    for (const pollutant of pollutants) {
      const values = airPayload.hourly[pollutant.key] as number[] | undefined
      const value = values?.[nowIndex]
      if (typeof value === 'number' && Number.isFinite(value)) {
        airReadings.push({
          key: pollutant.key,
          label: pollutant.label,
          shortLabel: pollutant.shortLabel,
          value,
          unit: pollutant.unit,
          time: new Date(airTime[nowIndex]).toISOString(),
          source: 'Open-Meteo Air Quality API',
        })
      }
    }
  }
  return { weather, pollutants: airReadings, source: 'live', fetchedAt: new Date().toISOString(), current }
}
