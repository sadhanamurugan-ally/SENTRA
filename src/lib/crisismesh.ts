export type CrisisRole = 'Admin' | 'Emergency Coordinator' | 'Rescue Team' | 'Reporter'
export type IncidentType = 'Fire' | 'Flood' | 'Accident' | 'Building collapse' | 'Medical emergency' | 'Other'
export type IncidentPriority = 'Critical' | 'High' | 'Medium' | 'Low'
export type IncidentStatus = 'Reported' | 'Under Review' | 'Assigned' | 'Responding' | 'On Scene' | 'Resolved'
export type TeamStatus = 'Available' | 'Busy' | 'Off duty'

export interface Coordinates { latitude: number; longitude: number }
export interface IncidentUpdate { status: IncidentStatus; at: string; note: string; actor: string }
export interface CrisisIncident {
  id: string
  type: IncidentType
  description: string
  severity: number
  priority: IncidentPriority
  priorityReason: string
  manualPriority?: boolean
  latitude: number
  longitude: number
  location: string
  reportedAt: string
  status: IncidentStatus
  reporter: string
  contact: string
  image?: string
  teamId?: string
  source: 'Sample' | 'Prototype' | 'CITYPULSE'
  updates: IncidentUpdate[]
}
export interface RescueTeam {
  id: string
  name: string
  capabilities: IncidentType[]
  status: TeamStatus
  latitude: number
  longitude: number
  location: string
  assignedIncidentId?: string
  source: 'Sample' | 'Prototype'
}
export interface DemoUser { id: string; name: string; role: CrisisRole; teamId?: string }
export interface CrisisNotice { id: string; title: string; detail: string; at: string; read: boolean }
export interface CrisisData {
  incidents: CrisisIncident[]
  teams: RescueTeam[]
  users: DemoUser[]
  notices: CrisisNotice[]
}

