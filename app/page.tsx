// This page should never render since middleware handles redirect,
// but provide a fallback for non-middleware environments
export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Please visit <a href="/patches" className="text-blue-500 underline">/patches</a></p>
    </div>
  );
}
