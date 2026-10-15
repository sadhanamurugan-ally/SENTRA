import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, Bell, Check, ChevronDown, Cloud, CloudRain, Crosshair, Droplets,
  Flame, Gauge, MapPin, Menu, Plus, Search, Shield, Siren, Users, Wind, X,
} from 'lucide-react'
import type { AlertRecord, Location } from './types'
import {
  assessIncident, demoIncidents, demoNotices, demoTeams, demoUsers, distanceKm, incidentTypes, priorities,
  roles, statuses, suitableTeams,
} from './lib/crisismesh'
import type {
  Coordinates, CrisisData, CrisisIncident, CrisisNotice, CrisisRole, IncidentPriority, IncidentStatus,
  IncidentType, RescueTeam, TeamStatus,
} from './lib/crisismesh'
import { describeWeatherCode, fetchPlaceWeather, reverseGeocode, searchPlaces } from './lib/placeWeather'
import type { PlaceWeather, SelectedPlace } from './lib/placeWeather'
import 'leaflet/dist/leaflet.css'
import './crisisMesh.css'

const CrisisMap = lazy(() => import('./CrisisMap'))
type Section = 'Dashboard' | 'Incidents' | 'Map' | 'Weather' | 'Rescue teams' | 'Reports' | 'Notifications' | 'Settings'
type Workspace = 'CITYPULSE' | 'CRISISMESH'
interface Props {
  onSwitch: (workspace: Workspace) => void
  alerts: AlertRecord[]
  locations: Location[]
}
interface ReportDraft {
  type: IncidentType
  severity: number
  description: string
  location: string
  latitude: string
  longitude: string
  contact: string
  image?: string
}
const storageKey = 'crisisMesh.prototype.v1'
const pageNav: { name: Section; icon: typeof Activity }[] = [
  { name: 'Dashboard', icon: Activity }, { name: 'Incidents', icon: Siren }, { name: 'Map', icon: MapPin },
  { name: 'Weather', icon: Cloud },
  { name: 'Rescue teams', icon: Users }, { name: 'Reports', icon: Plus }, { name: 'Notifications', icon: Bell },
  { name: 'Settings', icon: Shield },
]
const priorityCss: Record<IncidentPriority, string> = { Critical: 'critical', High: 'high', Medium: 'medium', Low: 'low' }
const statusCss: Record<IncidentStatus, string> = { Reported: 'reported', 'Under Review': 'review', Assigned: 'assigned', Responding: 'responding', 'On Scene': 'onscene', Resolved: 'resolved' }

function orderedTeams(incident: CrisisIncident, teams: RescueTeam[], travelTimes: Record<string, number>) {
  return suitableTeams(incident, teams).sort((a, b) => {
    const aTime = travelTimes[a.id]
    const bTime = travelTimes[b.id]
    if (aTime !== undefined && bTime !== undefined) return aTime - bTime
    if (aTime !== undefined) return -1
    if (bTime !== undefined) return 1
    return distanceKm(a, incident) - distanceKm(b, incident)
  })
}

