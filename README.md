# Orbital Collision Monitoring System

Advanced satellite tracking and collision prediction system using AI-powered analysis of Space-Track.org data.

## Features

- **3D Orbit Visualization**: Real-time satellite orbit visualization using React Three Fiber
- **Collision Detection**: Automated analysis of TLE data to detect potential collisions
- **AI-Powered Maneuvers**: Mistral AI generates optimal collision avoidance plans
- **TLE Data Management**: PostgreSQL database for storing Space-Track.org data
- **LSTM Predictions**: Machine learning trajectory predictions (Python service)
- **User Authentication**: Secure login with bcrypt password hashing

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **3D Graphics**: React Three Fiber, Three.js
- **Database**: Neon PostgreSQL
- **AI**: Mistral AI API
- **Orbital Calculations**: satellite.js
- **Authentication**: JWT with bcryptjs
- **UI**: shadcn/ui, Tailwind CSS

## Data Source

All satellite orbital data is sourced from **Space-Track.org**, the official repository maintained by the U.S. Space Force.

## Getting Started

### Prerequisites

1. **Space-Track.org Account**
   - Register at https://www.space-track.org
   - Download TLE data or use their API

2. **Mistral AI API Key**
   - Sign up at https://console.mistral.ai
   - Create an API key for maneuver generation

3. **Neon Database**
   - Database is already configured in this project

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:
- `DATABASE_URL`: Already configured (Neon)
- `JWT_SECRET`: Generate a secure random string
- `MISTRAL_API_KEY`: Your Mistral AI API key

3. Database is already set up with the schema

4. Run the development server:
```bash
pnpm dev
```

5. Open http://localhost:3000

### Importing Space-Track Data

1. Log in to the dashboard
2. Navigate to the "Import Data" tab
3. Follow the instructions to import TLE data from Space-Track.org
4. Use the POST endpoint `/api/import/space-track` with your TLE data

Example TLE import format:
```json
{
  "tleData": [
    {
      "norad_id": "25544",
      "name": "ISS (ZARYA)",
      "line1": "1 25544U 98067A   ...",
      "line2": "2 25544  51.6461 ...",
      "international_designator": "1998-067A",
      "object_type": "PAYLOAD",
      "country": "USA",
      "launch_date": "1998-11-20"
    }
  ]
}
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Sign in
- `POST /api/auth/logout` - Sign out
- `GET /api/auth/me` - Get current user

### Satellites
- `GET /api/satellites` - List all satellites
- `GET /api/satellites/[id]` - Get satellite details
- `GET /api/satellites/[id]/orbit` - Get orbital path for visualization

### Collision Detection
- `GET /api/collisions` - List collision risks
- `POST /api/collisions/detect` - Run collision detection
- `GET /api/collisions/detect` - Get API info

### Maneuver Generation
- `POST /api/maneuvers/generate` - Generate AI-powered maneuver plan
- `GET /api/maneuvers/generate` - Get API info

### Data Import
- `POST /api/import/space-track` - Import TLE data from Space-Track
- `GET /api/import/space-track` - Get import instructions

## Space-Track.org Integration

This system requires data from Space-Track.org. When you need Space-Track data:

1. **Manual Import**: Download CSV/3LE files and import via API
2. **API Integration** (future): Automate fetching with credentials
3. **CDM Files**: Import Conjunction Data Messages for collision analysis

All data mentions Space-Track.org as the source throughout the UI.

## LSTM Trajectory Predictions (Optional)

For enhanced trajectory predictions, set up the Python ML service:

1. Contact the administrator for the Python service URL
2. Set `PYTHON_ML_SERVICE_URL` in your environment variables
3. The LSTM model will provide confidence-scored predictions

## Database Schema

The PostgreSQL database includes:
- `users` - User authentication
- `satellites` - Space objects from Space-Track
- `tle_data` - Two-Line Element orbital data
- `collision_risks` - Detected collision events
- `data_imports` - Import history
- `user_subscriptions` - User watchlists
- `trajectory_predictions` - ML prediction results

## Security

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens for session management
- HTTP-only cookies for token storage
- Environment variables for sensitive data

## Development

```bash
# Development server with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

## License

This project uses data from Space-Track.org. Please review their terms of service at https://www.space-track.org

## Support

For Space-Track data questions: https://www.space-track.org/documentation
For system issues: Contact your administrator
