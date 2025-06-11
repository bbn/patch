# patch.land

A graphical reactive programming environment for building data processing pipelines. Create "patches" with connected nodes that transform and route data in real-time.

## What is patch.land?

patch.land is a visual programming platform where you build data processing workflows by connecting nodes in a graph. Each node represents a function or service, and data flows between them through edges. Think of it as a combination of:

- **Visual Programming**: Drag-and-drop interface for building workflows
- **Reactive Programming**: Real-time data flow with streaming execution
- **Microservices**: Connect local functions and external HTTP services
- **Real-time Updates**: Live execution monitoring via Server-Sent Events

## Quick Start

### 1. Installation

```bash
git clone https://github.com/your-org/patch.land.git
cd patch.land
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
# Firebase Configuration (for data persistence)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
# ... other Firebase config

# Optional
DEBUG_LOGGING=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the visual interface.

## Demo Patch

Try the included demo patch to see how the system works:

### Execute Demo Patch via API

```bash
curl -X POST http://localhost:3000/api/inlet/demo-simple \
  -H "Content-Type: application/json" \
  -d '{"msg": "Hello World"}'
```

### Expected Response

You'll receive a real-time stream showing execution events:

```
data: {"type":"RunStart","runId":"uuid","ts":1749598356177}

data: {"type":"NodeStart","nodeId":"echo","ts":1749598356177,"input":{"msg":"Hello World"}}

data: {"type":"NodeSuccess","nodeId":"echo","ts":1749598356178,"output":{"echo":"Hello World"}}

data: {"type":"NodeStart","nodeId":"reval","ts":1749598356178,"input":{"echo":"Hello World"}}

data: {"type":"NodeSuccess","nodeId":"reval","ts":1749598356179,"output":"done"}

data: {"type":"RunComplete","runId":"uuid","ts":1749598356179}
```

### What the Demo Shows

The demo patch (`patches/demo-simple.json`) demonstrates:

1. **Input Processing**: Receives `{"msg": "Hello World"}`
2. **Echo Node**: Transforms to `{"echo": "Hello World"}`  
3. **Revalidate Node**: Simulates cache invalidation, returns `"done"`
4. **Real-time Streaming**: Each step streamed via Server-Sent Events

Try different inputs:
```bash
# Different message
curl -X POST http://localhost:3000/api/inlet/demo-simple \
  -H "Content-Type: application/json" \
  -d '{"msg": "Testing the system"}'
```

## Key Concepts

### Patches
A **patch** is a data processing pipeline defined as a JSON file with:
- **Nodes**: Individual processing units (functions, HTTP services)
- **Edges**: Connections that define data flow between nodes

```json
{
  "nodes": [
    { "id": "echo", "kind": "local", "fn": "echoGear" },
    { "id": "api", "kind": "http", "url": "https://api.example.com/process" }
  ],
  "edges": [
    { "source": "echo", "target": "api" }
  ]
}
```

### Node Types
- **Local Nodes**: Execute JavaScript functions in the runtime
- **HTTP Nodes**: Send data to external HTTP endpoints
- **Gears**: Specialized nodes for AI/LLM processing

### Execution Model
- **Streaming**: Execution events streamed in real-time
- **Topological Ordering**: Nodes execute in dependency order
- **Error Handling**: Graceful error propagation and reporting

## Development

### Project Structure

```
├── app/                    # Next.js App Router pages
├── components/             # React components
├── lib/                   # Core models and utilities
│   ├── models/            # Data models (Gear, Patch, etc.)
│   └── database.ts        # Database abstraction
├── packages/              # Core runtime and processing
│   ├── runtime/           # Patch execution engine
│   ├── gears/             # Built-in processing functions
│   └── outlets/           # Output handlers
├── patches/               # Example patch definitions
└── tests/                 # Test suite
```

### Available Commands

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start           # Start production server

# Testing
npm test                # Run all tests
npm run test:coverage   # Run with coverage report
npm run test:mock-llm   # Run with mocked LLM responses

# Code Quality
npm run lint            # Run ESLint
```

### Creating Custom Nodes

#### 1. Local Functions

Add to `packages/runtime/localFns.ts`:

```typescript
import { registerLocalFn } from '@/packages/runtime/localFns';

registerLocalFn('myFunction', async (input: any) => {
  // Your processing logic
  return { processed: input };
});
```

#### 2. HTTP Endpoints

Reference external services in your patch:

```json
{
  "id": "external-api",
  "kind": "http", 
  "url": "https://api.example.com/process"
}
```

### Testing

The project includes comprehensive tests:

- **Unit Tests**: Individual components and functions
- **Integration Tests**: End-to-end patch execution
- **API Tests**: HTTP endpoint validation
- **Runtime Tests**: Patch execution engine

Run tests with coverage:

```bash
npm run test:coverage:open
```

## Architecture

### Runtime System
- **Patch Executor**: Runs patches with topological sorting
- **Local Function Registry**: Manages available processing functions  
- **Security**: SSRF protection for HTTP requests
- **Streaming**: Real-time execution event streaming

### Data Layer
- **Firebase Firestore**: Primary data store for patches and gears
- **Real-time Listeners**: Live UI updates via Firestore subscriptions
- **Database Abstraction**: Pluggable storage backend

### UI Components
- **ReactFlow**: Visual node-based patch editor
- **Real-time Chat**: Gear interaction interface
- **Patch Management**: CRUD operations for patches

## Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Set up Firestore database
3. Create collections: `patches`, `gears`
4. Configure authentication (optional)
5. Add Firebase configuration to `.env.local`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure tests pass: `npm test`
6. Submit a pull request

## License

[Your chosen license]

## Learn More

- **Next.js**: [https://nextjs.org/docs](https://nextjs.org/docs)
- **ReactFlow**: [https://reactflow.dev/](https://reactflow.dev/)
- **Firebase**: [https://firebase.google.com/docs](https://firebase.google.com/docs)