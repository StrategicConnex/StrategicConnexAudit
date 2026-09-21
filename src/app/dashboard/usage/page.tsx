import { getCurrentUser } from "@/shared/lib/auth";

export default async function UsagePage() {
  await getCurrentUser();
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">API Usage & Rate Limits</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <UsageCard 
          title="Requests (1min)" 
          used={12} 
          limit={60} 
        />
        <UsageCard 
          title="Requests (1hr)" 
          used={45} 
          limit={1000} 
        />
        <UsageCard 
          title="Requests (1day)" 
          used={230} 
          limit={10000} 
        />
      </div>

      <h2 className="text-xl font-semibold mb-4">Usage by Endpoint</h2>
      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-4">Endpoint</th>
              <th className="text-left p-4">Method</th>
              <th className="text-right p-4">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="p-4 font-mono text-sm">/api/monitoring</td>
              <td className="p-4">GET</td>
              <td className="p-4 text-right">45</td>
            </tr>
            <tr className="border-b">
              <td className="p-4 font-mono text-sm">/api/intelligence</td>
              <td className="p-4">POST</td>
              <td className="p-4 text-right">23</td>
            </tr>
            <tr className="border-b">
              <td className="p-4 font-mono text-sm">/api/remediation</td>
              <td className="p-4">GET</td>
              <td className="p-4 text-right">12</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsageCard({ title, used, limit }: { title: string; used: number; limit: number }) {
  const percent = Math.round((used / limit) * 100);
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-2xl font-bold mt-2">{used} / {limit}</p>
      <div className="mt-2 h-2 bg-gray-200 rounded-full">
        <div 
          className="h-2 bg-blue-500 rounded-full" 
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">{percent}% used</p>
    </div>
  );
}
