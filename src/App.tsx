import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Check,
  ChevronDown, ChevronRight, Cloud, CloudRain, Database, Download, Edit2,
  ExternalLink, Factory, Gauge, Globe2, HelpCircle, Home, Layers3, Leaf, MapPin, Menu, MoreHorizontal,
  Plus, RefreshCw, Search, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal,
  Thermometer, Trash2, Wind, X,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { assessRisk, recommendationsFor } from './lib/risk'
import { buildDemoData, fetchEnvironmentalData, mergeObservationHistory } from './lib/environment'
import { defaultSettings, storage } from './lib/storage'
import type { AlertRecord, AlertStatus, AppSettings, EnvironmentalData, Location, PageKey, RangeKey, RiskAssessment, RiskLevel } from './types'

const CrisisMesh = lazy(() => import('./CrisisMesh'))

const navigation: { label: PageKey; icon: typeof Home }[] = [
  { label: 'Overview', icon: Home },
  { label: 'Live Monitoring', icon: Activity },
  { label: 'Industrial Locations', icon: Factory },
  { label: 'Environmental Trends', icon: Layers3 },
  { label: 'Risk Analysis', icon: ShieldCheck },
  { label: 'Alerts', icon: Bell },
  { label: 'Settings', icon: SettingsIcon },
]

const riskColor: Record<RiskLevel, string> = {
  Low: '#22a684', Moderate: '#d2a11e', High: '#e58b37', Critical: '#dc5b5b',
}
const riskTone: Record<RiskLevel, string> = {
  Low: 'low', Moderate: 'moderate', High: 'high', Critical: 'critical',
}
const rangeHours: Record<RangeKey, number> = { '24h': 24, '7d': 168, '14d': 336 }

function formatTime(value?: string, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...options }).format(new Date(value))
}

function getShortTime(value: string, range: RangeKey) {
  return new Intl.DateTimeFormat(undefined, range === '24h' ? { hour: 'numeric' } : { month: 'short', day: 'numeric' }).format(new Date(value))
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Cloud; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><strong>{title}</strong><p>{text}</p></div>
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`risk-badge ${riskTone[level]}`}><i />{level}</span>
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><div><span className="eyebrow">LOCATION MANAGEMENT</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      {children}
    </section>
  </div>
}

