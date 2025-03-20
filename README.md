This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

This application requires a Firebase project with Firestore database for data persistence:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Set up a Firestore database in your project
3. Create two collections: `patches` and `gears`
4. Generate a web app configuration in Firebase Project Settings
5. Copy the `.env.example` file to `.env.local` and fill in your Firebase configuration

### Environment Variables

The following environment variables can be set in your `.env.local` file:

- `DEBUG_LOGGING` - Set to `true` to enable verbose debug logging (default: `false`)
- `NEXT_PUBLIC_APP_URL` - Base URL for the application (used for API calls in Edge Runtime)
- `NEXT_PUBLIC_FIREBASE_API_KEY` - Firebase API Key
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` - Firebase Auth Domain
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` - Firebase Project ID
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` - Firebase Storage Bucket
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` - Firebase Messaging Sender ID
- `NEXT_PUBLIC_FIREBASE_APP_ID` - Firebase App ID

### Data Migration

If you're migrating from the previous Redis/Vercel KV implementation:

1. Make sure you have both Redis KV and Firebase configurations in your `.env.local`
2. Run the development server
3. Visit `/api/kv-migrate` endpoint to migrate all data from Redis KV to Firestore

### Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

This project uses Jest for unit and integration testing. Run tests with:

```bash
npm test
```

### Test Coverage

Test coverage is set up using Jest's built-in coverage reporter. Several test coverage commands are available:

- `npm run test:coverage` - Run tests with console coverage report
- `npm run test:coverage:html` - Generate HTML coverage report
- `npm run test:coverage:open` - Generate HTML coverage report and open in browser
- `npm run test:coverage:ci` - Run coverage in CI mode (checks against thresholds)
- `npm run test:coverage:models` - Run coverage focused on model files only

Coverage reports are generated in the `coverage` directory and include:

- Line coverage - which lines of code were executed
- Statement coverage - which statements were executed
- Branch coverage - which branches of control structures were executed
- Function coverage - which functions were called

Coverage thresholds are set in `jest.config.js` to ensure minimum coverage requirements are met.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Real-time Updates

This project uses Firestore's real-time listeners to provide real-time updates to the UI. When data changes in Firestore, the UI will automatically update to reflect these changes.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.