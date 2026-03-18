export function OnboardingPage() {
  // Onboarding wizard — Week 7
  // Step 1: Welcome + API key input
  // Step 2: Sync progress
  // Step 3: COGS input (optional)
  // Step 4: First insight summary
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-brand-700">Welcome to Percepta</h1>
          <p className="mt-2 text-gray-600">Let's connect your Takealot account</p>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Step 1: Connect Takealot</h2>
          <p className="mb-4 text-sm text-gray-600">
            Paste your Takealot Seller API key below. You can find it in your{' '}
            <a
              href="https://seller.takealot.com/api/seller-api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              Seller Portal &rarr; API Settings
            </a>
          </p>

          <div className="space-y-4">
            <input
              type="password"
              placeholder="Paste your API key here"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
              Test Connection
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Your API key is encrypted at rest using AES-256 and never shared with third parties.
          </p>
        </div>
      </div>
    </div>
  );
}