function App() {
  const [workspace, setWorkspace] = useState<'CITYPULSE' | 'CRISISMESH'>('CITYPULSE')
  const [locations, setLocations] = useState<Location[]>(() => storage.locations())
  const [settings, setSettings] = useState<AppSettings>(() => storage.settings())
  const [observations, setObservations] = useState<Record<string, EnvironmentalData>>(() => storage.observations())
  const [assessments, setAssessments] = useState<Record<string, RiskAssessment>>(() => storage.assessments())
  const [alerts, setAlerts] = useState<AlertRecord[]>(() => storage.alerts())
  const [selectedId, setSelectedId] = useState(() => storage.locations()[0]?.id ?? '')
  const [page, setPage] = useState<PageKey>('Overview')
  const [range, setRange] = useState<RangeKey>('24h')
  const [filterLevel, setFilterLevel] = useState('All risks')
  const [alertFilter, setAlertFilter] = useState('All severity')
  const [statusFilter, setStatusFilter] = useState('All status')
  const [query, setQuery] = useState('')
  const [modalLocation, setModalLocation] = useState<Location | null | undefined>(undefined)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<AlertRecord | null>(null)
  const [toast, setToast] = useState('')

  const selectedLocation = locations.find((location) => location.id === selectedId) ?? locations[0]
  const data = selectedLocation ? observations[selectedLocation.id] : undefined
  const isDemoActive = settings.demoMode || Object.values(observations).some((item) => item.source === 'demo')

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }, [])

  const updateLocationState = useCallback((next: Location[]) => {
    setLocations(next)
    storage.saveLocations(next)
  }, [])

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next)
    storage.saveSettings(next)
  }, [])

  const updateAlerts = useCallback((next: AlertRecord[]) => {
    setAlerts(next)
    storage.saveAlerts(next)
  }, [])

  const saveEnvironmentalData = useCallback((locationId: string, incoming: EnvironmentalData) => {
    setObservations((current) => {
      const next = { ...current, [locationId]: mergeObservationHistory(current[locationId], incoming) }
      storage.saveObservations(next)
      return next
    })
  }, [])

  const removeLocation = useCallback((id: string) => {
    const nextLocations = locations.filter((location) => location.id !== id)
    updateLocationState(nextLocations)
    setObservations((current) => {
      const next = { ...current }
      delete next[id]
      storage.saveObservations(next)
      return next
    })
    setAssessments((current) => {
      const next = { ...current }
      delete next[id]
      storage.saveAssessments(next)
      return next
    })
    setSelectedId((current) => current === id ? nextLocations[0]?.id ?? '' : current)
    notify('Location removed.')
  }, [locations, updateLocationState, notify])

  const loadLocation = useCallback(async (location: Location) => {
    if (settings.demoMode) {
      const sample = buildDemoData(location)
      saveEnvironmentalData(location.id, sample)
      setLastError(null)
      return
    }
    setRefreshing(true)
    setLastError(null)
    try {
      const result = await fetchEnvironmentalData(location)
      saveEnvironmentalData(location.id, result)
      setLastError(result.pollutants.length ? null : 'Live weather loaded. Air-quality measurements are unavailable for this location or time.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to retrieve live readings.'
      setLastError(message)
      const sample = buildDemoData(location)
      sample.error = message
      saveEnvironmentalData(location.id, sample)
    } finally {
      setRefreshing(false)
    }
  }, [settings.demoMode, saveEnvironmentalData])

  useEffect(() => {
    if (!selectedLocation) return
    const existing = observations[selectedLocation.id]
    const stale = existing ? Date.now() - new Date(existing.fetchedAt).getTime() > 15 * 60 * 1000 : false
    if (settings.demoMode || !existing || existing.source === 'demo' || stale) void loadLocation(selectedLocation)
  }, [selectedId, settings.demoMode, selectedLocation])

  useEffect(() => {
    if (settings.demoMode) return
    locations.filter((location) => location.id !== selectedId).forEach((location) => {
      const existing = observations[location.id]
      const stale = existing ? Date.now() - new Date(existing.fetchedAt).getTime() > 15 * 60 * 1000 : false
      if (!existing || existing.source === 'demo' || stale) void loadLocation(location)
    })
  }, [settings.demoMode, locations])

  useEffect(() => {
    if (!settings.demoMode) return
    const samples: Record<string, EnvironmentalData> = {}
    locations.forEach((location) => { samples[location.id] = buildDemoData(location) })
    setObservations((current) => {
      const next = { ...current }
      Object.entries(samples).forEach(([id, sample]) => { next[id] = mergeObservationHistory(current[id], sample) })
      storage.saveObservations(next)
      return next
    })
  }, [settings.demoMode, locations])

  const riskByLocation = useMemo(() => {
    const result: Record<string, RiskAssessment> = {}
    locations.forEach((location) => {
      const saved = observations[location.id]
      const previous = assessments[location.id]
      if (!saved) {
        result[location.id] = { score: 0, level: 'Low', previousScore: previous?.score ?? null, factors: [], warning: 'Environmental readings have not been loaded yet.', completeness: 0 }
        return
      }
      const current = assessRisk(saved, previous?.score ?? null, settings)
      result[location.id] = previous && current.score === previous.score
        ? { ...current, previousScore: previous.previousScore }
        : current
    })
    return result
  }, [locations, observations, assessments, settings])

  useEffect(() => {
    if (!locations.length) return
    const nextAssessments = { ...assessments }
    locations.forEach((location) => {
      const assessment = riskByLocation[location.id]
      if (assessment && !assessment.warning) nextAssessments[location.id] = assessment
    })
    if (JSON.stringify(nextAssessments) !== JSON.stringify(assessments)) {
      setAssessments(nextAssessments)
      storage.saveAssessments(nextAssessments)
    }
  }, [riskByLocation])

  useEffect(() => {
    const newAlerts: AlertRecord[] = []
    locations.forEach((location) => {
      const assessment = riskByLocation[location.id]
      if (!settings.notifications || !assessment || assessment.warning || assessment.score < 25) return
      const factors = assessment.factors.map((factor) => factor.label)
      const bucket = new Date().toISOString().slice(0, 13)
      const fingerprint = `${location.id}:${bucket}:${factors.sort().join(',')}`
      if (alerts.some((alert) => alert.fingerprint === fingerprint)) return
      newAlerts.push({
        id: `CP-${Date.now().toString(36).toUpperCase()}-${location.id.slice(-3).toUpperCase()}`,
        locationId: location.id,
        locationName: location.name,
        riskLevel: assessment.level,
        detectedAt: new Date().toISOString(),
        factors,
        explanation: `${assessment.level} screening conditions detected from available environmental observations. This is a potential risk indicator, not evidence that a nearby industrial site caused the change.`,
        recommendations: recommendationsFor(assessment.level),
        status: 'New',
        history: [{ status: 'New', at: new Date().toISOString() }],
        fingerprint,
      })
    })
    if (newAlerts.length) updateAlerts([...newAlerts, ...alerts])
  }, [riskByLocation, locations, alerts, updateAlerts, settings.notifications])

  const refresh = () => {
    if (selectedLocation) void loadLocation(selectedLocation)
  }

  const selectPage = (label: PageKey) => {
    setPage(label)
    setMobileNavOpen(false)
  }

  const updateAlertStatus = (alert: AlertRecord, status: AlertStatus) => {
    const updated = { ...alert, status, history: [...alert.history, { status, at: new Date().toISOString() }] }
    updateAlerts(alerts.map((item) => item.id === alert.id ? updated : item))
    setSelectedAlert(updated)
    notify(`Alert moved to ${status.toLowerCase()}.`)
  }

  const activeAlerts = alerts.filter((alert) => alert.status !== 'Resolved').length
  const criticalCount = locations.filter((location) => riskByLocation[location.id]?.level === 'Critical').length

  if (workspace === 'CRISISMESH') {
    return <Suspense fallback={<div role="status" style={{ padding: 24, color: '#506579', fontSize: 13 }}>Loading CRISISMESH…</div>}><CrisisMesh onSwitch={setWorkspace} alerts={alerts} locations={locations} /></Suspense>
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.5} /></div><span>sentra<span className="brand-dot">.</span></span><button className="mobile-close icon-button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="module-switcher" role="group" aria-label="SENTRA modules"><button className="selected" aria-current="page">CITYPULSE</button><button onClick={() => setWorkspace('CRISISMESH')}>CRISISMESH</button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => <button key={label} className={`nav-link ${page === label ? 'active' : ''}`} onClick={() => selectPage(label)}>
            <Icon size={18} /><span>{label}</span>{label === 'Alerts' && activeAlerts > 0 && <span className="nav-count">{activeAlerts}</span>}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="coverage-card">
            <div className="coverage-icon"><Globe2 size={17} /></div><div><b>Monitoring coverage</b><span>{locations.length} locations active</span></div>
            <div className="coverage-bar"><span style={{ width: `${Math.min(100, Math.max(15, locations.length * 22))}%` }} /></div>
            <small>Local browser workspace</small>
          </div>
          <button className="profile-row" onClick={() => selectPage('Settings')}><div className="avatar">CP</div><span><b>CityPulse analyst</b><small>Personal workspace</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>
      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumbs"><span>CityPulse</span><ChevronRight size={14} /><b>{page}</b></div>
          <div className="topbar-actions">
            {isDemoActive && <span className="demo-pill"><span />DEMO MODE</span>}
            <button className="date-button"><span className="live-dot" />{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}<ChevronDown size={14} /></button>
            <button className="icon-button alert-icon" onClick={() => selectPage('Alerts')} aria-label="View alerts"><Bell size={18} />{activeAlerts > 0 && <i />}</button>
            <div className="top-avatar">CP</div>
          </div>
        </header>
        <div className="page-content">
          {page === 'Overview' && <OverviewPage locations={locations} selectedLocation={selectedLocation} selectedId={selectedId} onSelect={setSelectedId} data={data} risks={riskByLocation} alerts={alerts} activeAlerts={activeAlerts} criticalCount={criticalCount} range={range} setRange={setRange} onNavigate={selectPage} onRefresh={refresh} refreshing={refreshing} error={lastError} />}
          {page === 'Live Monitoring' && <LivePage locations={locations} selectedId={selectedId} onSelect={setSelectedId} data={data} assessment={selectedLocation ? riskByLocation[selectedLocation.id] : undefined} onRefresh={refresh} refreshing={refreshing} error={lastError} />}
          {page === 'Industrial Locations' && <LocationsPage locations={locations} risks={riskByLocation} observations={observations} selectedId={selectedId} onSelect={setSelectedId} onEdit={(location) => setModalLocation(location)} onAdd={() => setModalLocation(null)} onDelete={removeLocation} filterLevel={filterLevel} setFilterLevel={setFilterLevel} query={query} setQuery={setQuery} />}
          {page === 'Environmental Trends' && <TrendsPage locations={locations} selectedId={selectedId} onSelect={setSelectedId} data={data} range={range} setRange={setRange} />}
          {page === 'Risk Analysis' && <RiskPage locations={locations} risks={riskByLocation} selectedId={selectedId} onSelect={setSelectedId} data={data} />}
          {page === 'Alerts' && <AlertsPage alerts={alerts} alertFilter={alertFilter} setAlertFilter={setAlertFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onInspect={setSelectedAlert} />}
          {page === 'Settings' && <SettingsPage settings={settings} onChange={updateSettings} onReset={() => { const defaults = { ...defaultSettings }; updateSettings(defaults); notify('Settings restored to defaults.') }} locationsCount={locations.length} dataCount={Object.keys(observations).length} />}
        </div>
      </main>
      {modalLocation !== undefined && <LocationModal initial={modalLocation} onClose={() => setModalLocation(undefined)} onSave={(location) => {
        if (modalLocation) {
          updateLocationState(locations.map((item) => item.id === location.id ? location : item))
          notify('Location updated.')
        } else {
          updateLocationState([...locations, location])
          setSelectedId(location.id)
          notify('Location added.')
        }
        setModalLocation(undefined)
      }} />}
      {selectedAlert && <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} onStatus={updateAlertStatus} />}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="heading-actions">{children}</div>}</div>
}

