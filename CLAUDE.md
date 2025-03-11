# CLAUDE.md - patch.land

## Build Commands
- `npm run dev` - Start development server with turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Code Style
- **TypeScript**: Strict mode enabled, target ES2017
- **Imports**: Use named imports, type imports separate
- **Components**: React functional components with explicit typing
- **Error Handling**: Use try/catch with specific error messages
- **Naming**:
  - PascalCase for components, interfaces, types, classes
  - camelCase for variables, functions, methods
  - Explicit typing for function parameters and returns

## Framework
- Next.js 15.x with App Router
- React 19.x
- TailwindCSS for styling
- Path aliases: `@/*` maps to project root

## Architecture
- Models in `/lib/models`
- UI components in `/components`
- Shadcn UI components in `/components/ui`
- Pages in `/app` (Next.js App Router)
- ReactFlow for node-based interfaces

## Linting
- ESLint with Next.js recommended rules
- TypeScript ESLint plugin with unused vars as warnings

## Git Workflow
- Do not include Claude branding in commit messages, pull requests, or pull request reviews