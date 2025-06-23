// member-app/frontend/components/AdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import ExpenseMigration from './ExpenseMigration';
import BulkExpenseMigration from './BulkExpenseMigration';
import BatchReviewComponent from './BatchReviewComponent';


interface PendingUpdate {
  _id: string;
  mongo_split_id: string;
  splitwise_expense_id: string;
  updated_by_email: string;
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

const AdminDashboard: React.FC = () => {
  const { getToken } = useAuth();
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<{ [key: string]: string }>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'migration' | 'requests' | 'batch'>('overview');


  useEffect(() => {
    fetchPendingUpdates();
  }, []);

  const fetchPendingUpdates = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/pending-updates', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch pending updates');
      }

      const result = await response.json();
      setPendingUpdates(result.updates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (updateId: string, action: 'approve' | 'reject') => {
    try {
      setProcessingId(updateId);
      const token = await getToken();
      
      const response = await fetch('/api/admin/approve-update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          update_id: updateId,
          action: action,
          admin_notes: adminNotes[updateId] || ''
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} update`);
      }

      const result = await response.json();
      alert(`Request ${action}ed successfully!`);
      
      // Refresh the list
      await fetchPendingUpdates();
      
      // Clear the admin notes for this request
      setAdminNotes(prev => {
        const updated = { ...prev };
        delete updated[updateId];
        return updated;
      });
      
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved': return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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
        <button 
          onClick={fetchPendingUpdates}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Manage member update requests and import Splitwise expenses
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'batch'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🔄 Batch Review
          </button>
          <button
            onClick={() => setActiveTab('migration')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'migration'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📥 Import Expenses
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'requests'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📝 Individual Requests {pendingUpdates.filter(u => u.status === 'pending').length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {pendingUpdates.filter(u => u.status === 'pending').length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
{activeTab === 'overview' && (
  <div>
    {/* Statistics - keep existing */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Keep existing statistics cards */}
    </div>

    {/* Updated Quick Actions */}
    <div className="bg-white rounded-lg shadow-md border p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveTab('batch')}
          className="bg-purple-100 hover:bg-purple-200 text-purple-800 px-4 py-3 rounded-lg font-medium"
        >
          🔄 Batch Review (NEW)
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-3 rounded-lg font-medium"
        >
          📝 Individual Requests ({pendingUpdates.filter(u => u.status === 'pending').length})
        </button>
        <button
          onClick={() => setActiveTab('migration')}
          className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-4 py-3 rounded-lg font-medium"
        >
          📥 Import Expenses
        </button>
        <button
          onClick={fetchPendingUpdates}
          className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-3 rounded-lg font-medium"
        >
          🔄 Refresh Data
        </button>
      </div>
    </div>
  </div>
)}
{activeTab === 'batch' && (
  <div>
    <BatchReviewComponent />
  </div>
)}
 {activeTab === 'migration' && (
  <div className="space-y-8">
    {/* Migration Tab Header */}
    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        📥 Splitwise Expense Import
      </h2>
      <p className="text-gray-600">
        Import individual expenses or bulk import multiple expenses from Splitwise.
      </p>
    </div>

    {/* Single and Bulk Import Side by Side */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ExpenseMigration />
      <BulkExpenseMigration />
    </div>
  </div>
)}

      {activeTab === 'requests' && (
        <div>
          {/* Pending Requests */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Pending Requests</h2>
            
            {pendingUpdates.filter(update => update.status === 'pending').length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <div className="text-gray-500 text-lg">
                  🎉 No pending requests! All caught up.
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingUpdates
                  .filter(update => update.status === 'pending')
                  .map((update) => (
                    <div key={update._id} className="bg-white rounded-lg shadow-md border border-yellow-200 p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900">
                            Request from {update.updated_by_name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {update.updated_by_email} • {formatDate(update.created_at)}
                          </p>
                          <p className="text-sm text-blue-600 mt-1">
                            Split ID: {update.splitwise_expense_id}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(update.status)}`}>
                          {update.status.charAt(0).toUpperCase() + update.status.slice(1)}
                        </span>
                      </div>

                      <div className="mb-4">
                        <h4 className="font-medium text-gray-700 mb-2">Requested Changes:</h4>
                        <ul className="space-y-1">
                          {update.proposed_changes.map((change, index) => (
                            <li key={index} className={`text-sm p-2 rounded ${
                              change.action === 'join' 
                                ? 'bg-green-50 text-green-800' 
                                : 'bg-red-50 text-red-800'
                            }`}>
                              <span className="font-medium">
                                {change.action === 'join' ? '➕ Join' : '➖ Leave'}
                              </span> "{change.item_name}"
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Admin Notes Input */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Admin Notes (optional):
                        </label>
                        <textarea
                          value={adminNotes[update._id] || ''}
                          onChange={(e) => setAdminNotes(prev => ({
                            ...prev,
                            [update._id]: e.target.value
                          }))}
                          placeholder="Add notes about this decision..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApproval(update._id, 'approve')}
                          disabled={processingId === update._id}
                          className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                        >
                          {processingId === update._id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Processing...
                            </>
                          ) : (
                            '✅ Approve'
                          )}
                        </button>
                        
                        <button
                          onClick={() => handleApproval(update._id, 'reject')}
                          disabled={processingId === update._id}
                          className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          ❌ Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Recent Processed Requests */}
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Recent Processed Requests</h2>
            
            {pendingUpdates.filter(update => update.status !== 'pending').length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <div className="text-gray-500">No processed requests yet.</div>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingUpdates
                  .filter(update => update.status !== 'pending')
                  .slice(0, 5) // Show only last 5
                  .map((update) => (
                    <div key={update._id} className="bg-white rounded-lg shadow-sm border p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {update.updated_by_name} • Split {update.splitwise_expense_id}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Processed on {update.processed_at ? formatDate(update.processed_at) : 'Unknown'}
                          </p>
                          {update.admin_notes && (
                            <p className="text-sm text-gray-700 mt-1 italic">
                              Note: {update.admin_notes}
                            </p>
                          )}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(update.status)}`}>
                          {update.status.charAt(0).toUpperCase() + update.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;