// member-app/frontend/components/SplitDetail.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { API_BASE_URL } from '../lib/config';

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

interface SplitDetailProps {
  splitId: string;
}

const SplitDetail: React.FC<SplitDetailProps> = ({ splitId }) => {
  const { getToken } = useAuth();
  const [split, setSplit] = useState<Split | null>(null);
  const [memberName, setMemberName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchSplitDetail();
  }, [splitId]);

  const fetchSplitDetail = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/member/splits/${splitId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch split details');
      }

      const result = await response.json();
      setSplit(result.split);
      setMemberName(result.member_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const requestUpdate = async (itemName: string, action: 'join' | 'leave') => {
    try {
      setUpdating(itemName);
      const token = await getToken();
      
      const response = await fetch(`${API_BASE_URL}/api/member/request-update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          split_id: splitId,
          item_name: itemName,
          action: action
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit update request');
      }

      const result = await response.json();
      alert(`Update request submitted successfully! Status: ${result.status}`);
      
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUpdating(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !split) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Error: {error || 'Split not found'}</p>
        <button 
          onClick={() => window.history.back()}
          className="mt-2 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button 
          onClick={() => window.history.back()}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          ← Back to Dashboard
        </button>
        
        <div className="bg-white rounded-lg shadow-md border p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{split.description}</h1>
              <p className="text-gray-600 mt-1">
                {split.group_name} • {formatDate(split.created_at)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">
                {formatCurrency(split.total_amount)}
              </div>
              <div className="text-sm text-gray-600">
                Paid by {split.paid_by}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Items</h2>
        
        {split.items.map((item, index) => {
          const isParticipating = item.members.includes(memberName);
          const splitAmount = item.price / item.members.length;
          
          return (
            <div key={index} className="bg-white rounded-lg shadow-md border p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                  <p className="text-gray-600">
                    Total: {formatCurrency(item.price)} • 
                    Split among {item.members.length} people
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">
                    {formatCurrency(splitAmount)}
                  </div>
                  <div className="text-sm text-gray-600">per person</div>
                </div>
              </div>

              {/* Members */}
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Currently sharing:</h4>
                <div className="flex flex-wrap gap-2">
                  {item.members.map((member, memberIndex) => (
                    <span
                      key={memberIndex}
                      className={`px-3 py-1 rounded-full text-sm ${
                        member === memberName
                          ? 'bg-blue-100 text-blue-800 font-medium'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {member} {member === memberName && '(You)'}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {isParticipating ? (
                  <button
                    onClick={() => requestUpdate(item.name, 'leave')}
                    disabled={updating === item.name}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {updating === item.name ? 'Requesting...' : 'Leave Item'}
                  </button>
                ) : (
                  <button
                    onClick={() => requestUpdate(item.name, 'join')}
                    disabled={updating === item.name}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {updating === item.name ? 'Requesting...' : 'Join Item'}
                  </button>
                )}
                
                {isParticipating && (
                  <div className="flex items-center text-sm text-gray-600">
                    You owe: <span className="font-medium ml-1">{formatCurrency(splitAmount)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Summary</h3>
        <div className="flex justify-between items-center">
          <span className="text-gray-700">Total amount you owe:</span>
          <span className="text-2xl font-bold text-blue-600">
            {formatCurrency(split.member_splits[memberName] || 0)}
          </span>
        </div>
      </div>

      {/* Note */}
      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> Changes you request will be reviewed by an admin before being applied. 
          You'll be notified once your request is processed.
        </p>
      </div>
    </div>
  );
};

export default SplitDetail;