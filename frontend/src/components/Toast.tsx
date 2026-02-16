interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-900 border border-red-700 px-4 py-2 text-xs text-red-300 shadow-lg z-50 rounded">
      {message}
    </div>
  );
}
