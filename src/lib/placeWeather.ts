export interface SelectedPlace {
  id: string
  label: string
  latitude: number
  longitude: number
  country: string
  state: string
  city: string
  address: string
  source: 'Nominatim search' | 'Map selection' | 'GPS'
}

interface NominatimAddress {
  country?: string
  state?: string
  province?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  county?: string
  suburb?: string
}

interface NominatimPlace {
  place_id: number
  lat: string
  lon: string
  display_name: string
  name?: string
  address?: NominatimAddress
}

export interface WeatherPoint {
  time: string
  temperature: number | null
  precipitationProbability: number | null
  windSpeed: number | null
  weatherCode: number | null
}

export interface PlaceWeather {
  fetchedAt: string
  current: {
    time: string
    temperature: number | null
    feelsLike: number | null
    humidity: number | null
    windSpeed: number | null
    windDirection: number | null
    precipitation: number | null
    pressure: number | null
    weatherCode: number | null
  }
  visibility: number | null
  hourly: WeatherPoint[]
  daily: {
    date: string
    minTemperature: number | null
    maxTemperature: number | null
    precipitationProbability: number | null
    windSpeed: number | null
    weatherCode: number | null
  }[]
}

interface OpenMeteoForecast {
  current?: {
    time?: string
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    wind_direction_10m?: number
    precipitation?: number
    pressure_msl?: number
    weather_code?: number
  }
  hourly?: {
    time?: string[]
    visibility?: number[]
    temperature_2m?: number[]
    precipitation_probability?: number[]
    wind_speed_10m?: number[]
    weather_code?: number[]
  }
  daily?: {
    time?: string[]
    temperature_2m_min?: number[]
    temperature_2m_max?: number[]
    precipitation_probability_max?: number[]
    wind_speed_10m_max?: number[]
    weather_code?: number[]
  }
}

function addressCity(address?: NominatimAddress): string {
  return address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? address?.suburb ?? ''
}

function toPlace(item: NominatimPlace, source: SelectedPlace['source']): SelectedPlace {
  const latitude = Number(item.lat)
  const longitude = Number(item.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('Geocoding service returned invalid coordinates.')
  }
  return {
    id: `place-${item.place_id}`,
    label: item.name || item.display_name.split(',')[0] || 'Selected location',
    latitude,
    longitude,
    country: item.address?.country ?? '',
    state: item.address?.state ?? item.address?.province ?? '',
    city: addressCity(item.address),
    address: item.display_name,
    source,
  }
}

async function nominatimFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const minimumInterval = 1100
  const scheduledAt = Math.max(Date.now(), nextNominatimRequestAt)
  nextNominatimRequestAt = scheduledAt + minimumInterval
  const wait = scheduledAt - Date.now()
  if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait))
  if (signal?.aborted) throw new DOMException('Geocoding request was cancelled.', 'AbortError')
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`OpenStreetMap geocoding returned HTTP ${response.status}.`)
  return response
}

let nextNominatimRequestAt = 0

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<SelectedPlace[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '8',
    'accept-language': 'en',
  }).toString()
  const response = await nominatimFetch(url.toString(), signal)
  const results = await response.json() as NominatimPlace[]
  if (!Array.isArray(results)) throw new Error('Geocoding service returned an unexpected response.')
  return results.map((item) => toPlace(item, 'Nominatim search'))
}

export async function reverseGeocode(latitude: number, longitude: number, signal?: AbortSignal): Promise<SelectedPlace> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'en',
  }).toString()
  const response = await nominatimFetch(url.toString(), signal)
  const result = await response.json() as NominatimPlace
  if (!result.display_name) throw new Error('No address details were returned for these coordinates.')
  return toPlace(result, 'Map selection')
}

export async function fetchPlaceWeather(place: SelectedPlace, signal?: AbortSignal): Promise<PlaceWeather> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,weather_code,visibility',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    forecast_days: '7',
    timezone: 'auto',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  }).toString()
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}.`)
  const result = await response.json() as OpenMeteoForecast
  if (!result.current || !result.hourly?.time || !result.daily?.time) throw new Error('Weather provider did not return the required current and forecast data.')
  const currentTime = result.current.time
  const nowIndex = Math.max(0, currentTime ? result.hourly.time.findIndex((time) => time >= currentTime) : 0)
  const hourly = result.hourly.time.slice(nowIndex, nowIndex + 24).map((time, index): WeatherPoint => ({
    time,
    temperature: result.hourly?.temperature_2m?.[nowIndex + index] ?? null,
    precipitationProbability: result.hourly?.precipitation_probability?.[nowIndex + index] ?? null,
    windSpeed: result.hourly?.wind_speed_10m?.[nowIndex + index] ?? null,
    weatherCode: result.hourly?.weather_code?.[nowIndex + index] ?? null,
  }))
  return {
    fetchedAt: new Date().toISOString(),
    current: {
      time: result.current.time ?? '',
      temperature: result.current.temperature_2m ?? null,
      feelsLike: result.current.apparent_temperature ?? null,
      humidity: result.current.relative_humidity_2m ?? null,
      windSpeed: result.current.wind_speed_10m ?? null,
      windDirection: result.current.wind_direction_10m ?? null,
      precipitation: result.current.precipitation ?? null,
      pressure: result.current.pressure_msl ?? null,
      weatherCode: result.current.weather_code ?? null,
    },
    visibility: result.hourly.visibility?.[nowIndex] ?? null,
    hourly,
    daily: result.daily.time.map((date, index) => ({
      date,
      minTemperature: result.daily?.temperature_2m_min?.[index] ?? null,
      maxTemperature: result.daily?.temperature_2m_max?.[index] ?? null,
      precipitationProbability: result.daily?.precipitation_probability_max?.[index] ?? null,
      windSpeed: result.daily?.wind_speed_10m_max?.[index] ?? null,
      weatherCode: result.daily?.weather_code?.[index] ?? null,
    })),
  }
}

export function describeWeatherCode(code: number | null): string {
  if (code === null) return 'Condition unavailable'
  if (code === 0) return 'Clear sky'
  if (code <= 3) return 'Partly cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code === 51 || code === 53 || code === 55) return 'Drizzle'
  if (code === 56 || code === 57) return 'Freezing drizzle'
  if (code === 61 || code === 63 || code === 65) return 'Rain'
  if (code === 66 || code === 67) return 'Freezing rain'
  if (code === 71 || code === 73 || code === 75 || code === 77) return 'Snow'
  if (code === 80 || code === 81 || code === 82) return 'Rain showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code === 95 || code === 96 || code === 99) return 'Thunderstorm'
  return 'Condition unavailable'
}
