import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 p-8">
      <h1 className="text-4xl font-bold mb-4">Comma Agents</h1>
      <p className="text-lg text-muted-foreground mb-6">
        Composable agent orchestration framework
      </p>
      <p>
        <Link href="/docs" className="font-medium underline">
          View API Reference
        </Link>
      </p>
    </div>
  );
}
