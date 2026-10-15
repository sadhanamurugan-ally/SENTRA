import type { EnvironmentalData, RiskAssessment, RiskLevel } from '../types'

export function riskLevel(score: number): RiskLevel {
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Moderate'
  return 'Low'
}

export function assessRisk(data: EnvironmentalData, previousScore: number | null, settings: { pollutionThreshold: number; temperatureDeviation: number }): RiskAssessment {
  const factors: RiskAssessment['factors'] = []
  const observed = data.weather.filter((entry) => !entry.isForecast && entry.temperature !== null)
  const current = data.current
  if (observed.length < 6 || !current) {
    return { score: 0, level: 'Low', previousScore, factors, warning: 'Preliminary assessment: at least six historical observations and a current reading are needed for a robust baseline.', completeness: Math.round((observed.length / 6) * 65) }
  }
  const baseline = observed.slice(-72)
  const temps = baseline.map((item) => item.temperature as number)
  const mean = temps.reduce((sum, value) => sum + value, 0) / temps.length
  const variance = temps.reduce((sum, value) => sum + (value - mean) ** 2, 0) / temps.length
  const deviation = Math.abs((current.temperature ?? mean) - mean)
  if (deviation >= settings.temperatureDeviation) {
    const points = Math.min(28, Math.round(12 + deviation * 1.5))
    factors.push({ label: 'Temperature departure', detail: `${deviation.toFixed(1)}°C from the recent mean (${mean.toFixed(1)}°C).`, points })
  } else if (variance > 0 && Math.abs((current.temperature ?? mean) - mean) > Math.sqrt(variance) * 2) {
    factors.push({ label: 'Unusual temperature', detail: 'Current temperature is more than two standard deviations from recent observations.', points: 14 })
  }
  const humidityChanges = observed.slice(-6).map((item) => item.humidity).filter((value): value is number => value !== null)
  if (humidityChanges.length >= 4 && current.humidity !== null) {
    const humidityDelta = Math.abs(current.humidity - humidityChanges[0])
    if (humidityDelta >= 25) factors.push({ label: 'Rapid humidity shift', detail: `Humidity changed by ${humidityDelta.toFixed(0)} percentage points over recent hours.`, points: Math.min(18, Math.round(humidityDelta * 0.45)) })
  }
  const recentWinds = observed.slice(-6).map((item) => item.windSpeed).filter((value): value is number => value !== null)
  if (recentWinds.length >= 4 && current.windSpeed !== null) {
    const windDelta = Math.abs(current.windSpeed - recentWinds[0])
    if (windDelta >= 20) factors.push({ label: 'Rapid wind-speed change', detail: `Wind speed changed by ${windDelta.toFixed(1)} km/h over recent hours.`, points: Math.min(18, Math.round(windDelta * 0.4)) })
  }
  const latestPollutant = data.pollutants.find((item) => item.key === 'pm2_5')
  if (latestPollutant && latestPollutant.value > settings.pollutionThreshold) {
    factors.push({ label: 'Elevated PM2.5', detail: `${latestPollutant.value} ${latestPollutant.unit} exceeds the configured ${settings.pollutionThreshold} ${latestPollutant.unit} screening threshold.`, points: Math.min(35, Math.round((latestPollutant.value - settings.pollutionThreshold) * 0.55 + 12)) })
  }
  const no2 = data.pollutants.find((item) => item.key === 'nitrogen_dioxide')
  if (no2 && no2.value > 40) factors.push({ label: 'Elevated NO₂', detail: `${no2.value} ${no2.unit} exceeds the 40 ${no2.unit} screening threshold.`, points: 18 })
  if (typeof current.rainfall === 'number' && current.rainfall >= 10) {
    factors.push({ label: 'Heavy hourly rainfall', detail: `${current.rainfall} mm of precipitation in the latest hourly reading warrants a local drainage and runoff review.`, points: Math.min(22, Math.round(current.rainfall * 0.7)) })
  }
  const wind = current.windSpeed
  if (typeof wind === 'number' && wind >= 45) factors.push({ label: 'Strong winds', detail: `Wind speed of ${wind} km/h may affect local dispersion conditions.`, points: 12 })
  if (factors.length >= 2) factors.push({ label: 'Combined conditions', detail: 'Multiple screening indicators are elevated at the same time; this warrants closer review.', points: 10 })
  const score = Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0))
  const availableFields = [current.temperature, current.humidity, current.windSpeed, current.rainfall].filter((value) => value !== null).length
  return { score, level: riskLevel(score), previousScore, factors, warning: null, completeness: Math.round((availableFields / 4) * 70 + Math.min(data.pollutants.length, 3) / 3 * 30) }
}

export function recommendationsFor(level: RiskLevel): string[] {
  if (level === 'Critical') return ['Verify readings with an independent monitor and notify the site environmental lead.', 'Review current on-site operations and follow established emergency procedures if conditions are confirmed.', 'Avoid attributing cause without source testing and further investigation.']
  if (level === 'High') return ['Review the contributing readings and check sensor availability.', 'Increase monitoring frequency and compare with nearby reference stations.', 'Document findings for environmental staff; investigate potential sources before drawing conclusions.']
  if (level === 'Moderate') return ['Continue routine monitoring and review the next observation.', 'Compare readings against a nearby reference station where available.']
  return ['Continue routine monitoring; no screening thresholds are currently elevated.']
}