function SelectLocation({ locations, selectedId, onSelect }: { locations: Location[]; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="select-wrap"><MapPin size={15} /><select aria-label="Select location" value={selectedId} onChange={(event) => onSelect(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><ChevronDown size={14} /></div>
}

function DataSource({ source, time }: { source?: 'live' | 'demo'; time?: string }) {
  return <span className="data-source"><i className={source === 'live' ? 'source-live' : 'source-demo'} />{source === 'live' ? 'Open-Meteo live' : source === 'demo' ? 'Demo sample' : 'Waiting for data'}{time && <> · {formatTime(time, { hour: 'numeric', minute: '2-digit' })}</>}</span>
}

function MetricCard({ label, value, unit, icon: Icon, source, time, detail, trend, tone = '' }: { label: string; value: string | number; unit: string; icon: typeof Thermometer; source?: 'live' | 'demo'; time?: string; detail: string; trend?: 'up' | 'down'; tone?: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-detail">{trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : null}{detail}</div><DataSource source={source} time={time} /></article>
}

function OverviewPage(props: {
  locations: Location[]; selectedLocation?: Location; selectedId: string; onSelect: (id: string) => void; data?: EnvironmentalData;
  risks: Record<string, RiskAssessment>; alerts: AlertRecord[]; activeAlerts: number; criticalCount: number; range: RangeKey;
  setRange: (range: RangeKey) => void; onNavigate: (page: PageKey) => void; onRefresh: () => void; refreshing: boolean; error: string | null
}) {
  const { locations, selectedLocation, selectedId, onSelect, data, risks, alerts, activeAlerts, criticalCount, range, setRange, onNavigate, onRefresh, refreshing, error } = props
  const risk = selectedLocation ? risks[selectedLocation.id] : undefined
  const current = data?.current
  const chartData = makeChartData(data, range)
  const recentAlerts = alerts.slice(0, 4)
  return <>
    <PageHeading eyebrow="ENVIRONMENTAL INTELLIGENCE / OVERVIEW" title="Good morning, Analyst" description="Here’s your environmental pulse across monitored industrial locations.">
      <SelectLocation locations={locations} selectedId={selectedId} onSelect={onSelect} />
      <button className="button button-secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? 'Updating' : 'Refresh data'}</button>
    </PageHeading>
    {error && <div className="inline-notice warning-notice"><AlertTriangle size={17} /><span>{error} {data?.source === 'demo' && 'Showing clearly labelled demo sample readings.'}</span></div>}
    <div className="overview-meta"><span><span className="live-dot" />Last updated {formatTime(data?.fetchedAt)}</span><span className="meta-divider" /><span><Database size={13} />Data is sourced per location</span><span className="meta-right">Risk classifications are screening indicators, not causal conclusions.</span></div>
    <section className="metric-grid">
      <MetricCard label="Temperature" value={current?.temperature ?? '—'} unit="°C" icon={Thermometer} source={data?.source} time={current?.time} detail={current?.temperature == null ? 'No current reading' : 'Current air temperature'} tone="metric-orange" />
      <MetricCard label="Humidity" value={current?.humidity ?? '—'} unit="%" icon={Cloud} source={data?.source} time={current?.time} detail={current?.humidity == null ? 'No current reading' : 'Relative humidity'} tone="metric-blue" />
      <MetricCard label="Wind speed" value={current?.windSpeed ?? '—'} unit="km/h" icon={Wind} source={data?.source} time={current?.time} detail={current?.windDirection == null ? 'Direction unavailable' : `Direction ${Math.round(current.windDirection)}°`} tone="metric-teal" />
      <MetricCard label="Rainfall" value={current?.rainfall ?? '—'} unit="mm" icon={CloudRain} source={data?.source} time={current?.time} detail="Current precipitation" tone="metric-purple" />
    </section>
    <section className="dashboard-grid">
      <div className="panel trend-panel">
        <div className="panel-heading"><div><h2>Environmental trends</h2><p>Observed conditions and forecast · {selectedLocation?.name ?? 'No location selected'}</p></div><div className="inline-controls"><div className="segmented">{(['24h', '7d', '14d'] as RangeKey[]).map((key) => <button key={key} className={range === key ? 'selected' : ''} onClick={() => setRange(key)}>{key}</button>)}</div><button className="subtle-icon" onClick={() => onNavigate('Environmental Trends')} aria-label="View trends"><ArrowRight size={16} /></button></div></div>
        <TemperatureChart data={chartData} compact />
        <div className="chart-legend"><span><i className="legend-observed" />Observed</span><span><i className="legend-forecast" />Forecast</span><span className="chart-source">{data?.source === 'live' ? 'Open-Meteo · hourly' : 'Demo sample · hourly'}</span></div>
      </div>
      <div className="panel risk-panel">
        <div className="panel-heading"><div><h2>Environmental risk</h2><p>Explainable screening assessment</p></div><button className="subtle-icon" onClick={() => onNavigate('Risk Analysis')} aria-label="Open risk analysis"><ArrowRight size={16} /></button></div>
        {risk ? <div className="risk-summary">
          <div className="risk-score-row"><div className="score-ring" style={{ '--score-color': riskColor[risk.level], '--score-deg': `${risk.score * 3.6}deg` } as CSSProperties}><div><b>{risk.score}</b><small>/ 100</small></div></div><div className="risk-level-info"><RiskBadge level={risk.level} /><strong>{risk.warning ? 'Preliminary assessment' : `${risk.level} screening risk`}</strong><p>{risk.warning ? 'Limited data; confidence is preliminary.' : risk.factors.length ? `${risk.factors.length} contributing indicator${risk.factors.length === 1 ? '' : 's'} identified.` : 'No configured screening thresholds are currently elevated.'}</p></div></div>
          {risk.warning && <div className="mini-warning"><HelpCircle size={14} />{risk.warning}</div>}
          <div className="risk-factor-list">{(risk.factors.length ? risk.factors.slice(0, 3) : [{ label: 'No elevated factors', detail: 'Continue routine monitoring.', points: 0 }]).map((factor) => <div className="factor-row" key={factor.label}><span className="factor-dot" style={{ background: factor.points ? riskColor[risk.level] : '#b8c3cf' }} /><span><b>{factor.label}</b><small>{factor.detail}</small></span>{factor.points > 0 && <strong>+{factor.points}</strong>}</div>)}</div>
          <button className="text-link" onClick={() => onNavigate('Risk Analysis')}>View complete analysis <ArrowRight size={14} /></button>
        </div> : <EmptyState icon={Gauge} title="No assessment yet" text="Add a monitored location to begin." />}
      </div>
    </section>
    <section className="dashboard-grid lower-grid">
      <div className="panel locations-panel"><div className="panel-heading"><div><h2>Monitored locations</h2><p>Environmental status by industrial site</p></div><button className="text-link" onClick={() => onNavigate('Industrial Locations')}>View all <ArrowRight size={14} /></button></div>
        <MiniLocationMap locations={locations} risks={risks} selectedId={selectedId} onSelect={onSelect} />
        <div className="location-mini-list">{locations.slice(0, 3).map((location) => <button key={location.id} className={`location-mini ${location.id === selectedId ? 'chosen' : ''}`} onClick={() => onSelect(location.id)}><span className="location-avatar"><Factory size={15} /></span><span className="location-mini-name"><b>{location.name}</b><small>{location.region}</small></span><RiskBadge level={risks[location.id]?.level ?? 'Low'} /><ChevronRight size={15} /></button>)}</div>
        <div className="location-foot"><span><b>{locations.length}</b> sites monitored</span><span><i className="legend-marker red" />{criticalCount} critical risk</span></div>
      </div>
      <div className="panel alert-panel"><div className="panel-heading"><div><h2>Recent alerts</h2><p>{activeAlerts} active environmental alerts</p></div><button className="text-link" onClick={() => onNavigate('Alerts')}>View all <ArrowRight size={14} /></button></div>
        {recentAlerts.length ? <div className="recent-alert-list">{recentAlerts.map((alert) => <button className="recent-alert" key={alert.id} onClick={() => onNavigate('Alerts')}><span className={`alert-symbol ${riskTone[alert.riskLevel]}`}><AlertTriangle size={16} /></span><span className="recent-alert-copy"><b>{alert.locationName}</b><small>{alert.factors.join(' · ') || 'Environmental anomaly'}</small></span><span className="recent-alert-time">{formatTime(alert.detectedAt, { hour: 'numeric', minute: '2-digit' })}<RiskBadge level={alert.riskLevel} /></span></button>)}</div> : <EmptyState icon={ShieldCheck} title="All clear for now" text="Alerts will appear here when configured screening rules detect an unusual reading." />}
        <div className="alert-panel-foot"><span className="alert-foot-icon"><AlertOctagon size={15} /></span><span>Assessments identify potential environmental risks and require independent verification.</span></div>
      </div>
    </section>
    <div className="overview-footnote"><Leaf size={14} />CityPulse uses statistical screening rules. Environmental changes are not attributed to a specific facility without further verification.</div>
  </>
}

function makeChartData(data: EnvironmentalData | undefined, range: RangeKey) {
  if (!data) return []
  const cutoff = Date.now() - rangeHours[range] * 60 * 60 * 1000
  return data.weather.filter((item) => new Date(item.time).getTime() >= cutoff).map((item) => ({
    label: getShortTime(item.time, range),
    fullTime: item.time,
    observedTemp: item.isForecast ? null : item.temperature,
    forecastTemp: item.isForecast ? item.temperature : null,
    temperature: item.temperature,
    humidity: item.humidity,
    rainfall: item.rainfall,
    wind: item.windSpeed,
    isForecast: item.isForecast,
  }))
}

function TemperatureChart({ data, compact = false }: { data: ReturnType<typeof makeChartData>; compact?: boolean }) {
  if (!data.length) return <EmptyState icon={Activity} title="Waiting for weather data" text="Weather trends will appear after the first successful data refresh." />
  return <ResponsiveContainer width="100%" height={compact ? 230 : 310}>
    <LineChart data={data} margin={{ top: 14, right: 10, bottom: 0, left: -12 }}>
      <defs><linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#238bcb" stopOpacity={0.16} /><stop offset="100%" stopColor="#238bcb" stopOpacity={0} /></linearGradient></defs>
      <CartesianGrid stroke="#edf1f5" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: '#8a96a6', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={30} />
      <YAxis tick={{ fill: '#8a96a6', fontSize: 11 }} tickLine={false} axisLine={false} unit="°" width={38} />
      <Tooltip content={<ChartTooltip unit="°C" />} />
      <ReferenceLine x={data.find((item) => item.isForecast)?.label} stroke="#bbc4ce" strokeDasharray="4 5" />
      <Line type="monotone" dataKey="observedTemp" name="Observed" stroke="#238bcb" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
      <Line type="monotone" dataKey="forecastTemp" name="Forecast" stroke="#70b6de" strokeWidth={2.5} strokeDasharray="6 5" dot={false} activeDot={{ r: 4 }} connectNulls />
    </LineChart>
  </ResponsiveContainer>
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string; payload: { fullTime: string; isForecast: boolean } }>; label?: string; unit: string }) {
  if (!active || !payload?.length) return null
  const items = payload.filter((item) => item.value !== null && item.value !== undefined)
  return <div className="chart-tooltip"><small>{label} · {payload[0].payload.isForecast ? 'Forecast' : 'Observed'}</small>{items.map((item) => <div key={item.name}><i style={{ background: item.color }} />{item.name}<b>{item.value}{unit}</b></div>)}</div>
}

function MiniLocationMap({ locations, risks, selectedId, onSelect }: { locations: Location[]; risks: Record<string, RiskAssessment>; selectedId: string; onSelect: (id: string) => void }) {
  const points = locations.map((location) => ({
    location,
    x: Math.min(88, Math.max(12, 50 + (location.longitude + 74) * 110)),
    y: Math.min(84, Math.max(17, 51 - (location.latitude - 40.65) * 95)),
  }))
  return <div className="mini-map" aria-label="Interactive schematic map of monitored locations"><div className="map-lines"><i /><i /><i /><i /><i /></div><span className="map-label">NORTH SECTOR</span><span className="map-scale">Schematic location overview</span>
    <svg className="map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={points.length > 1 ? points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') : ''} /></svg>
    {points.map(({ location, x, y }) => <button key={location.id} className={`map-marker ${riskTone[risks[location.id]?.level ?? 'Low']} ${selectedId === location.id ? 'selected' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => onSelect(location.id)} aria-label={`${location.name}, ${risks[location.id]?.level ?? 'Low'} risk`}><span>{location.name}</span></button>)}
    <div className="map-attribution"><MapPin size={12} />Location coordinates</div>
  </div>
}

function LivePage({ locations, selectedId, onSelect, data, assessment, onRefresh, refreshing, error }: { locations: Location[]; selectedId: string; onSelect: (id: string) => void; data?: EnvironmentalData; assessment?: RiskAssessment; onRefresh: () => void; refreshing: boolean; error: string | null }) {
  const current = data?.current
  const time = current?.time
  return <>
    <PageHeading eyebrow="LIVE MONITORING / FIELD CONDITIONS" title="Live monitoring" description="Current conditions and available air-quality readings for a selected location."><SelectLocation locations={locations} selectedId={selectedId} onSelect={onSelect} /><button className="button button-secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Refresh readings</button></PageHeading>
    {error && <div className="inline-notice warning-notice"><AlertTriangle size={17} />{error} {data?.source === 'demo' && 'The values shown are labelled demo samples.'}</div>}
    <div className="live-overview-row"><div><span className="eyebrow">CURRENT CONDITIONS</span><div className="large-temp">{current?.temperature ?? '—'}<sup>°C</sup></div><p>{locations.find((item) => item.id === selectedId)?.name ?? 'Selected site'} · Updated {formatTime(time)}</p><DataSource source={data?.source} time={time} /></div><div className="live-risk-tile"><span>Current screening score</span><div><b>{assessment?.score ?? '—'}</b><span>/ 100</span></div>{assessment && <RiskBadge level={assessment.level} />}</div></div>
    <section className="metric-grid live-metrics">
      <MetricCard label="Relative humidity" value={current?.humidity ?? '—'} unit="%" icon={Cloud} source={data?.source} time={time} detail="Current conditions" tone="metric-blue" />
      <MetricCard label="Wind speed" value={current?.windSpeed ?? '—'} unit="km/h" icon={Wind} source={data?.source} time={time} detail={current?.windDirection == null ? 'Direction unavailable' : `${Math.round(current.windDirection)}° direction`} tone="metric-teal" />
      <MetricCard label="Precipitation" value={current?.rainfall ?? '—'} unit="mm" icon={CloudRain} source={data?.source} time={time} detail="Current precipitation" tone="metric-purple" />
      <MetricCard label="Air quality indicators" value={data?.pollutants.length ?? 0} unit="available" icon={Activity} source={data?.pollutants.length ? data.source : undefined} time={data?.pollutants[0]?.time} detail={data?.pollutants.length ? 'Supported measurements' : 'Data unavailable'} tone="metric-orange" />
    </section>
    <section className="panel pollutants-panel"><div className="panel-heading"><div><h2>Available pollution measurements</h2><p>Only readings returned by the selected data source are shown.</p></div><span className={`source-label ${data?.source === 'live' ? 'live' : 'demo'}`}><i />{data?.source === 'live' ? 'Open-Meteo Air Quality API' : 'Demo sample readings'}</span></div>
      {data?.pollutants.length ? <div className="pollutant-grid">{data.pollutants.map((item) => <div className="pollutant-card" key={item.key}><div><span>{item.label}</span><small>{item.shortLabel}</small></div><strong>{item.value}<small>{item.unit}</small></strong><footer><span>{item.source}</span><span>{formatTime(item.time)}</span></footer><em className="available-status"><i />Available</em></div>)}</div> : <EmptyState icon={Activity} title="Air-quality data unavailable" text="The connected public service did not return supported pollutant readings for this location. No values have been invented." />}
    </section>
    <div className="inline-notice neutral-notice"><HelpCircle size={17} /><span>Air quality readings are modeled/observed public API data where available. Nearby changes alone do not establish that an industrial site caused them.</span></div>
  </>
}

function LocationsPage({ locations, risks, observations, selectedId, onSelect, onEdit, onAdd, onDelete, filterLevel, setFilterLevel, query, setQuery }: {
  locations: Location[]; risks: Record<string, RiskAssessment>; observations: Record<string, EnvironmentalData>; selectedId: string; onSelect: (id: string) => void; onEdit: (location: Location) => void; onAdd: () => void; onDelete: (id: string) => void;
  filterLevel: string; setFilterLevel: (value: string) => void; query: string; setQuery: (value: string) => void
}) {
  const filtered = locations.filter((location) => {
    const matchesLevel = filterLevel === 'All risks' || risks[location.id]?.level === filterLevel
    return matchesLevel && `${location.name} ${location.region}`.toLowerCase().includes(query.toLowerCase())
  })
  return <>
    <PageHeading eyebrow="SITE MANAGEMENT / MONITORED SITES" title="Industrial locations" description="Manage sites, review local conditions and inspect risk assessments."><button className="button button-primary" onClick={onAdd}><Plus size={16} />Add location</button></PageHeading>
    <div className="location-summary-strip"><span><Factory size={16} /><b>{locations.length}</b> monitored locations</span><span><span className="legend-marker red" /><b>{locations.filter((item) => risks[item.id]?.level === 'Critical').length}</b> critical</span><span><Database size={15} />Saved in this browser</span></div>
    <div className="locations-layout">
      <section className="panel location-table-panel"><div className="location-toolbar"><div className="search-control"><Search size={16} /><input placeholder="Search locations..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filter-control"><SlidersHorizontal size={15} /><select aria-label="Filter locations by risk" value={filterLevel} onChange={(event) => setFilterLevel(event.target.value)}>{['All risks', 'Low', 'Moderate', 'High', 'Critical'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></div></div>
        {filtered.length ? <div className="location-table-scroll"><table className="data-table"><thead><tr><th>LOCATION</th><th>COORDINATES</th><th>CURRENT RISK</th><th>DATA SOURCE</th><th /></tr></thead><tbody>{filtered.map((location) => { const source = observations[location.id]?.source; return <tr key={location.id} className={selectedId === location.id ? 'row-selected' : ''} onClick={() => onSelect(location.id)}><td><div className="table-location"><span className="location-avatar"><Factory size={15} /></span><span><b>{location.name}</b><small>{location.region}</small></span></div></td><td className="coordinates">{location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°</td><td><RiskBadge level={risks[location.id]?.level ?? 'Low'} /><span className="table-score">{risks[location.id]?.score ?? 0}/100</span></td><td><span className={`table-data-state ${risks[location.id]?.warning ? 'incomplete' : ''}`}><i />{source === 'live' ? 'Live API' : source === 'demo' ? 'Demo sample' : 'Loading'}</span></td><td><button className="table-action" aria-label={`Edit ${location.name}`} onClick={(event) => { event.stopPropagation(); onEdit(location) }}><Edit2 size={15} /></button></td></tr> })}</tbody></table></div> : <EmptyState icon={MapPin} title="No locations match" text="Adjust your search or risk filter." />}
      </section>
      <aside className="panel selected-site-panel"><div className="panel-heading"><div><span className="eyebrow">SELECTED SITE</span><h2>{locations.find((item) => item.id === selectedId)?.name ?? 'No location selected'}</h2></div><button className="subtle-icon" onClick={() => { const selected = locations.find((item) => item.id === selectedId); if (selected) onEdit(selected) }} aria-label="Edit selected location"><Edit2 size={15} /></button></div>
        <MiniLocationMap locations={locations} risks={risks} selectedId={selectedId} onSelect={onSelect} />
        {(() => { const location = locations.find((item) => item.id === selectedId); const assessment = location ? risks[location.id] : undefined; return location && assessment ? <><div className="selected-site-facts"><div><small>Risk score</small><b>{assessment.score}<span>/100</span></b></div><div><small>Coordinates</small><b className="site-coordinates">{location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}</b></div></div><RiskBadge level={assessment.level} /><p className="site-description">{assessment.warning ?? (assessment.factors[0]?.detail ?? 'No elevated environmental screening factors are currently identified.')}</p></> : <EmptyState icon={MapPin} title="Select a location" text="Choose a site from the list to inspect its assessment." /> })()}
        {locations.length > 0 && <LocationDeleteButton location={locations.find((item) => item.id === selectedId)} onDelete={() => onDelete(selectedId)} />}
      </aside>
    </div>
    <div className="storage-note"><Database size={15} /><span>Location details are stored in localStorage on this device and are not shared or synced to a server.</span></div>
  </>
}

function LocationDeleteButton({ location, onDelete }: { location?: Location; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  if (!location) return null
  return confirm ? <div className="delete-confirm"><span>Delete this location?</span><button className="button button-danger small" onClick={onDelete}>Delete</button><button className="button button-secondary small" onClick={() => setConfirm(false)}>Cancel</button></div> : <button className="delete-location" onClick={() => setConfirm(true)}><Trash2 size={14} />Remove location</button>
}

function TrendsPage({ locations, selectedId, onSelect, data, range, setRange }: { locations: Location[]; selectedId: string; onSelect: (id: string) => void; data?: EnvironmentalData; range: RangeKey; setRange: (range: RangeKey) => void }) {
  const chartData = makeChartData(data, range)
  const selectedRangeData = chartData.slice(-rangeHours[range])
  const pollutantValues = data?.pollutants ?? []
  return <>
    <PageHeading eyebrow="ENVIRONMENTAL TRENDS / OBSERVATIONS & OUTLOOK" title="Environmental trends" description="Explore recent weather observations and forecasts for monitored locations."><SelectLocation locations={locations} selectedId={selectedId} onSelect={onSelect} /><div className="segmented range-large">{(['24h', '7d', '14d'] as RangeKey[]).map((key) => <button key={key} className={range === key ? 'selected' : ''} onClick={() => setRange(key)}>{key}</button>)}</div></PageHeading>
    <div className="trend-banner"><span className="trend-banner-icon"><Activity size={19} /></span><div><b>{range === '24h' ? 'Last 24 hours' : range === '7d' ? 'Last 7 days' : 'Last 14 days'} · {locations.find((item) => item.id === selectedId)?.name ?? 'Selected site'}</b><small>Forecast periods are visually separated and should not be interpreted as observed conditions.</small></div><DataSource source={data?.source} time={data?.fetchedAt} /></div>
    <div className="trend-chart-grid">
      <div className="panel full-chart-panel"><div className="panel-heading"><div><h2>Temperature</h2><p>°C · current conditions, historical hourly observations and forecast</p></div><span className="chart-status-dot">● Temperature</span></div><TemperatureChart data={selectedRangeData} /><ChartLegend /></div>
      <TrendChartCard title="Relative humidity" subtitle="Percentage · hourly" data={selectedRangeData} field="humidity" color="#688bc5" unit="%" />
      <TrendChartCard title="Rainfall" subtitle="Precipitation · mm" data={selectedRangeData} field="rainfall" color="#54a6c5" unit=" mm" area />
      <TrendChartCard title="Wind speed" subtitle="Wind at 10 m · km/h" data={selectedRangeData} field="wind" color="#8e7bc5" unit=" km/h" />
      <div className="panel air-trend-panel"><div className="panel-heading"><div><h2>Available air-quality indicators</h2><p>Latest available values · not a historical series</p></div><span className={`source-label ${data?.source === 'live' ? 'live' : 'demo'}`}><i />{data?.source === 'live' ? 'Live source' : 'Demo sample'}</span></div>
        {pollutantValues.length ? <div className="air-bars">{pollutantValues.map((item) => <div className="air-bar-row" key={item.key}><span>{item.shortLabel}</span><div className="air-bar"><i style={{ width: `${Math.min(100, item.value / 1.5)}%` }} /></div><b>{item.value}<small> {item.unit}</small></b></div>)}</div> : <EmptyState icon={Activity} title="No pollutant data returned" text="Only indicators provided by the configured source will be visualized." />}
        <div className="source-note"><Database size={13} />{pollutantValues[0]?.source ?? 'Data unavailable'} · {pollutantValues[0] ? formatTime(pollutantValues[0].time) : 'No measurement timestamp'}</div>
      </div>
    </div>
    <div className="storage-note"><Database size={15} /><span>Retrieved observations are stored locally in this browser for review. Forecast values are not saved as observed readings.</span></div>
  </>
}

function ChartLegend() {
  return <div className="chart-legend chart-legend-large"><span><i className="legend-observed" />Historical observations</span><span><i className="legend-forecast" />Forecast</span><span className="chart-source"><Cloud size={13} />Open-Meteo weather API</span></div>
}

function TrendChartCard({ title, subtitle, data, field, color, unit, area = false }: { title: string; subtitle: string; data: ReturnType<typeof makeChartData>; field: 'humidity' | 'rainfall' | 'wind'; color: string; unit: string; area?: boolean }) {
  return <div className="panel trend-small-chart"><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><MoreHorizontal size={18} /></div>
    {data.length ? <ResponsiveContainer width="100%" height={198}><AreaChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: -15 }}><defs><linearGradient id={`fill-${field}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.18} /><stop offset="95%" stopColor={color} stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#edf1f5" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#8a96a6', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={32} /><YAxis tick={{ fill: '#8a96a6', fontSize: 10 }} tickLine={false} axisLine={false} width={38} /><Tooltip content={<ChartTooltip unit={unit} />} />{area ? <Area type="monotone" dataKey={field} name={title} stroke={color} fill={`url(#fill-${field})`} strokeWidth={2} connectNulls /> : <Line type="monotone" dataKey={field} name={title} stroke={color} strokeWidth={2} dot={false} connectNulls />}</AreaChart></ResponsiveContainer> : <EmptyState icon={Activity} title="No trend data" text="Load weather readings to see the chart." />}
    <div className="small-chart-footer"><span><i className="legend-observed" />Observed</span><span><i className="legend-forecast" />Forecast</span></div></div>
}

function RiskPage({ locations, risks, selectedId, onSelect, data }: { locations: Location[]; risks: Record<string, RiskAssessment>; selectedId: string; onSelect: (id: string) => void; data?: EnvironmentalData }) {
  const active = locations.find((location) => location.id === selectedId)
  const assessment = active ? risks[active.id] : undefined
  return <>
    <PageHeading eyebrow="RISK ANALYSIS / EXPLAINABLE SCREENING" title="Risk analysis" description="Rule-based environmental screening with transparent factors and data-quality context."><SelectLocation locations={locations} selectedId={selectedId} onSelect={onSelect} /></PageHeading>
    <div className="risk-analysis-grid">
      <section className="panel analysis-score-panel"><div className="panel-heading"><div><h2>{active?.name ?? 'Location assessment'}</h2><p>Current environmental screening assessment</p></div><RiskBadge level={assessment?.level ?? 'Low'} /></div>
        {assessment && <><div className="analysis-score"><div className="score-ring large" style={{ '--score-color': riskColor[assessment.level], '--score-deg': `${assessment.score * 3.6}deg` } as CSSProperties}><div><b>{assessment.score}</b><small>/ 100</small></div></div><div className="analysis-score-copy"><span className="eyebrow">CURRENT SCORE</span><h3>{assessment.level} risk</h3><p>Previous available score: <b>{assessment.previousScore === null ? 'Not yet available' : `${assessment.previousScore}/100`}</b></p><span className="score-change">{assessment.previousScore === null ? 'Baseline being established' : assessment.score === assessment.previousScore ? 'No score change' : `${assessment.score > assessment.previousScore ? '+' : ''}${assessment.score - assessment.previousScore} since previous assessment`}</span></div></div>
        {assessment.warning && <div className="inline-notice warning-notice"><AlertTriangle size={16} />{assessment.warning}</div>}
        <div className="analysis-subhead"><h3>Contributing factors</h3><span>{assessment.factors.length} detected</span></div>
        {assessment.factors.length ? <div className="analysis-factor-list">{assessment.factors.map((factor) => <div className="analysis-factor" key={factor.label}><span className="factor-number">{String(factor.points).padStart(2, '0')}</span><span><b>{factor.label}</b><small>{factor.detail}</small></span><span className="factor-points">+{factor.points} pts</span></div>)}</div> : <EmptyState icon={ShieldCheck} title="No elevated factors" text="No configured screening rule is elevated for this reading set." />}
        <div className="analysis-subhead"><h3>Assessment confidence</h3><b>{assessment.completeness}%</b></div><div className="confidence-track"><span style={{ width: `${assessment.completeness}%` }} /></div><p className="confidence-copy">{assessment.warning ? 'Limited historical observations; scores should be interpreted as preliminary.' : `${data?.weather.filter((item) => !item.isForecast).length ?? 0} historical hourly observations and ${data?.pollutants.length ?? 0} available pollutant measurements were considered.`}</p>
        </>}
      </section>
      <aside className="analysis-side-column"><div className="panel rules-panel"><div className="panel-heading"><div><h2>Scoring methodology</h2><p>Documented statistical screening rules</p></div><HelpCircle size={17} /></div><div className="rule-list"><div><i className="rule-icon orange"><Thermometer size={15} /></i><span><b>Temperature deviation</b><small>12–28 points for deviation beyond the configured 8°C baseline difference or a 2σ event.</small></span></div><div><i className="rule-icon blue"><Activity size={15} /></i><span><b>Pollutant thresholds</b><small>PM2.5 above {data?.pollutants.find((item) => item.key === 'pm2_5')?.source ? 'configured limit' : '35 μg/m³'} adds a scaled 12–35 points; NO₂ &gt;40 μg/m³ adds 18.</small></span></div><div><i className="rule-icon purple"><Wind size={15} /></i><span><b>Rapid changes & wind</b><small>Fast humidity shifts and winds ≥45 km/h add points when measured.</small></span></div><div><i className="rule-icon red"><Layers3 size={15} /></i><span><b>Combined conditions</b><small>Multiple simultaneous factors add 10 points. Total is capped at 100.</small></span></div></div><div className="risk-bands"><span><i style={{ background: riskColor.Low }} />0–24 Low</span><span><i style={{ background: riskColor.Moderate }} />25–49 Moderate</span><span><i style={{ background: riskColor.High }} />50–74 High</span><span><i style={{ background: riskColor.Critical }} />75–100 Critical</span></div></div>
        <div className="panel recommendations-panel"><div className="panel-heading"><div><h2>Precautionary recommendations</h2><p>Suggested next steps for this assessment</p></div><ShieldCheck size={17} /></div><ul>{recommendationsFor(assessment?.level ?? 'Low').map((recommendation) => <li key={recommendation}><Check size={15} />{recommendation}</li>)}</ul></div>
      </aside>
    </div>
    <section className="panel location-risk-table"><div className="panel-heading"><div><h2>Location risk overview</h2><p>Comparative current screening status</p></div></div><div className="location-risk-cards">{locations.map((location) => { const item = risks[location.id]; return <button key={location.id} className={`location-risk-card ${selectedId === location.id ? 'active' : ''}`} onClick={() => onSelect(location.id)}><span className="risk-card-icon" style={{ color: riskColor[item?.level ?? 'Low'], background: `${riskColor[item?.level ?? 'Low']}12` }}><Factory size={17} /></span><span className="risk-card-name"><b>{location.name}</b><small>{location.region}</small></span><RiskBadge level={item?.level ?? 'Low'} /><span className="risk-card-score">{item?.score ?? '—'}<small>/100</small></span></button> })}</div></section>
    <div className="inline-notice neutral-notice"><AlertTriangle size={16} /><span>Risk scores are screening indicators generated by documented rules; they do not predict disasters or establish a pollution source. Independent measurements and expert review are required.</span></div>
  </>
}

function AlertsPage({ alerts, alertFilter, setAlertFilter, statusFilter, setStatusFilter, onInspect }: { alerts: AlertRecord[]; alertFilter: string; setAlertFilter: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; onInspect: (alert: AlertRecord) => void }) {
  const filtered = alerts.filter((alert) => (alertFilter === 'All severity' || alert.riskLevel === alertFilter) && (statusFilter === 'All status' || alert.status === statusFilter))
  const unresolved = alerts.filter((alert) => alert.status !== 'Resolved').length
  return <>
    <PageHeading eyebrow="ALERT CENTER / REVIEW & RESPONSE" title="Environmental alerts" description="Review statistical anomalies, document status changes and inspect recommended follow-up."><button className="button button-secondary" onClick={() => { const content = ['Alert ID,Location,Risk,Status,Detected at,Factors', ...alerts.map((alert) => [alert.id, `"${alert.locationName}"`, alert.riskLevel, alert.status, alert.detectedAt, `"${alert.factors.join('; ')}"`].join(','))].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' })); link.download = 'citypulse-alerts.csv'; link.click(); URL.revokeObjectURL(link.href) }}><Download size={15} />Export CSV</button></PageHeading>
    <div className="alert-kpi-row"><div className="alert-kpi"><span className="alert-kpi-icon red"><AlertOctagon size={17} /></span><span><b>{unresolved}</b><small>Active alerts</small></span></div><div className="alert-kpi"><span className="alert-kpi-icon yellow"><AlertTriangle size={17} /></span><span><b>{alerts.filter((alert) => alert.status === 'New').length}</b><small>New</small></span></div><div className="alert-kpi"><span className="alert-kpi-icon green"><Check size={17} /></span><span><b>{alerts.filter((alert) => alert.status === 'Resolved').length}</b><small>Resolved</small></span></div><span className="alert-kpi-note">Alerts are generated from available readings and deduplicated per location, hour and contributing factors.</span></div>
    <section className="panel alert-table-panel"><div className="alert-table-toolbar"><div><h2>Alert log</h2><p>{filtered.length} {filtered.length === 1 ? 'alert' : 'alerts'} shown</p></div><div className="table-filters"><div className="filter-control"><SlidersHorizontal size={14} /><select aria-label="Filter alerts by severity" value={alertFilter} onChange={(event) => setAlertFilter(event.target.value)}>{['All severity', 'Critical', 'High', 'Moderate', 'Low'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></div><div className="filter-control"><select aria-label="Filter alerts by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['All status', 'New', 'Under Review', 'Resolved'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></div></div></div>
      {filtered.length ? <div className="alert-table-scroll"><table className="data-table alert-table"><thead><tr><th>ALERT ID</th><th>LOCATION</th><th>RISK LEVEL</th><th>DETECTED</th><th>FACTORS</th><th>STATUS</th><th /></tr></thead><tbody>{filtered.map((alert) => <tr key={alert.id}><td><b className="alert-id">{alert.id}</b></td><td><b>{alert.locationName}</b></td><td><RiskBadge level={alert.riskLevel} /></td><td className="coordinates">{formatTime(alert.detectedAt)}</td><td><span className="factor-chip">{alert.factors.slice(0, 2).join(' · ') || 'Environmental screening'}</span></td><td><span className={`status-badge ${alert.status.toLowerCase().replace(' ', '-')}`}>{alert.status}</span></td><td><button className="button button-secondary tiny" onClick={() => onInspect(alert)}>Review <ArrowRight size={13} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={Bell} title="No alerts match these filters" text={alerts.length ? 'Try a different severity or status filter.' : 'No alerts have been generated yet. Alerts appear when the screening rules flag unusual conditions.'} />}
    </section>
    <div className="inline-notice neutral-notice"><ShieldCheck size={16} /><span>Alert explanations describe observed anomalies only. They are not evidence of facility causation. Follow local environmental and safety protocols.</span></div>
  </>
}

function SettingsPage({ settings, onChange, onReset, locationsCount, dataCount }: { settings: AppSettings; onChange: (value: AppSettings) => void; onReset: () => void; locationsCount: number; dataCount: number }) {
  const set = (key: keyof AppSettings, value: boolean | number) => onChange({ ...settings, [key]: value })
  return <>
    <PageHeading eyebrow="PREFERENCES / DATA & THRESHOLDS" title="Settings" description="Configure data sources, screening thresholds and browser-stored preferences." />
    <div className="settings-layout">
      <section className="panel settings-panel"><div className="settings-section"><div className="settings-section-heading"><span className="settings-icon blue"><Database size={17} /></span><div><h2>Data sources</h2><p>Choose how the dashboard retrieves environmental readings.</p></div></div>
          <div className="settings-row"><span><b>Demo mode</b><small>Use clearly labelled synthetic weather and sample pollutant readings for demonstrations.</small></span><button className={`toggle ${settings.demoMode ? 'on' : ''}`} role="switch" aria-checked={settings.demoMode} aria-label="Toggle demo mode" onClick={() => set('demoMode', !settings.demoMode)}><i /></button></div>
          <div className="settings-data-info"><div><span className="source-status"><i className={settings.demoMode ? 'demo' : 'live'} /></span><span><b>{settings.demoMode ? 'Demo samples active' : 'Open-Meteo public APIs'}</b><small>{settings.demoMode ? 'Weather and pollution samples are synthetic; no external data requested in demo mode.' : 'Weather forecast API and public Air Quality API · no API key required.'}</small></span></div><ExternalLink size={15} /></div>
        </div>
        <div className="settings-section"><div className="settings-section-heading"><span className="settings-icon orange"><SlidersHorizontal size={17} /></span><div><h2>Anomaly thresholds</h2><p>Threshold changes affect future screening assessments and alerts.</p></div></div>
          <label className="setting-range"><span><b>PM2.5 screening threshold</b><small>Flag an elevated reading above this value.</small></span><span className="range-input"><input type="number" min="5" max="200" value={settings.pollutionThreshold} onChange={(event) => set('pollutionThreshold', Math.min(200, Math.max(5, Number(event.target.value) || 5)))} /><small>μg/m³</small></span></label>
          <label className="setting-range"><span><b>Temperature deviation</b><small>Flag when the reading departs from the recent mean.</small></span><span className="range-input"><input type="number" min="2" max="25" value={settings.temperatureDeviation} onChange={(event) => set('temperatureDeviation', Math.min(25, Math.max(2, Number(event.target.value) || 2)))} /><small>°C</small></span></label>
        </div>
        <div className="settings-section"><div className="settings-section-heading"><span className="settings-icon purple"><Bell size={17} /></span><div><h2>Alert preferences</h2><p>Configure in-app alert generation for this browser.</p></div></div>
          <div className="settings-row"><span><b>Generate alert records</b><small>Create a local in-app alert when a location scores Moderate risk or above.</small></span><button className={`toggle ${settings.notifications ? 'on' : ''}`} role="switch" aria-checked={settings.notifications} aria-label="Toggle alert generation" onClick={() => set('notifications', !settings.notifications)}><i /></button></div>
        </div>
        <div className="settings-actions"><button className="button button-secondary" onClick={onReset}>Reset defaults</button><span><Check size={14} />Settings save automatically</span></div>
      </section>
      <aside className="settings-aside"><div className="panel storage-panel"><div className="panel-heading"><div><h2>Browser storage</h2><p>Your data stays on this device</p></div><Database size={17} /></div><div className="storage-stat"><span>Monitored locations</span><b>{locationsCount}</b></div><div className="storage-stat"><span>Locations with saved observations</span><b>{dataCount}</b></div><div className="storage-warning"><HelpCircle size={15} />This information is saved in localStorage in your current browser. It is not a shared database, and clearing browser storage removes it.</div></div>
        <div className="panel about-panel"><div className="about-logo"><span><Activity size={18} /></span>sentra<span className="brand-dot">.</span></div><h3>Environmental intelligence, with context.</h3><p>CityPulse provides explainable statistical screening. It does not diagnose environmental harm, predict disasters with certainty, or identify a source without verification.</p><small>Version 1.0.0 · Frontend-only workspace</small></div>
      </aside>
    </div>
  </>
}

function LocationModal({ initial, onClose, onSave }: { initial: Location | null; onClose: () => void; onSave: (location: Location) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [latitude, setLatitude] = useState(String(initial?.latitude ?? ''))
  const [longitude, setLongitude] = useState(String(initial?.longitude ?? ''))
  const [region, setRegion] = useState(initial?.region ?? '')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const lat = Number(latitude)
    const lon = Number(longitude)
    if (!name.trim()) { setError('Enter a location name.'); return }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) { setError('Enter valid coordinates (latitude −90 to 90, longitude −180 to 180).'); return }
    onSave({ id: initial?.id ?? `loc-${Date.now().toString(36)}`, name: name.trim(), latitude: lat, longitude: lon, region: region.trim() || 'Unspecified region', createdAt: initial?.createdAt ?? new Date().toISOString() })
  }
  return <Modal title={initial ? 'Edit location' : 'Add an industrial location'} onClose={onClose}><form className="location-form" onSubmit={submit}>
    <p>Provide coordinates for public weather and air-quality lookups. Location data is stored in this browser only.</p>
    <label>Location name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Westside Manufacturing" maxLength={80} /></label>
    <div className="form-split"><label>Latitude<input type="number" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="40.7128" /></label><label>Longitude<input type="number" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="-74.0060" /></label></div>
    <label>Region or district <span className="optional-label">Optional</span><input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="e.g. West district" maxLength={60} /></label>
    {error && <div className="form-error"><AlertTriangle size={14} />{error}</div>}
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><Check size={15} />{initial ? 'Save changes' : 'Add location'}</button></div>
  </form></Modal>
}

function AlertModal({ alert, onClose, onStatus }: { alert: AlertRecord; onClose: () => void; onStatus: (alert: AlertRecord, status: AlertStatus) => void }) {
  return <Modal title="Alert details" onClose={onClose}><div className="alert-detail"><div className="alert-detail-top"><div className={`alert-detail-icon ${riskTone[alert.riskLevel]}`}><AlertTriangle size={22} /></div><span><b>{alert.id}</b><small>Detected {formatTime(alert.detectedAt)}</small></span><RiskBadge level={alert.riskLevel} /></div><div className="alert-detail-section"><span className="eyebrow">AFFECTED LOCATION</span><b><Factory size={15} />{alert.locationName}</b></div><div className="alert-detail-section"><span className="eyebrow">DETECTED FACTORS</span><div className="factor-chip-row">{alert.factors.map((factor) => <span className="factor-chip" key={factor}>{factor}</span>)}</div></div><div className="alert-explanation"><AlertOctagon size={16} /><p>{alert.explanation}</p></div><div className="alert-detail-section"><span className="eyebrow">RECOMMENDED PRECAUTIONS</span><ul>{alert.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul></div><div className="alert-history"><span className="eyebrow">STATUS HISTORY</span>{alert.history.map((item, index) => <div key={`${item.status}-${item.at}-${index}`}><i className={`history-dot ${item.status.toLowerCase().replace(' ', '-')}`} /><span><b>{item.status}</b><small>{formatTime(item.at)}</small></span></div>)}</div><div className="modal-actions alert-modal-actions">{alert.status !== 'Resolved' && <button className="button button-secondary" onClick={() => onStatus(alert, 'Under Review')}>{alert.status === 'New' ? 'Acknowledge alert' : 'Keep under review'}</button>}{alert.status !== 'Resolved' && <button className="button button-primary" onClick={() => onStatus(alert, 'Resolved')}><Check size={15} />Mark resolved</button>}{alert.status === 'Resolved' && <button className="button button-secondary" onClick={() => onStatus(alert, 'Under Review')}>Reopen for review</button>}</div></div></Modal>
}

export default App
