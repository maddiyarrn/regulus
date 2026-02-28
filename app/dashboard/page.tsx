'use client';

import { useEffect, useState } from 'react';
import { OrbitVisualizer } from '@/components/orbit-visualizer-wrapper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Satellite, Upload, Brain, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SatelliteData {
  id: number;
  name: string;
  norad_id: string;
  orbitPath: Array<{ x: number; y: number; z: number; time?: Date }>;
  color?: string;
}

interface CollisionRisk {
  id: number;
  primary_name: string;
  secondary_name: string;
  primary_norad_id: string;
  secondary_norad_id: string;
  tca: string;
  miss_distance: number;
  risk_level: string;
  status: string;
  maneuver_planned: boolean;
  relative_velocity: number | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [collisions, setCollisions] = useState<CollisionRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('visualizer');
  const [user, setUser] = useState<{ email: string; name: string | null } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        // Load data only after successful auth
        loadSatellites();
        loadCollisions();
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('[v0] Auth check failed:', error);
      router.push('/login');
    }
  }

  async function loadSatellites() {
    try {
      const res = await fetch('/api/satellites?limit=100');
      
      if (!res.ok) {
        console.error('[v0] Failed to fetch satellites:', res.status);
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      
      if (!data.satellites || data.satellites.length === 0) {
        console.log('[v0] No satellites found in database');
        setLoading(false);
        return;
      }
      
      // Load orbit paths for each satellite
      const satellitesWithOrbits = await Promise.all(
        data.satellites.map(async (sat: { id: number; name: string; norad_id: string }) => {
          try {
            const orbitRes = await fetch(`/api/satellites/${sat.id}/orbit?duration=90&steps=100`);
            if (orbitRes.ok) {
              const orbitData = await orbitRes.json();
              return {
                id: sat.id,
                name: sat.name,
                norad_id: sat.norad_id,
                orbitPath: orbitData.orbitPath,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`,
              };
            }
          } catch (err) {
            console.error('[v0] Error loading orbit for', sat.name, err);
          }
          return null;
        })
      );

      setSatellites(satellitesWithOrbits.filter(Boolean) as SatelliteData[]);
    } catch (error) {
      console.error('[v0] Error loading satellites:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCollisions() {
    try {
      const res = await fetch('/api/collisions?status=ACTIVE&limit=20');
      
      if (!res.ok) {
        console.error('[v0] Failed to fetch collisions:', res.status);
        return;
      }
      
      const data = await res.json();
      setCollisions(data.collisions || []);
    } catch (error) {
      console.error('[v0] Error loading collisions:', error);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  async function runCollisionDetection(satelliteId: number) {
    try {
      const res = await fetch('/api/collisions/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primarySatelliteId: satelliteId,
          checkAgainstAll: true,
          timeHorizonHours: 24,
          thresholdKm: 5,
        }),
      });
      
      const data = await res.json();
      alert(`Collision detection complete: ${data.collisionsDetected} potential collision(s) detected`);
      loadCollisions();
    } catch (error) {
      console.error('[v0] Collision detection error:', error);
      alert('Collision detection failed');
    }
  }

  async function generateManeuver(collisionId: number) {
    try {
      const res = await fetch('/api/maneuvers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collisionRiskId: collisionId }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert('Maneuver plan generated successfully!');
        loadCollisions();
      } else {
        alert(data.message || data.error);
      }
    } catch (error) {
      console.error('[v0] Maneuver generation error:', error);
      alert('Maneuver generation failed');
    }
  }

  function getRiskColor(level: string) {
    switch (level) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'default';
      case 'LOW': return 'secondary';
      default: return 'secondary';
    }
  }

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            {!user ? 'Checking authentication...' : 'Loading satellite data from Space-Track...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Orbital Collision Monitoring</h1>
            <p className="text-sm text-muted-foreground">
              Data from <span className="font-medium">Space-Track.org</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="text-sm">
                <span className="text-muted-foreground">Logged in as</span>{' '}
                <span className="font-medium">{user.email}</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <div className="border-b border-border">
          <div className="container mx-auto px-4">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="visualizer">
                <Satellite className="w-4 h-4 mr-2" />
                3D Visualizer
              </TabsTrigger>
              <TabsTrigger value="collisions">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Collision Risks
              </TabsTrigger>
              <TabsTrigger value="import">
                <Upload className="w-4 h-4 mr-2" />
                Import Data
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="visualizer" className="m-0">
          {satellites.length > 0 ? (
            <OrbitVisualizer satellites={satellites} showLabels={true} />
          ) : (
            <div className="flex items-center justify-center h-[600px]">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle>No Satellite Data</CardTitle>
                  <CardDescription>
                    Please import TLE data from Space-Track.org to visualize orbits
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setSelectedTab('import')}>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Space-Track Data
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="collisions" className="container mx-auto px-4 py-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Active Collision Risks</h2>
                <p className="text-sm text-muted-foreground">
                  Detected from Space-Track.org TLE analysis
                </p>
              </div>
              {satellites.length > 0 && (
                <Button onClick={() => runCollisionDetection(satellites[0].id)}>
                  Run Collision Detection
                </Button>
              )}
            </div>

            {collisions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No active collision risks detected</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {collisions.map((collision) => (
                  <Card key={collision.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {collision.primary_name} ↔ {collision.secondary_name}
                          </CardTitle>
                          <CardDescription>
                            NORAD: {collision.primary_norad_id} ↔ {collision.secondary_norad_id}
                          </CardDescription>
                        </div>
                        <Badge variant={getRiskColor(collision.risk_level) as any}>
                          {collision.risk_level}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">TCA</p>
                          <p className="font-medium">
                            {new Date(collision.tca).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Miss Distance</p>
                          <p className="font-medium">{collision.miss_distance.toFixed(3)} km</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Relative Velocity</p>
                          <p className="font-medium">
                            {collision.relative_velocity?.toFixed(0) || 'N/A'} m/s
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Status</p>
                          <p className="font-medium">{collision.status}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        {!collision.maneuver_planned && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => generateManeuver(collision.id)}
                          >
                            <Brain className="w-4 h-4 mr-2" />
                            Generate Maneuver (Mistral AI)
                          </Button>
                        )}
                        {collision.maneuver_planned && (
                          <Badge variant="outline">Maneuver Planned</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="import" className="container mx-auto px-4 py-6">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Import Space-Track Data</CardTitle>
              <CardDescription>
                Import TLE data, CDM files, or CSV from Space-Track.org
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted p-4">
                <h3 className="font-semibold mb-2">Data Source: Space-Track.org</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Register for a free account at <a href="https://www.space-track.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">space-track.org</a></li>
                  <li>Download TLE data in CSV or 3LE format</li>
                  <li>Use the API endpoint below to import the data</li>
                </ol>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">API Endpoint</h4>
                <code className="block bg-muted p-3 rounded text-xs">
                  POST /api/import/space-track
                </code>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Example Request</h4>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`{
  "tleData": [
    {
      "norad_id": "25544",
      "name": "ISS (ZARYA)",
      "line1": "1 25544U 98067A   ...",
      "line2": "2 25544  51.6461 ..."
    }
  ]
}`}
                </pre>
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 p-4">
                <p className="text-sm text-yellow-900 dark:text-yellow-100">
                  <strong>Note:</strong> You need to provide Space-Track data through the API. 
                  Contact the system administrator to set up automated Space-Track data ingestion 
                  or provide your Space-Track credentials.
                </p>
              </div>

              <Button onClick={() => window.open('/api/import/space-track', '_blank')}>
                View API Documentation
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
