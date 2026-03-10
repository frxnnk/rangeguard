'use client';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Wallet Management</h2>
          <p className="text-sm text-gray-400 mb-4">
            Wallet private keys are managed via the CLI tool. Run the following command to add,
            list, or rotate wallets:
          </p>
          <code className="block bg-gray-800 text-green-400 px-4 py-3 rounded-lg text-sm font-mono">
            pnpm setup-keys
          </code>
          <p className="text-xs text-gray-500 mt-2">
            After adding a wallet to the vault, register it in the database through the Wallets page
            or API to make it available for pool assignment.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Monitoring Parameters</h2>
          <p className="text-sm text-gray-400 mb-4">
            These are configured via environment variables. Restart the bot after changes.
          </p>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Debounce Count</span>
              <code className="text-sm text-green-400 bg-gray-800 px-2 py-1 rounded">
                DEBOUNCE_COUNT=3
              </code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Polling Interval</span>
              <code className="text-sm text-green-400 bg-gray-800 px-2 py-1 rounded">
                POLLING_INTERVAL_MS=5000
              </code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Wallet Check Interval</span>
              <code className="text-sm text-green-400 bg-gray-800 px-2 py-1 rounded">
                WALLET_CHECK_INTERVAL_MS=30000
              </code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Cooldown (post-close)</span>
              <code className="text-sm text-green-400 bg-gray-800 px-2 py-1 rounded">
                COOLDOWN_MINUTES=5
              </code>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Hyperliquid</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">API URL</span>
              <code className="text-sm text-green-400 bg-gray-800 px-2 py-1 rounded text-xs">
                {process.env.HL_API_URL || 'https://api.hyperliquid-testnet.xyz'}
              </code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Environment</span>
              <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
                Testnet
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
