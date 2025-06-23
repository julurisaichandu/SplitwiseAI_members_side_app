// member-app/frontend/pages/my-requests.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

interface PendingRequest {
  _id: string;
  mongo_split_id: string;
  splitwise_expense_id: string;
  updated_by_name: string;
  proposed_changes: Array<{
    item_name: string;
    action: string;
  }>;
  status: string;
  admin_notes?: string;
  created_at: string;
  processed_at?: string;
}

export default function MyRequestsPage() {
  const { getToken } = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/member/my-requests', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch requests');
      }

      const result = await response.json();
      setRequests(result.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">My Update Requests</h1>
      
      {requests.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">
            You haven't made any update requests yet.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request._id} className="bg-white rounded-lg shadow-md border p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Split Request #{request.splitwise_expense_id}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Requested on {formatDate(request.created_at)}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(request.status)}`}>
                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                </span>
              </div>

              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Requested Changes:</h4>
                <ul className="space-y-1">
                  {request.proposed_changes.map((change, index) => (
                    <li key={index} className="text-sm text-gray-600">
                      • {change.action === 'join' ? 'Join' : 'Leave'} "{change.item_name}"
                    </li>
                  ))}
                </ul>
              </div>

              {request.admin_notes && (
                <div className="bg-gray-50 p-3 rounded">
                  <h4 className="font-medium text-gray-700 text-sm">Admin Notes:</h4>
                  <p className="text-sm text-gray-600 mt-1">{request.admin_notes}</p>
                </div>
              )}

              {request.processed_at && (
                <div className="text-xs text-gray-500 mt-2">
                  Processed on {formatDate(request.processed_at)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}