function loadData(): { data: CrisisData; error: string } {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return { data: { incidents: demoIncidents, teams: demoTeams, users: demoUsers, notices: demoNotices }, error: '' }
    const parsed = JSON.parse(stored) as Partial<CrisisData>
    if (![parsed.incidents, parsed.teams, parsed.users, parsed.notices].every(Array.isArray)) throw new Error('CRISISMESH data has an invalid format.')
    return { data: parsed as CrisisData, error: '' }
  } catch (error) {
    console.error('Unable to read CRISISMESH local data', error)
    return { data: { incidents: demoIncidents, teams: demoTeams, users: demoUsers, notices: demoNotices }, error: 'Saved prototype data could not be read. Sample data is shown.' }
  }
}
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`

export default function CrisisMesh({ onSwitch, alerts, locations }: Props) {
  const [initial] = useState(loadData)
  const [data, setData] = useState(initial.data)
  const [error, setError] = useState(initial.error)
  const [role, setRole] = useState<CrisisRole>('Emergency Coordinator')
  const [section, setSection] = useState<Section>('Dashboard')
  const [teamId, setTeamId] = useState('team-alpha')
  const [incidentId, setIncidentId] = useState('CM-1042')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [typeFilter, setTypeFilter] = useState('All types')
  const [pin, setPin] = useState<Coordinates | null>(null)
  const [draft, setDraft] = useState<ReportDraft>({ type: 'Other', severity: 3, description: '', location: '', latitude: '', longitude: '', contact: '' })
  const [formError, setFormError] = useState('')
  const [gpsMessage, setGpsMessage] = useState('')
  const [toast, setToast] = useState('')
  const [mapMessage, setMapMessage] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<SelectedPlace[]>([])
  const [placeSearchState, setPlaceSearchState] = useState('')
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false)
  const [weather, setWeather] = useState<PlaceWeather | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [route, setRoute] = useState<{ points: Coordinates[]; distance: number; duration: number } | null>(null)
  const [routeMessage, setRouteMessage] = useState('')
  const [teamTravelTimes, setTeamTravelTimes] = useState<Record<string, number>>({})
  const [travelTimesIncidentId, setTravelTimesIncidentId] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [menuOpen, setMenuOpen] = useState(false)
  const [newUser, setNewUser] = useState('')
  const [newTeam, setNewTeam] = useState('')
  const [newRole, setNewRole] = useState<CrisisRole>('Reporter')
  const reverseRequestId = useRef(0)
  const placeSearchRequestId = useRef(0)

  useEffect(() => {
    if (!selectedPlace) {
      setWeather(null)
      setWeatherError('')
      setWeatherLoading(false)
      return
    }
    const controller = new AbortController()
    setWeatherLoading(true)
    setWeatherError('')
    setWeather(null)
    void fetchPlaceWeather(selectedPlace, controller.signal).then((result) => {
      if (!controller.signal.aborted) setWeather(result)
    }).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setWeatherError(cause instanceof Error ? cause.message : 'Weather service request failed.')
    }).finally(() => {
      if (!controller.signal.aborted) setWeatherLoading(false)
    })
    return () => controller.abort()
  }, [selectedPlace?.id, selectedPlace?.latitude, selectedPlace?.longitude])

  useEffect(() => {
    const onlineHandler = () => { setOnline(true); setMapMessage('') }
    const offlineHandler = () => { setOnline(false); setMapMessage('Offline: map tiles and routing need internet. No offline map or route data is installed.') }
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    return () => {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
  }, [])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200) }
  const persist = (next: CrisisData): boolean => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setData(next)
      setError('')
      return true
    } catch (cause) {
      console.error('Unable to save CRISISMESH prototype data', cause)
      setError('Could not save this change to browser storage. Check available storage and try again.')
      return false
    }
  }
  const coordinator = role === 'Admin' || role === 'Emergency Coordinator'
  const selectedTeam = data.teams.find((team) => team.id === teamId) ?? data.teams[0]
  const incident = data.incidents.find((item) => item.id === incidentId)
  const activeTravelTimes = travelTimesIncidentId === incident?.id ? teamTravelTimes : {}
  const roleIncidents = role === 'Reporter'
    ? data.incidents.filter((item) => item.reporter === 'Demo Reporter' && item.source !== 'Sample')
    : role === 'Rescue Team'
      ? data.incidents.filter((item) => item.teamId === selectedTeam?.id)
      : data.incidents
  const filtered = useMemo(() => roleIncidents.filter((item) => {
    const term = search.trim().toLowerCase()
    return (!term || `${item.id} ${item.type} ${item.location} ${item.description}`.toLowerCase().includes(term))
      && (priorityFilter === 'All priorities' || item.priority === priorityFilter)
      && (statusFilter === 'All statuses' || item.status === statusFilter)
      && (typeFilter === 'All types' || item.type === typeFilter)
  }).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)), [roleIncidents, search, priorityFilter, statusFilter, typeFilter])
  const openIncidents = roleIncidents.filter((item) => item.status !== 'Resolved')
  const unread = data.notices.filter((notice) => !notice.read).length
  const changePage = (target: Section) => { setSection(target); setMenuOpen(false) }
  const selectPlace = (place: SelectedPlace) => {
    ++reverseRequestId.current
    ++placeSearchRequestId.current
    setSelectedPlace(place)
    setPin(null)
    setPlaceQuery(place.label)
    setPlaceResults([])
    setPlaceSearchState('')
    setMapMessage('')
    setRoute(null)
    setRouteMessage('')
  }
  const searchForPlace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = placeQuery.trim()
    if (query.length < 2) {
      setPlaceSearchState('Enter at least two characters to search for a place.')
      return
    }
    setPlaceSearchLoading(true)
    setPlaceSearchState('')
    setPlaceResults([])
    const requestId = ++placeSearchRequestId.current
    try {
      const results = await searchPlaces(query)
      if (requestId !== placeSearchRequestId.current) return
      setPlaceResults(results)
      setPlaceSearchState(results.length ? `${results.length} result${results.length === 1 ? '' : 's'} · choose the matching country, region, city, town or address.` : 'No matching places. Try a fuller place name or address.')
    } catch (cause) {
      if (requestId !== placeSearchRequestId.current) return
      setPlaceSearchState(cause instanceof Error ? cause.message : 'Place search failed. Check your connection and try again.')
    } finally {
      if (requestId === placeSearchRequestId.current) setPlaceSearchLoading(false)
    }
  }
  const selectMapCoordinates = (point: Coordinates, source: SelectedPlace['source']) => {
    const requestId = ++reverseRequestId.current
    ++placeSearchRequestId.current
    setPlaceSearchLoading(false)
    setPin(point)
    const provisional: SelectedPlace = {
      id: `coord-${point.latitude.toFixed(5)}-${point.longitude.toFixed(5)}`,
      label: 'Selected map coordinates',
      latitude: point.latitude,
      longitude: point.longitude,
      country: '',
      state: '',
      city: '',
      address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
      source,
    }
    setSelectedPlace(provisional)
    setPlaceQuery(provisional.address)
    setPlaceSearchState('Looking up address details for the selected coordinates…')
    void reverseGeocode(point.latitude, point.longitude).then((place) => {
      if (requestId !== reverseRequestId.current) return
      setSelectedPlace({ ...place, source })
      setPlaceQuery(place.address)
      setPlaceSearchState('')
    }).catch((cause: unknown) => {
      if (requestId !== reverseRequestId.current) return
      setPlaceSearchState(cause instanceof Error ? `Coordinates selected; address lookup unavailable: ${cause.message}` : 'Coordinates selected; address lookup is unavailable.')
    })
  }
  const refreshWeather = () => {
    if (!selectedPlace) return
    const place = { ...selectedPlace, id: `${selectedPlace.id}-refresh-${Date.now()}` }
    setSelectedPlace(place)
  }
  const addNotice = (notices: CrisisNotice[], title: string, detail: string): CrisisNotice[] => [
    { id: newId('NOTICE'), title, detail, at: new Date().toISOString(), read: false }, ...notices,
  ]
  const updatePriority = (item: CrisisIncident, priority: IncidentPriority) => {
    if (!coordinator) return
    const now = new Date().toISOString()
    const updated = { ...item, priority, manualPriority: true, priorityReason: `Priority changed to ${priority} by ${role} for human review; original: ${item.priorityReason}`, updates: [...item.updates, { status: item.status, at: now, note: `Coordinator set priority to ${priority}.`, actor: role }] }
    if (persist({ ...data, incidents: data.incidents.map((entry) => entry.id === item.id ? updated : entry), notices: addNotice(data.notices, 'Incident priority changed', `${item.id} · ${priority} · Demo`) })) notify(`Priority updated for ${item.id}.`)
  }
  const updateStatus = (item: CrisisIncident, status: IncidentStatus) => {
    const teamAllowed = role === 'Rescue Team' && item.teamId === selectedTeam?.id
      && ((item.status === 'Assigned' && status === 'Responding') || (item.status === 'Responding' && status === 'On Scene') || (item.status === 'On Scene' && status === 'Resolved'))
    const reviewAllowed = coordinator && item.status === 'Reported' && status === 'Under Review'
    if (!teamAllowed && !reviewAllowed) return
    const now = new Date().toISOString()
    const actor = role === 'Rescue Team' ? selectedTeam.name : role
    const updated = { ...item, status, updates: [...item.updates, { status, at: now, note: `${status} update saved in this local demo; no dispatch or external notification occurred.`, actor }] }
    const teams = status === 'Resolved' ? data.teams.map((team) => team.id === item.teamId ? { ...team, status: 'Available' as TeamStatus, assignedIncidentId: undefined } : team) : data.teams
    if (persist({ ...data, teams, incidents: data.incidents.map((entry) => entry.id === item.id ? updated : entry), notices: addNotice(data.notices, 'Incident status updated', `${item.id} · ${status} · simulated`) })) notify(`${item.id} updated to ${status}.`)
  }
  const assign = (item: CrisisIncident, selectedId: string) => {
    if (!coordinator || !['Reported', 'Under Review'].includes(item.status)) return
    const team = data.teams.find((entry) => entry.id === selectedId)
    if (!team || team.status !== 'Available' || !team.capabilities.includes(item.type)) { notify('Select a capable available demo team.'); return }
    const now = new Date().toISOString()
    const updated = { ...item, teamId: team.id, status: 'Assigned' as IncidentStatus, updates: [...item.updates, { status: 'Assigned' as IncidentStatus, at: now, note: `${team.name} assigned in this demo. No real team was contacted.`, actor: role }] }
    const teams = data.teams.map((entry) => entry.id === team.id ? { ...entry, status: 'Busy' as TeamStatus, assignedIncidentId: item.id } : entry)
    if (persist({ ...data, teams, incidents: data.incidents.map((entry) => entry.id === item.id ? updated : entry), notices: addNotice(data.notices, 'Demo team assigned', `${team.name} → ${item.id}`) })) notify(`${team.name} assigned (demo only).`)
  }
  const getGps = () => {
    if (!navigator.geolocation) { setGpsMessage('Location is unavailable in this browser. Enter coordinates or choose a point on the map.'); return }
    setGpsMessage('Waiting for location permission…')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const point = { latitude: coords.latitude, longitude: coords.longitude }
      selectMapCoordinates(point, 'GPS')
      setDraft((old) => ({ ...old, latitude: point.latitude.toFixed(6), longitude: point.longitude.toFixed(6) }))
      setGpsMessage('GPS coordinates received. GPS can work without internet if satellite reception is available.')
    }, (geoError) => setGpsMessage(geoError.code === geoError.PERMISSION_DENIED
      ? 'Location permission denied. Enter coordinates or select a map point.'
      : 'Location unavailable or timed out. Check GPS reception or enter coordinates manually.'), { enableHighAccuracy: true, timeout: 12_000 })
  }
  const submitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const lat = Number(draft.latitude); const lon = Number(draft.longitude)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) { setFormError('Enter valid latitude and longitude or use GPS/map selection.'); return }
    const decision = assessIncident(draft.type, draft.severity, draft.description)
    const at = new Date().toISOString()
    const id = newId('CM')
    const isReporter = role === 'Reporter'
    const created: CrisisIncident = {
      id, type: draft.type, description: draft.description.trim(), severity: draft.severity, priority: decision.priority,
      priorityReason: decision.reason, latitude: lat, longitude: lon, location: draft.location.trim(), reportedAt: at,
      status: 'Reported', reporter: isReporter ? 'Demo Reporter' : `Demo ${role}`, contact: draft.contact.trim(),
      image: draft.image, source: 'Prototype', updates: [{ status: 'Reported', at, note: 'Report stored in this browser and awaiting coordinator review.', actor: `Demo ${role}` }],
    }
    if (persist({ ...data, incidents: [created, ...data.incidents], notices: addNotice(data.notices, 'New incident reported', `${id} · ${created.type} · browser prototype`) })) {
      setIncidentId(id); setDraft({ type: 'Other', severity: 3, description: '', location: '', latitude: '', longitude: '', contact: '' })
      setFormError(''); setPin(null); notify(`Report ${id} saved in this browser.`)
      if (isReporter) changePage('Incidents')
    }
  }
  const uploadImage = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 1_500_000) { setFormError('Choose an image file smaller than 1.5 MB.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') { setDraft((old) => ({ ...old, image: reader.result as string })); setFormError('') }
      else setFormError('Unable to read that image.')
    }
    reader.onerror = () => setFormError('Unable to read that image.')
    reader.readAsDataURL(file)
  }
  const importEnvironmentalAlert = (alertId: string) => {
    const alert = alerts.find((item) => item.id === alertId && item.status === 'Under Review')
    if (!alert) { setFormError('Only a CITYPULSE alert already marked Under Review can be imported.'); return }
    const location = locations.find((item) => item.id === alert.locationId)
    setDraft((old) => ({
      ...old, type: 'Other',
      description: `Human-reviewed CITYPULSE alert ${alert.id}: ${alert.explanation} Please verify whether an emergency exists.`,
      location: alert.locationName, latitude: location ? String(location.latitude) : '', longitude: location ? String(location.longitude) : '',
    }))
    if (location) setPin({ latitude: location.latitude, longitude: location.longitude })
    setFormError('')
    notify('Alert copied to a CRISISMESH draft; it does not confirm an emergency or its cause.')
  }
  const getRoute = async (item: CrisisIncident, team: RescueTeam) => {
    if (!online) { setRoute(null); setRouteMessage('Offline: route and ETA are unavailable. No route is shown.'); return }
    setRouteLoading(true); setRoute(null); setRouteMessage('Requesting actual road route from configured OSRM-compatible service…')
    const base = (import.meta.env.VITE_OSRM_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving').replace(/\/$/, '')
    try {
      const response = await fetch(`${base}/${team.longitude},${team.latitude};${item.longitude},${item.latitude}?overview=full&geometries=geojson&steps=false`)
      if (!response.ok) throw new Error(`Routing service returned ${response.status}.`)
      const payload = await response.json() as { code?: string; routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[] }
      const result = payload.routes?.[0]
      if (payload.code !== 'Ok' || !result || !Number.isFinite(result.distance) || !Number.isFinite(result.duration) || !result.geometry?.coordinates?.length) throw new Error('No route returned for these coordinates.')
      setRoute({ points: result.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })), distance: result.distance, duration: result.duration })
      setRouteMessage('Route and duration returned by the routing service. This is not live traffic, a guaranteed ETA, or a dispatch commitment.')
      changePage('Map')
    } catch (cause) {
      setRoute(null)
      setRouteMessage(`Route unavailable: ${cause instanceof Error ? cause.message : 'request failed'}. No route or ETA is displayed.`)
    } finally { setRouteLoading(false) }
  }
  const getTravelTimes = async (item: CrisisIncident) => {
    const candidates = suitableTeams(item, data.teams)
    if (!online || !candidates.length) { setRouteMessage(!online ? 'Travel-time estimates require internet. Listed teams are ranked by straight-line distance only.' : 'No available team has a listed capability for this incident.'); return }
    const base = (import.meta.env.VITE_OSRM_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving').replace('/route/v1/', '/table/v1/').replace(/\/$/, '')
    const coords = [...candidates.map((team) => `${team.longitude},${team.latitude}`), `${item.longitude},${item.latitude}`]
    const sourceIds = candidates.map((_, index) => index).join(';')
    setRouteMessage('Requesting road-time comparison…')
    try {
      const response = await fetch(`${base}/${coords.join(';')}?sources=${sourceIds}&destinations=${candidates.length}&annotations=duration`)
      if (!response.ok) throw new Error(`Routing service returned ${response.status}.`)
      const payload = await response.json() as { code?: string; durations?: (number | null)[][] }
      if (payload.code !== 'Ok' || !payload.durations) throw new Error('No travel-time matrix returned.')
      const ranking = candidates.map((team, index) => ({ team, seconds: payload.durations?.[index]?.[0] ?? null }))
        .filter((entry): entry is { team: RescueTeam; seconds: number } => entry.seconds !== null && Number.isFinite(entry.seconds))
        .sort((a, b) => a.seconds - b.seconds)
      if (!ranking.length) throw new Error('No routable candidates returned.')
      setTeamTravelTimes(Object.fromEntries(ranking.map(({ team, seconds }) => [team.id, seconds])))
      setTravelTimesIncidentId(item.id)
      const lines = ranking.map(({ team, seconds }) => `${team.name}: about ${Math.max(1, Math.round(seconds / 60))} min`)
      setRouteMessage(`OSRM road-time estimates (not live traffic): ${lines.join(' · ')}. Teams without a route are omitted; operational availability is not verified.`)
    } catch (cause) {
      setTeamTravelTimes({})
      setTravelTimesIncidentId('')
      setRouteMessage(`Travel-time comparison unavailable: ${cause instanceof Error ? cause.message : 'request failed'}. Teams remain ranked by straight-line distance.`)
    }
  }
  const setTeamStatus = (team: RescueTeam, status: TeamStatus) => {
    if (role !== 'Admin' && role !== 'Emergency Coordinator') return
    if (persist({ ...data, teams: data.teams.map((item) => item.id === team.id ? { ...item, status } : item) })) notify(`${team.name} marked ${status}.`)
  }
  const addTeam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!coordinator || !newTeam.trim()) return
    const team: RescueTeam = { id: newId('TEAM'), name: newTeam.trim(), capabilities: [...incidentTypes], status: 'Available', latitude: 40.724, longitude: -73.994, location: 'Registered demo location', source: 'Prototype' }
    if (persist({ ...data, teams: [...data.teams, team] })) { setNewTeam(''); notify('Prototype team added; registered location is a placeholder.') }
  }
  const addUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (role !== 'Admin' || !newUser.trim()) return
    const user = { id: newId('USER'), name: newUser.trim(), role: newRole, ...(newRole === 'Rescue Team' ? { teamId } : {}) }
    if (persist({ ...data, users: [...data.users, user] })) { setNewUser(''); notify('Demo user added; no authenticated account was created.') }
  }
  const markRead = (notice: CrisisNotice) => persist({ ...data, notices: data.notices.map((item) => item.id === notice.id ? { ...item, read: true } : item) })
  const reviewedAlerts = alerts.filter((alert) => alert.status === 'Under Review')

  return <div className="cm-shell">
    <aside className={`cm-sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="cm-brand"><span className="cm-brand-icon"><Siren size={18} /></span><span>SENTRA</span><button className="cm-close-menu" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="cm-team-label">SENTRA OPERATIONS</div>
      <div className="cm-module-switch"><button onClick={() => onSwitch('CITYPULSE')}>CITYPULSE</button><button className="active" aria-current="page">CRISISMESH</button></div>
      <div className="cm-demo"><i /><span><b>DEMO MODE</b><small>Role preview is not authentication</small></span></div>
      <nav className="cm-navigation" aria-label="CRISISMESH navigation">{pageNav.map(({ name, icon: Icon }) => <button className={section === name ? 'active' : ''} key={name} onClick={() => changePage(name)}><Icon size={17} /><span>{name}</span>{name === 'Notifications' && unread > 0 && <b>{unread}</b>}</button>)}</nav>
      <div className="cm-sidebar-footer"><b>SENTRA</b><small>Emergency operations prototype</small><small>Not connected to emergency services</small></div>
    </aside>
    {menuOpen && <button className="cm-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation overlay" />}
    <main className="cm-main">
      <header className="cm-topbar"><button className="cm-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={18} /></button><div className="cm-crumb">SENTRA <span>/</span> CRISISMESH <span>/</span> {section}</div><div className="cm-top-actions">
        <label className="cm-role"><small>DEMO ROLE</small><select aria-label="Demo role" value={role} onChange={(event) => setRole(event.target.value as CrisisRole)}>{roles.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={12} /></label>
        {role === 'Rescue Team' && <label className="cm-role"><small>TEAM</small><select aria-label="Select demo rescue team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
        <span className="cm-demo-pill"><i />SIMULATED</span><button className="cm-bell" aria-label={`${unread} unread notifications`} onClick={() => changePage('Notifications')}><Bell size={17} />{unread > 0 && <i />}</button>
      </div></header>
      <div className="cm-content">
        <div className="cm-warning"><AlertTriangle size={15} /><span>SENTRA DEMO · No secure login, real dispatch, or live team connection is configured.</span></div>
        {error && <div className="cm-error" role="alert">{error}</div>}

        {section === 'Dashboard' && <section>
          <PageHeading eyebrow="SENTRA / EMERGENCY OPERATIONS" title="Incident overview" subtitle="Live-looking demo snapshot · sample and browser-stored prototype records" action={<button className="cm-button primary" onClick={() => changePage('Reports')}><Plus size={15} /> Report incident</button>} />
          <div className="cm-stats">
            <Stat label="Total incidents" count={roleIncidents.length} />
            <Stat label="Pending review" count={roleIncidents.filter((item) => ['Reported', 'Under Review'].includes(item.status)).length} tone="amber" />
            <Stat label="Active response" count={openIncidents.filter((item) => ['Assigned', 'Responding', 'On Scene'].includes(item.status)).length} tone="red" />
            <Stat label="Resolved" count={roleIncidents.filter((item) => item.status === 'Resolved').length} tone="green" />
          </div>
          <div className="cm-dashboard-columns">
            <div className="cm-card"><PanelHeading title={role === 'Rescue Team' ? 'Assigned incidents' : role === 'Reporter' ? 'My reports' : 'Recent incidents'} caption="Sample and browser-prototype records, not live reports" action={<button className="cm-link" onClick={() => changePage('Incidents')}>View all <ArrowRight size={14} /></button>} />
              {roleIncidents.slice(0, 5).map((item) => <IncidentRow key={item.id} incident={item} team={data.teams.find((team) => team.id === item.teamId)} active={item.id === incidentId} onClick={() => { setIncidentId(item.id); changePage('Incidents') }} />)}
              {!roleIncidents.length && <Empty title="No reports yet" text="Submit a report to start your browser-only workflow." />}
            </div>
            <div className="cm-card"><PanelHeading title="Response units" caption="All teams are simulated, not real rescue services" />
              <div className="cm-team-counts"><p>Available <b>{data.teams.filter((item) => item.status === 'Available').length}</b></p><p>Busy <b>{data.teams.filter((item) => item.status === 'Busy').length}</b></p><p>Off duty <b>{data.teams.filter((item) => item.status === 'Off duty').length}</b></p></div>
              <button className="cm-map-link" onClick={() => changePage('Map')}><MapPin size={16} /><span><b>Open incident & team map</b><small>OpenStreetMap tiles need internet</small></span><ArrowRight size={15} /></button>
            </div>
          </div>
          <div className="cm-card cm-workflow"><PanelHeading title="Incident workflow" caption="Simulated status changes; no team is contacted" /><div>{['Report', 'Review', 'Prioritize', 'Recommend', 'Assign', 'Respond', 'Resolve'].map((item, index) => <span key={item}><i>{index + 1}</i>{item}{index < 6 && <ArrowRight size={12} />}</span>)}</div></div>
        </section>}

        {section === 'Incidents' && <section>
          <PageHeading eyebrow="INCIDENT MANAGEMENT" title={role === 'Reporter' ? 'My reports' : role === 'Rescue Team' ? 'My assignments' : 'Incident register'} subtitle="Search incidents and inspect assignment rationale and status history." action={<button className="cm-button primary" onClick={() => changePage('Reports')}><Plus size={15} /> New report</button>} />
          <div className="cm-card cm-list"><div className="cm-filters"><label className="cm-search"><Search size={15} /><input aria-label="Search incidents" placeholder="Search ID, location, description…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label><span className="sr-only">Priority filter</span><select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="sr-only">Status filter</span><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="sr-only">Type filter</span><select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>All types</option>{incidentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
            {filtered.map((item) => <IncidentRow key={item.id} incident={item} team={data.teams.find((team) => team.id === item.teamId)} active={item.id === incidentId} onClick={() => setIncidentId(item.id)} />)}
            {!filtered.length && <Empty title="No matching incidents" text="Adjust filters or submit a report." />}
          </div>
          {incident && filtered.some((item) => item.id === incident.id) && <IncidentDetails incident={incident} team={data.teams.find((item) => item.id === incident.teamId)} teams={data.teams} travelTimes={activeTravelTimes} role={role} teamId={teamId} onPriority={updatePriority} onStatus={updateStatus} onAssign={assign} onRoute={getRoute} routeLoading={routeLoading} />}
        </section>}

        {section === 'Map' && <section>
          <PageHeading eyebrow="SITUATIONAL AWARENESS" title="Incident & team map" subtitle="Click the map to place a report pin. Pan, zoom, and select incident/team markers." action={<button className="cm-button secondary" onClick={() => {
            if (!pin) { setFormError('Select a point on the map first.'); return }
            setDraft((old) => ({ ...old, latitude: pin.latitude.toFixed(6), longitude: pin.longitude.toFixed(6) }))
            setGpsMessage('Selected map point copied to the report form.')
            changePage('Reports')
          }}><MapPin size={14} /> Use pin in report</button>} />
          <div className="cm-map-layout"><div className="cm-card cm-map-card">
            <form className="cm-place-search" onSubmit={(event) => void searchForPlace(event)}>
              <label htmlFor="cm-place-query">Search any country, state, city, town or address</label>
              <div><input id="cm-place-query" value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="e.g. Chennai, Tamil Nadu, India" /><button className="cm-button primary" type="submit" disabled={placeSearchLoading}><Search size={14} />{placeSearchLoading ? 'Searching…' : 'Search places'}</button><button className="cm-button secondary" type="button" onClick={getGps}><Crosshair size={14} /> Use current location</button></div>
              <small>Search uses OpenStreetMap Nominatim only when submitted. It is rate-limited; no autocomplete requests are made.</small>
            </form>
            {placeSearchState && <p className="cm-place-message" role="status">{placeSearchState}</p>}
            {placeResults.length > 0 && <div className="cm-place-results" aria-label="Place search results">{placeResults.map((place) => <button type="button" key={place.id} onClick={() => selectPlace(place)}><b>{place.label}</b><span>{[place.city, place.state, place.country].filter(Boolean).join(', ') || place.address}</span></button>)}</div>}
            {selectedPlace && <div className="cm-selected-place"><MapPin size={16} /><div><b>{selectedPlace.label}</b><span>{[selectedPlace.city, selectedPlace.state, selectedPlace.country].filter(Boolean).join(', ') || selectedPlace.address}</span><small>{selectedPlace.latitude.toFixed(5)}, {selectedPlace.longitude.toFixed(5)} · {selectedPlace.source}</small></div><button className="cm-link" type="button" onClick={() => changePage('Weather')}>View weather <ArrowRight size={13} /></button></div>}
            <div className="cm-legend">{priorities.map((item) => <span key={item}><i className={`dot ${priorityCss[item]}`} />{item}</span>)}<span><i className="dot team" />Demo teams</span><span><i className="dot pin" />Report pin</span></div>
            {!online && <div className="cm-error">Offline: map tiles and route service need internet. No offline data is bundled.</div>}{mapMessage && <div className="cm-error" role="status">{mapMessage}</div>}
            <Suspense fallback={<div className="cm-map-loading">Loading interactive map…</div>}><CrisisMap incidents={roleIncidents} teams={data.teams} selectedIncident={incident?.id} selectedTeam={teamId} pin={pin} place={selectedPlace} route={route?.points ?? null} onPin={(point) => selectMapCoordinates(point, 'Map selection')} onIncident={(id) => { setIncidentId(id); setRouteMessage('') }} onTeam={setTeamId} onTileError={setMapMessage} /></Suspense>
            <small className="cm-attribution-note">© OpenStreetMap contributors · tiles need internet and follow the tile usage policy.</small>
          </div><aside className="cm-card cm-route-card"><PanelHeading title="Route panel" caption="Only actual routing-service results are shown." />
            {incident && <div className="cm-waypoint"><i className={`dot ${priorityCss[incident.priority]}`} /><div><small>DESTINATION</small><b>{incident.id} · {incident.type}</b><span>{incident.location}</span><span>{incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}</span></div></div>}
            {selectedTeam && <div className="cm-waypoint"><i className="dot team" /><div><small>ORIGIN · {selectedTeam.source.toUpperCase()} TEAM</small><b>{selectedTeam.name} · {selectedTeam.status}</b><span>{selectedTeam.location}</span><span>{selectedTeam.latitude.toFixed(5)}, {selectedTeam.longitude.toFixed(5)}</span></div></div>}
            {incident && selectedTeam && <p className="cm-distance">Straight-line distance only: {distanceKm(selectedTeam, incident).toFixed(1)} km · not road route or ETA.</p>}
            <button className="cm-button primary full" disabled={!incident || !selectedTeam || routeLoading} onClick={() => incident && selectedTeam && void getRoute(incident, selectedTeam)}>{routeLoading ? 'Requesting route…' : 'Get actual road route & ETA'}</button>
            {route && <p className="cm-route-result"><b>Route result:</b> {(route.distance / 1000).toFixed(1)} km · about {Math.max(1, Math.round(route.duration / 60))} minutes per OSRM. Not live traffic or dispatch advice.</p>}
            {routeMessage && <p className="cm-route-message" role="status">{routeMessage}</p>}
            <button className="cm-button secondary full" onClick={getGps}><Crosshair size={14} /> Get current GPS location</button>{gpsMessage && <p className="cm-route-message" role="status">{gpsMessage}</p>}
            <div className="cm-offline"><b>Offline readiness</b><p>GPS may work offline with satellite reception. Offline maps require stored map data; offline routing requires road data and a compatible routing engine. Neither is included. Live team location, traffic and updates need connectivity.</p></div>
          </aside></div>
          {incident && <div className="cm-card cm-recommend"><PanelHeading title={`Suitable-team recommendations · ${incident.id}`} caption="Capability and availability filters; straight-line distance unless routing travel times are available." action={<button className="cm-button secondary small" onClick={() => void getTravelTimes(incident)}>Estimate available road travel times</button>} />
            <p className="cm-route-message" role="status">{routeMessage || 'Recommendations are simulated guidance only; they do not replace coordinator judgement.'}</p>
            {orderedTeams(incident, data.teams, activeTravelTimes).map((team) => <div className="cm-recommend-row" key={team.id}><b>{team.name}</b><span>{team.capabilities.join(', ')}</span><small>{activeTravelTimes[team.id] !== undefined ? `~${Math.max(1, Math.round(activeTravelTimes[team.id] / 60))} min road estimate · ` : ''}{distanceKm(team, incident).toFixed(1)} km straight-line</small><TeamBadge status={team.status} /></div>)}
          </div>}
        </section>}

        {section === 'Weather' && <section>
          <PageHeading eyebrow="WEATHER INTELLIGENCE" title="Weather for selected location" subtitle="The map selection is shared automatically; no need to enter the location again." action={<button className="cm-button secondary" disabled={!selectedPlace || weatherLoading} onClick={refreshWeather}><Activity size={14} /> Refresh weather</button>} />
          {!selectedPlace && <div className="cm-card cm-weather-empty"><Cloud size={26} /><b>No location selected</b><p>Choose Maps, search for a location or select a point on the map. Weather will load automatically for its coordinates.</p><button className="cm-button primary" onClick={() => changePage('Map')}><MapPin size={14} /> Open Maps</button></div>}
          {selectedPlace && <div className="cm-weather-location"><MapPin size={16} /><span><b>{selectedPlace.label}</b><small>{[selectedPlace.city, selectedPlace.state, selectedPlace.country].filter(Boolean).join(', ') || selectedPlace.address} · {selectedPlace.latitude.toFixed(4)}, {selectedPlace.longitude.toFixed(4)}</small></span><button className="cm-link" onClick={() => changePage('Map')}>Change on map <ArrowRight size={13} /></button></div>}
          {weatherLoading && <div className="cm-card cm-weather-empty" role="status">Loading latest available weather and forecast from Open-Meteo…</div>}
          {weatherError && <div className="cm-error" role="alert">{weatherError} Weather is not fabricated; check your connection and retry.</div>}
          {weather && selectedPlace && <>
            <div className="cm-weather-disclosure"><Cloud size={15} /><span><b>Model-based current conditions</b> · Open-Meteo forecast-model data, not a guaranteed local weather-station observation. Retrieved {new Date(weather.fetchedAt).toLocaleString()}.</span></div>
            <div className="cm-weather-current cm-card">
              <div className="cm-weather-primary"><span>{describeWeatherCode(weather.current.weatherCode)}</span><b>{weather.current.temperature === null ? '—' : `${weather.current.temperature.toFixed(1)} °C`}</b><small>{weather.current.feelsLike === null ? '' : `Feels like ${weather.current.feelsLike.toFixed(1)} °C`} · model timestamp {weather.current.time ? new Date(weather.current.time).toLocaleString() : 'unavailable'}</small></div>
              <div className="cm-weather-metrics">
                {weather.current.humidity !== null && <WeatherMetric icon={<Droplets size={16} />} label="Humidity" value={`${weather.current.humidity}%`} />}
                {weather.current.windSpeed !== null && <WeatherMetric icon={<Wind size={16} />} label="Wind" value={`${weather.current.windSpeed.toFixed(1)} km/h${weather.current.windDirection === null ? '' : ` · ${Math.round(weather.current.windDirection)}°`}`} />}
                {weather.current.precipitation !== null && <WeatherMetric icon={<CloudRain size={16} />} label="Precipitation" value={`${weather.current.precipitation.toFixed(1)} mm`} />}
                {weather.current.pressure !== null && <WeatherMetric icon={<Gauge size={16} />} label="Pressure" value={`${Math.round(weather.current.pressure)} hPa`} />}
                {weather.visibility !== null && <WeatherMetric icon={<MapPin size={16} />} label="Visibility" value={`${(weather.visibility / 1000).toFixed(1)} km`} />}
              </div>
            </div>
            <div className="cm-weather-alert" role="note"><AlertTriangle size={15} /><span><b>Severe-weather alerts are not provided by this weather endpoint.</b> Check official local authorities for active warnings.</span></div>
            <div className="cm-card cm-weather-forecast">
              <PanelHeading title="Next 24 hours" caption="Hourly model forecast · temperatures in °C, wind in km/h; precipitation probability when available." />
              {weather.hourly.length ? <div className="cm-hourly-list">{weather.hourly.map((point) => <article key={point.time}><b>{new Date(point.time).toLocaleTimeString(undefined, { hour: 'numeric' })}</b><Cloud size={15} /><span>{describeWeatherCode(point.weatherCode)}</span><strong>{point.temperature === null ? '—' : `${point.temperature.toFixed(0)}°`}</strong><small>{point.precipitationProbability === null ? '—' : `${point.precipitationProbability}% rain`}</small><small>{point.windSpeed === null ? '—' : `${Math.round(point.windSpeed)} km/h wind`}</small></article>)}</div> : <Empty title="Hourly forecast unavailable" text="The provider returned no hourly forecast points." />}
            </div>
            <div className="cm-card cm-weather-forecast">
              <PanelHeading title="7-day forecast" caption="Daily model forecast · high / low temperatures and precipitation probability when available." />
              {weather.daily.length ? <div className="cm-daily-list">{weather.daily.map((day) => <article key={day.date}><b>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b><span>{describeWeatherCode(day.weatherCode)}</span><strong>{day.maxTemperature === null ? '—' : `${day.maxTemperature.toFixed(0)}°`} / {day.minTemperature === null ? '—' : `${day.minTemperature.toFixed(0)}°`}</strong><small>{day.precipitationProbability === null ? '—' : `${day.precipitationProbability}% precipitation`}</small><small>{day.windSpeed === null ? '—' : `${Math.round(day.windSpeed)} km/h max wind`}</small></article>)}</div> : <Empty title="Daily forecast unavailable" text="The provider returned no daily forecast days." />}
            </div>
            <small className="cm-attribution-note">Weather data by Open-Meteo · forecast is model-based and may not reflect local observations or warnings. Conditions update when the selected map location changes.</small>
          </>}
        </section>}

        {section === 'Rescue teams' && <section>
          <PageHeading eyebrow="RESOURCE COORDINATION" title="Rescue teams" subtitle="Every listed team is a sample or browser prototype, never a real emergency service." />
          {coordinator && <form className="cm-inline-form" onSubmit={addTeam}><label>Demo team name<input required value={newTeam} onChange={(event) => setNewTeam(event.target.value)} placeholder="Team name" /></label><button className="cm-button primary"><Plus size={14} /> Add prototype team</button></form>}
          <div className="cm-team-grid">{data.teams.map((team) => {
            const assigned = data.incidents.find((item) => item.id === team.assignedIncidentId)
            return <article className="cm-card cm-team-card" key={team.id}><div className="cm-team-head"><span><Users size={18} /></span><div><b>{team.name}</b><small>{team.source} team</small></div><TeamBadge status={team.status} /></div>
              <dl><dt>Capabilities</dt><dd>{team.capabilities.join(' · ')}</dd><dt>Availability</dt><dd>{team.status}</dd><dt>Last registered location</dt><dd>{team.location} ({team.latitude.toFixed(4)}, {team.longitude.toFixed(4)})</dd><dt>Assigned incident</dt><dd>{assigned ? `${assigned.id} · ${assigned.type}` : 'None'}</dd></dl>
              <div className="cm-team-actions"><button className="cm-button secondary small" onClick={() => { setTeamId(team.id); changePage('Map') }}><MapPin size={13} /> Show on map</button>{coordinator && <label className="cm-compact">Status<select aria-label={`Change ${team.name} status`} value={team.status} onChange={(event) => setTeamStatus(team, event.target.value as TeamStatus)}>{(['Available', 'Busy', 'Off duty'] as TeamStatus[]).map((status) => <option key={status}>{status}</option>)}</select></label>}</div>
            </article>
          })}</div>
        </section>}

        {section === 'Reports' && <section>
          <PageHeading eyebrow="REPORT AN INCIDENT" title="New incident report" subtitle="Reports are saved in this browser. No response unit is contacted." />
          {formError && <div className="cm-error" role="alert">{formError}</div>}
          <form className="cm-card cm-report-form" onSubmit={submitReport}>
            {reviewedAlerts.length > 0 && <label className="cm-import">Human-reviewed CITYPULSE environmental alert <select defaultValue="" onChange={(event) => { if (event.target.value) importEnvironmentalAlert(event.target.value) }}><option value="">Optional: copy an alert to draft</option>{reviewedAlerts.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.locationName} · {item.riskLevel}</option>)}</select><small>An environmental alert is not proof of an emergency or cause. Review and confirm before submitting.</small></label>}
            <div className="cm-form-grid"><label>Incident type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as IncidentType })}>{incidentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Severity <small>Reported impact from 1 (lower) to 5 (higher)</small><select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} / 5</option>)}</select></label>
              <label className="wide">Description<textarea required minLength={8} maxLength={1000} rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Describe observed conditions without unverified causes." /></label>
              <label className="wide">Location<input required maxLength={160} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Street, landmark, or area" /></label>
              <div className="wide"><span className="cm-field-label">Coordinates</span><div className="cm-coordinates"><label>Latitude<input type="number" step="any" min="-90" max="90" required value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} /></label><label>Longitude<input type="number" step="any" min="-180" max="180" required value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} /></label><button type="button" className="cm-button secondary" onClick={getGps}><Crosshair size={14} /> Use GPS</button><button type="button" className="cm-button secondary" onClick={() => changePage('Map')}><MapPin size={14} /> Choose map pin</button></div>{gpsMessage && <small role="status">{gpsMessage}</small>}</div>
              <label>Contact <small>Optional · local browser storage</small><input maxLength={120} value={draft.contact} onChange={(event) => setDraft({ ...draft, contact: event.target.value })} /></label>
              <label>Image <small>Optional · max 1.5 MB, local storage</small><input type="file" accept="image/*" onChange={(event) => uploadImage(event.target.files?.[0])} /></label>
            </div>
            {draft.image && <img className="cm-image-preview" src={draft.image} alt="Incident attachment preview" />}
            <div className="cm-priority-preview"><span><b>Transparent demo priority</b><small>{draft.description.length >= 8 ? assessIncident(draft.type, draft.severity, draft.description).reason : 'Enter a description to see the rule result.'}</small></span>{draft.description.length >= 8 && <PriorityBadge priority={assessIncident(draft.type, draft.severity, draft.description).priority} />}</div>
            <div className="cm-submit-row"><small>Rule-based result is not validated prediction; coordinator review required.</small><button className="cm-button primary" type="submit"><Plus size={14} /> Submit report</button></div>
          </form>
        </section>}

        {section === 'Notifications' && <section><PageHeading eyebrow="SIMULATED IN-APP NOTIFICATIONS" title="Notifications" subtitle="No email, SMS, push, or real-time notification service is configured." /><div className="cm-card cm-notifications">{data.notices.map((notice) => <article key={notice.id}><span><Bell size={16} /></span><div><b>{notice.title}</b><p>{notice.detail}</p><small>{dateTime(notice.at)} · simulated local notification</small></div>{!notice.read && <button className="cm-button secondary small" onClick={() => markRead(notice)}>Mark read</button>}</article>)}{!data.notices.length && <Empty title="No notifications" text="Incident reports and status changes will be listed here." />}</div></section>}

        {section === 'Settings' && <section><PageHeading eyebrow="WORKSPACE CONFIGURATION" title="Settings & demo access" subtitle="Role selector previews interface permissions only. It does not authenticate the user." /><div className="cm-settings-grid">
          <div className="cm-card cm-settings"><PanelHeading title="Role preview" caption="To test a role, choose it from the header selector." /><p><b>Admin</b> manages demo users, incidents and teams.</p><p><b>Emergency Coordinator</b> reviews reports, adjusts priority and assigns teams.</p><p><b>Rescue Team</b> views selected team assignments and updates field status.</p><p><b>Reporter</b> submits and views browser-prototype reports.</p>
            {role === 'Admin' && <><form className="cm-inline-form" onSubmit={addUser}><label>Demo user name<input required value={newUser} onChange={(event) => setNewUser(event.target.value)} /></label><label>Role<select value={newRole} onChange={(event) => setNewRole(event.target.value as CrisisRole)}>{roles.map((item) => <option key={item}>{item}</option>)}</select></label><button className="cm-button primary">Add demo user</button></form>{data.users.map((user) => <div className="cm-user-row" key={user.id}><b>{user.name}</b><span>{user.role}</span>{!user.id.startsWith('user-') && <button className="cm-link danger" onClick={() => persist({ ...data, users: data.users.filter((item) => item.id !== user.id) })}>Remove</button>}</div>)}</>}
          </div>
          <div className="cm-card cm-settings"><PanelHeading title="Services & data" caption="No backend or map credentials are configured." />
            <p><b>Prototype storage</b><span>localStorage only; no server sync or backend access rules.</span></p>
            <p><b>Authentication/database</b><span>Not configured. A real deployment needs a trusted backend, identity provider, database and server-enforced access rules.</span></p>
            <p><b>Map display</b><span>OpenStreetMap tile service; online only, usage policy and attribution required.</span></p>
            <p><b>Route & ETA</b><span>Public OSRM demonstration endpoint by default. No live traffic; service uptime not guaranteed. Configure <code>VITE_OSRM_ROUTING_URL</code> for a compatible endpoint.</span></p>
            <p><b>Offline</b><span>GPS can work offline with satellite reception. Offline tiles and routing need downloaded map/road data and a routing engine; future work.</span></p>
            <p><b>Notifications</b><span>In-app simulation only. Email/SMS/push needs a server integration/provider.</span></p>
          </div></div></section>}
      </div>
    </main>
    {toast && <div className="cm-toast" role="status"><Check size={15} />{toast}</div>}
  </div>
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="cm-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>
}
function PanelHeading({ title, caption, action }: { title: string; caption: string; action?: React.ReactNode }) {
  return <div className="cm-panel-heading"><div><b>{title}</b><small>{caption}</small></div>{action}</div>
}
function Stat({ label, count, tone = '' }: { label: string; count: number; tone?: string }) {
  return <div className="cm-stat"><span>{label}</span><b>{count}</b><i className={tone}><Activity size={16} /></i></div>
}
function WeatherMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="cm-weather-metric"><span>{icon}</span><small>{label}</small><b>{value}</b></div>
}
function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  return <span className={`cm-priority ${priorityCss[priority]}`}><i />{priority}</span>
}
function StatusBadge({ status }: { status: IncidentStatus }) { return <span className={`cm-status ${statusCss[status]}`}>{status}</span> }
function TeamBadge({ status }: { status: TeamStatus }) { return <span className={`cm-team-status ${status.toLowerCase().replace(' ', '-')}`}><i />{status}</span> }
function IncidentRow({ incident, team, active, onClick }: { incident: CrisisIncident; team?: RescueTeam; active: boolean; onClick: () => void }) {
  return <button className={`cm-incident-row ${active ? 'selected' : ''}`} onClick={onClick}><span className={`cm-incident-icon ${priorityCss[incident.priority]}`}>{incident.type === 'Fire' ? <Flame size={16} /> : <Siren size={16} />}</span><span className="cm-incident-main"><span><b>{incident.id}</b><PriorityBadge priority={incident.priority} /></span><strong>{incident.location}</strong><small>{incident.type} · {dateTime(incident.reportedAt)}{team ? ` · ${team.name}` : ''}</small></span><StatusBadge status={incident.status} /><ArrowRight className="cm-row-arrow" size={14} /></button>
}
function IncidentDetails({ incident, team, teams, travelTimes, role, teamId, onPriority, onStatus, onAssign, onRoute, routeLoading }: {
  incident: CrisisIncident; team?: RescueTeam; teams: RescueTeam[]; role: CrisisRole; teamId: string
  travelTimes: Record<string, number>
  onPriority: (incident: CrisisIncident, priority: IncidentPriority) => void
  onStatus: (incident: CrisisIncident, status: IncidentStatus) => void
  onAssign: (incident: CrisisIncident, teamId: string) => void
  onRoute: (incident: CrisisIncident, team: RescueTeam) => void
  routeLoading: boolean
}) {
  const coordinator = role === 'Admin' || role === 'Emergency Coordinator'
  const owned = role === 'Rescue Team' && incident.teamId === teamId
  const next = incident.status === 'Assigned' ? 'Responding' : incident.status === 'Responding' ? 'On Scene' : incident.status === 'On Scene' ? 'Resolved' : undefined
  const recommended = orderedTeams(incident, teams, travelTimes)
  const [assignment, setAssignment] = useState('')
  return <div className="cm-card cm-details"><PanelHeading title={`Incident ${incident.id}`} caption={`${incident.source} record · reported ${dateTime(incident.reportedAt)}`} />
    <p className="cm-description">{incident.description}</p>{incident.image && <img className="cm-image-preview" src={incident.image} alt={`Evidence for ${incident.id}`} />}
    <div className="cm-detail-grid"><div><small>LOCATION</small><b>{incident.location}</b><span>{incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}</span></div><div><small>TYPE / SEVERITY</small><b>{incident.type} · {incident.severity}/5</b></div><div><small>PRIORITY REASON</small><PriorityBadge priority={incident.priority} /><span>{incident.priorityReason}</span></div><div><small>ASSIGNED TEAM</small><b>{team?.name ?? 'Not assigned'}</b><span>{incident.contact ? `Optional contact: ${incident.contact}` : 'No contact supplied'}</span></div></div>
    {(coordinator || owned) && <div className="cm-actions">
      {coordinator && incident.status === 'Reported' && <button className="cm-button primary" onClick={() => onStatus(incident, 'Under Review')}>Mark under review</button>}
      {coordinator && incident.status !== 'Resolved' && <label>Human-reviewed priority<select aria-label="Set incident priority" value={incident.priority} onChange={(event) => onPriority(incident, event.target.value as IncidentPriority)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>}
      {coordinator && ['Reported', 'Under Review'].includes(incident.status) && <form onSubmit={(event) => { event.preventDefault(); if (assignment) onAssign(incident, assignment) }}><label>Capable available team<select aria-label="Select team to assign" value={assignment} onChange={(event) => setAssignment(event.target.value)}><option value="">Select demo team…</option>{recommended.map((item) => <option key={item.id} value={item.id}>{item.name} · {travelTimes[item.id] !== undefined ? `~${Math.max(1, Math.round(travelTimes[item.id] / 60))} min OSRM · ` : ''}{distanceKm(item, incident).toFixed(1)} km straight-line</option>)}</select></label><button className="cm-button secondary" disabled={!assignment}>Assign demo team</button></form>}
      {owned && next && <button className="cm-button primary" onClick={() => onStatus(incident, next)}>Update to {next}</button>}
      {team && (coordinator || owned) && <button className="cm-button secondary" disabled={routeLoading} onClick={() => onRoute(incident, team)}>{routeLoading ? 'Routing…' : 'Get route & ETA'}</button>}
    </div>}
    <div className="cm-timeline"><b>Incident timeline</b>{incident.updates.map((update, index) => <div key={`${update.at}-${index}`}><i className={statusCss[update.status]} /><span><strong>{update.status}</strong><small>{dateTime(update.at)}</small><p>{update.note}</p><small>{update.actor}</small></span></div>)}</div>
    {!coordinator && !owned && <p className="cm-locked"><Shield size={14} />{role === 'Reporter' ? 'Reporter view cannot assign teams or update status.' : 'This team can view only its own assignments.'}</p>}
  </div>
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="cm-empty"><Activity size={19} /><b>{title}</b><p>{text}</p></div> }
