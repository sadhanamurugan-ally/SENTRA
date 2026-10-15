import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Coordinates, CrisisIncident, RescueTeam } from './lib/crisismesh'
import type { SelectedPlace } from './lib/placeWeather'

interface Props {
  incidents: CrisisIncident[]
  teams: RescueTeam[]
  selectedIncident?: string
  selectedTeam?: string
  pin: Coordinates | null
  place: SelectedPlace | null
  route: Coordinates[] | null
  onPin: (point: Coordinates) => void
  onIncident: (id: string) => void
  onTeam: (id: string) => void
  onTileError: (message: string) => void
}

const priorityColor = { Critical: '#bb3d36', High: '#dc713e', Medium: '#c79a2d', Low: '#36866e' }

export default function CrisisMap({ incidents, teams, selectedIncident, selectedTeam, pin, place, route, onPin, onIncident, onTeam, onTileError }: Props) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const incidentMarkers = useRef<L.LayerGroup | null>(null)
  const teamMarkers = useRef<L.LayerGroup | null>(null)
  const pins = useRef<L.LayerGroup | null>(null)
  const placeMarker = useRef<L.LayerGroup | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)
  const handlers = useRef({ onPin, onIncident, onTeam, onTileError })
  handlers.current = { onPin, onIncident, onTeam, onTileError }
  const selectedMarker = useRef('')

  useEffect(() => {
    if (!element.current || map.current) return
    const instance = L.map(element.current, { zoomControl: true }).setView([40.724, -73.994], 13)
    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
    tileLayer.on('tileerror', () => handlers.current.onTileError('Map tiles failed to load. Check internet access or map service availability; incident coordinates remain available.'))
    tileLayer.addTo(instance)
    incidentMarkers.current = L.layerGroup().addTo(instance)
    teamMarkers.current = L.layerGroup().addTo(instance)
    pins.current = L.layerGroup().addTo(instance)
    placeMarker.current = L.layerGroup().addTo(instance)
    routeLayer.current = L.layerGroup().addTo(instance)
    instance.on('click', (event: L.LeafletMouseEvent) => handlers.current.onPin({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
    map.current = instance
    window.requestAnimationFrame(() => instance.invalidateSize())
    return () => { instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (selectedIncident && selectedIncident !== selectedMarker.current) {
      const item = incidents.find((entry) => entry.id === selectedIncident)
      if (item) map.current?.panTo([item.latitude, item.longitude])
      selectedMarker.current = selectedIncident
    }
  }, [selectedIncident, incidents])

  useEffect(() => {
    if (!place || !map.current) return
    map.current.flyTo([place.latitude, place.longitude], Math.max(map.current.getZoom(), 11), { duration: 0.7 })
  }, [place?.id, place?.latitude, place?.longitude])

  useEffect(() => {
    const instance = map.current
    const incidentLayer = incidentMarkers.current
    const teamLayer = teamMarkers.current
    const pinLayer = pins.current
    const selectedPlaceLayer = placeMarker.current
    const activeRoute = routeLayer.current
    if (!instance || !incidentLayer || !teamLayer || !pinLayer || !selectedPlaceLayer || !activeRoute) return
    incidentLayer.clearLayers()
    teamLayer.clearLayers()
    pinLayer.clearLayers()
    selectedPlaceLayer.clearLayers()
    activeRoute.clearLayers()
    for (const incident of incidents) {
      const marker = L.circleMarker([incident.latitude, incident.longitude], {
        radius: incident.id === selectedIncident ? 10 : 7,
        color: '#fff', weight: 2, fillColor: priorityColor[incident.priority], fillOpacity: 0.96,
      }).bindTooltip(`${incident.id} · ${incident.type} · ${incident.priority} · ${incident.status}`)
      marker.on('click', () => handlers.current.onIncident(incident.id))
      marker.addTo(incidentLayer)
    }
    for (const team of teams) {
      const marker = L.marker([team.latitude, team.longitude], {
        icon: L.divIcon({
          className: 'cm-team-marker-wrapper',
          html: `<span class="cm-team-marker ${team.id === selectedTeam ? 'selected' : ''}">${team.status === 'Available' ? '✓' : '•'}</span>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        }),
      }).bindTooltip(`${team.name} · ${team.status} · ${team.source} team`)
      marker.on('click', () => handlers.current.onTeam(team.id))
      marker.addTo(teamLayer)
    }
    if (pin) L.marker([pin.latitude, pin.longitude]).bindTooltip('Selected report pin').addTo(pinLayer)
    if (place) L.circleMarker([place.latitude, place.longitude], {
      radius: 9, color: '#fff', weight: 3, fillColor: '#187f88', fillOpacity: 1,
    }).bindTooltip(`${place.label} · ${place.country || 'Selected place'}`).addTo(selectedPlaceLayer)
    if (route && route.length > 1) L.polyline(route.map((point) => [point.latitude, point.longitude]), { color: '#197f86', weight: 5, opacity: .86 }).addTo(activeRoute)
  }, [incidents, teams, selectedIncident, selectedTeam, pin, place, route])

  return <div className="cm-map" ref={element} role="application" aria-label="Interactive incident and rescue team map" />
}
