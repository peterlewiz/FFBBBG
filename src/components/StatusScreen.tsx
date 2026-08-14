export function LoadingScreen({ label = "Loading league data from Sleeper..." }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-neon" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorScreen({
  message,
  heading = "Couldn't load league data",
}: {
  message: string;
  heading?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
      <p className="text-lg font-medium text-red-400">{heading}</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
    </div>
  );
}
