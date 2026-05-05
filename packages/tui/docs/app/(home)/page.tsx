import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 p-8">
      <h1 className="text-4xl font-bold mb-4">TUI Internal Docs</h1>
      <p className="text-lg text-muted-foreground mb-6">
        Internal review documentation for @comma-agents/tui
      </p>
      <p>
        <Link href="/docs" className="font-medium underline">
          View Docs
        </Link>
      </p>
    </div>
  );
}