export const roles: CrisisRole[] = ['Admin', 'Emergency Coordinator', 'Rescue Team', 'Reporter']
export const incidentTypes: IncidentType[] = ['Fire', 'Flood', 'Accident', 'Building collapse', 'Medical emergency', 'Other']
export const priorities: IncidentPriority[] = ['Critical', 'High', 'Medium', 'Low']
export const statuses: IncidentStatus[] = ['Reported', 'Under Review', 'Assigned', 'Responding', 'On Scene', 'Resolved']
export const teamStatuses: TeamStatus[] = ['Available', 'Busy', 'Off duty']

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
export const demoTeams: RescueTeam[] = [
  { id: 'team-alpha', name: 'Demo Team Alpha', capabilities: ['Fire', 'Accident', 'Medical emergency'], status: 'Busy', latitude: 40.7211, longitude: -73.9974, location: 'Downtown staging area', assignedIncidentId: 'CM-1040', source: 'Sample' },
  { id: 'team-bravo', name: 'Demo Team Bravo', capabilities: ['Flood', 'Building collapse', 'Accident'], status: 'Busy', latitude: 40.7501, longitude: -73.9857, location: 'Midtown staging area', assignedIncidentId: 'CM-1042', source: 'Sample' },
  { id: 'team-charlie', name: 'Demo Team Charlie', capabilities: ['Building collapse', 'Medical emergency', 'Fire'], status: 'Available', latitude: 40.7046, longitude: -74.0142, location: 'South district staging area', source: 'Sample' },
  { id: 'team-delta', name: 'Demo Team Delta', capabilities: ['Flood', 'Medical emergency', 'Other'], status: 'Off duty', latitude: 40.7359, longitude: -73.9751, location: 'East district staging area', source: 'Sample' },
]
export const demoIncidents: CrisisIncident[] = [
  {
    id: 'CM-1042', type: 'Flood', description: 'Water rising near the underpass after heavy rainfall; road access is partially blocked.',
    severity: 4, priority: 'Critical', priorityReason: 'Critical demo result: severity 4/5, flood type, and reported rising water; coordinator review is required.',
    latitude: 40.7182, longitude: -73.9994, location: 'Canal Street underpass, Downtown', reportedAt: ago(8),
    status: 'Responding', reporter: 'Demo Reporter', contact: '', teamId: 'team-bravo', source: 'Sample',
    updates: [
      { status: 'Reported', at: ago(8), note: 'Sample report received for demonstration.', actor: 'Demo Reporter' },
      { status: 'Under Review', at: ago(7), note: 'Coordinator reviewed the reported rising water.', actor: 'Demo Coordinator' },
      { status: 'Assigned', at: ago(6), note: 'Demo Team Bravo assigned. No real team was dispatched.', actor: 'Demo Coordinator' },
      { status: 'Responding', at: ago(4), note: 'Team status simulated for demonstration.', actor: 'Demo Team Bravo' },
    ],
  },
  {
    id: 'CM-1041', type: 'Fire', description: 'Smoke visible from a building entrance. No confirmed injuries reported.',
    severity: 4, priority: 'Critical', priorityReason: 'Critical demo result: severity 4/5, fire incident type, and reported smoke; verify with a human reviewer.',
    latitude: 40.7281, longitude: -73.9942, location: 'West Broadway, SoHo', reportedAt: ago(21),
    status: 'Under Review', reporter: 'Demo Reporter', contact: '', source: 'Sample',
    updates: [
      { status: 'Reported', at: ago(21), note: 'Sample report received for demonstration.', actor: 'Demo Reporter' },
      { status: 'Under Review', at: ago(18), note: 'Coordinator is reviewing the sample report.', actor: 'Demo Coordinator' },
    ],
  },
  {
    id: 'CM-1040', type: 'Accident', description: 'Two vehicles involved in a collision; one lane is obstructed.',
    severity: 3, priority: 'High', priorityReason: 'High demo result: severity 3/5 and accident type; coordinator review is required.',
    latitude: 40.7098, longitude: -74.0064, location: 'Fulton Street, Financial District', reportedAt: ago(49),
    status: 'Assigned', reporter: 'Demo Reporter', contact: '', teamId: 'team-alpha', source: 'Sample',
    updates: [
      { status: 'Reported', at: ago(49), note: 'Sample report received for demonstration.', actor: 'Demo Reporter' },
      { status: 'Under Review', at: ago(46), note: 'Coordinator reviewed the sample incident.', actor: 'Demo Coordinator' },
      { status: 'Assigned', at: ago(42), note: 'Demo Team Alpha assigned. No real team was dispatched.', actor: 'Demo Coordinator' },
    ],
  },
  {
    id: 'CM-1039', type: 'Medical emergency', description: 'A person requested medical assistance at the park entrance.',
    severity: 2, priority: 'Medium', priorityReason: 'Medium demo result: severity 2/5 and medical emergency; confirm details with a person.',
    latitude: 40.7412, longitude: -73.9896, location: 'Madison Square Park, Flatiron', reportedAt: ago(96),
    status: 'On Scene', reporter: 'Demo Reporter', contact: '', teamId: 'team-charlie', source: 'Sample',
    updates: [
      { status: 'Reported', at: ago(96), note: 'Sample report received for demonstration.', actor: 'Demo Reporter' },
      { status: 'Assigned', at: ago(89), note: 'Demo Team Charlie assigned. No real team was dispatched.', actor: 'Demo Coordinator' },
      { status: 'Responding', at: ago(75), note: 'Team status simulated for demonstration.', actor: 'Demo Team Charlie' },
      { status: 'On Scene', at: ago(61), note: 'Team marked on scene for demonstration.', actor: 'Demo Team Charlie' },
    ],
  },
  {
    id: 'CM-1038', type: 'Other', description: 'Demo exercise: a blocked walkway was reported and cleared.',
    severity: 1, priority: 'Low', priorityReason: 'Low demo result: severity 1/5, other incident type, no listed danger terms.',
    latitude: 40.7134, longitude: -74.0082, location: 'Battery Park City', reportedAt: ago(210),
    status: 'Resolved', reporter: 'Demo Reporter', contact: '', source: 'Sample',
    updates: [
      { status: 'Reported', at: ago(210), note: 'Sample exercise report.', actor: 'Demo Reporter' },
      { status: 'Resolved', at: ago(155), note: 'Sample exercise marked resolved.', actor: 'Demo Coordinator' },
    ],
  },
]
export const demoUsers: DemoUser[] = [
  { id: 'user-admin', name: 'Demo Admin', role: 'Admin' },
  { id: 'user-coordinator', name: 'Demo Coordinator', role: 'Emergency Coordinator' },
  { id: 'user-rescue', name: 'Demo Team Alpha', role: 'Rescue Team', teamId: 'team-alpha' },
  { id: 'user-reporter', name: 'Demo Reporter', role: 'Reporter' },
]
export const demoNotices: CrisisNotice[] = [
  { id: 'notice-1', title: 'Priority incident reported', detail: 'CM-1042 · Flood · Sample scenario', at: ago(8), read: false },
  { id: 'notice-2', title: 'Team assignment updated', detail: 'Demo Team Bravo → CM-1042 · Simulated', at: ago(6), read: false },
  { id: 'notice-3', title: 'Status changed', detail: 'CM-1042 · Responding · Simulated', at: ago(4), read: true },
]
export const freshDemoData = (): CrisisData => ({
  incidents: demoIncidents,
  teams: demoTeams,
  users: demoUsers,
  notices: demoNotices,
})

export function assessIncident(type: IncidentType, severity: number, description: string): { priority: IncidentPriority; reason: string } {
  const weights: Record<IncidentType, number> = { 'Building collapse': 3, Fire: 2, Flood: 2, Accident: 1, 'Medical emergency': 1, Other: 0 }
  const dangerTerms = ['trapped', 'injured', 'spreading', 'rising water', 'structural damage', 'smoke', 'explosion', 'multiple casualties']
  const matched = dangerTerms.filter((term) => description.toLowerCase().includes(term))
  const score = severity + weights[type] + (matched.length ? 2 : 0)
  const priority: IncidentPriority = score >= 8 ? 'Critical' : score >= 6 ? 'High' : score >= 4 ? 'Medium' : 'Low'
  const rationale = [`severity ${severity}/5`, `${type.toLowerCase()} type`, ...(matched.length ? [`reported conditions: ${matched.join(', ')}`] : [])]
  return { priority, reason: `${priority} demo-rule result based on ${rationale.join('; ')}. This is not a scientifically validated prediction and requires human review.` }
}

export function distanceKm(origin: Coordinates, destination: Coordinates): number {
  const rad = (degrees: number) => degrees * Math.PI / 180
  const dLat = rad(destination.latitude - origin.latitude)
  const dLon = rad(destination.longitude - origin.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(origin.latitude)) * Math.cos(rad(destination.latitude)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function suitableTeams(incident: CrisisIncident, teams: RescueTeam[]): RescueTeam[] {
  return teams.filter((team) => team.status === 'Available' && team.capabilities.includes(incident.type))
    .sort((a, b) => distanceKm(a, incident) - distanceKm(b, incident))
}
