'use client';

import { useEffect, useState } from 'react';
import { OrbitVisualizer } from '@/components/orbit-visualizer-wrapper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Satellite, Upload, Brain, LogOut, RefreshCw } from 'lucide-react';
import { CSVUploader } from '@/components/csv-uploader';
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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
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

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(`Обновлено: ${data.stats.imported} спутников за ${data.stats.duration_ms}мс`);
        loadSatellites();
        loadCollisions();
      } else {
        setSyncMessage(`Ошибка: ${data.error}`);
      }
    } catch {
      setSyncMessage('Ошибка подключения к Space-Track.org');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
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
          <div className="flex items-center gap-3">
            {syncMessage && (
              <span className="text-sm text-muted-foreground">{syncMessage}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Обновление...' : 'Обновить с Space-Track'}
            </Button>
            {user && (
              <div className="text-sm hidden md:block">
                <span className="text-muted-foreground">Вошли как</span>{' '}
                <span className="font-medium">{user.email}</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
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
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Import Space-Track.org Data</CardTitle>
                <CardDescription>
                  Upload CSV or TLE files downloaded from{' '}
                  <a
                    href="https://www.space-track.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    Space-Track.org
                  </a>
                  . No file size limit — import all your satellites at once.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CSVUploader onImportComplete={() => { loadSatellites(); loadCollisions(); }} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">How to get files from Space-Track.org</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>
                    Register at{' '}
                    <a href="https://www.space-track.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      space-track.org
                    </a>
                  </li>
                  <li>Go to <strong>Queries &rarr; GP Data (Latest TLE)</strong></li>
                  <li>Filter by NORAD_CAT_ID or object type</li>
                  <li>Select format: <strong>CSV</strong></li>
                  <li>Download and drag the file here</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
