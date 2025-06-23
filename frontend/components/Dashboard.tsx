// member-app/frontend/components/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

interface Split {
  _id: string;
  splitwise_id: string;
  group_name: string;
  description: string;
  total_amount: number;
  paid_by: string;
  items: {
    name: string;
    price: number;
    members: string[];
  }[];
  member_splits: Record<string, number>;
  created_at: string;
}

interface DashboardData {
  splits: Split[];
  member_name: string;
  groups: string[];
}

const Dashboard: React.FC = () => {
  const { getToken } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSplits();
  }, []);

  const fetchSplits = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/member/splits', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch splits');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Error: {error}</p>
        <button 
          onClick={fetchSplits}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return <div>No data available</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {data.member_name}!
        </h1>
        <p className="text-gray-600 mt-2">
          Here are your recent splits across {data.groups.length} group(s)
        </p>
      </div>

      {data.splits.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">
            No splits found in your groups yet.
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {data.splits.map((split) => (
            <div key={split._id} className="bg-white rounded-lg shadow-md border border-gray-200">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {split.description}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {split.group_name} • {formatDate(split.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(split.total_amount)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Paid by {split.paid_by}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Your Items:</h4>
                  <div className="space-y-2">
                    {split.items.filter(item => 
                      item.members.includes(data.member_name)
                    ).map((item, index) => (
                      <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                        <div>
                          <span className="font-medium">{item.name}</span>
                          <span className="text-sm text-gray-600 ml-2">
                            (shared with {item.members.length} people)
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {formatCurrency(item.price / item.members.length)}
                          </div>
                          <div className="text-xs text-gray-500">
                            of {formatCurrency(item.price)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t bg-blue-50 p-3 rounded">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">Your Total:</span>
                      <span className="text-xl font-bold text-blue-600">
                        {formatCurrency(split.member_splits[data.member_name] || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => window.location.href = `/split/${split._id}`}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                  >
                    View Details & Update
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;